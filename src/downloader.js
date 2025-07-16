const fs = require('fs-extra');
const path = require('path');
const config = require('../config.json');
const AlfrescoAuth = require('./auth');
const ProgressTracker = require('./progress-tracker');

class AlfrescoDownloader {
    constructor() {
        this.auth = new AlfrescoAuth(
            config.alfresco.baseUrl,
            config.alfresco.username,
            config.alfresco.password
        );
        this.axiosInstance = this.auth.createAxiosInstance();
        this.tracker = new ProgressTracker(
            config.logging.discoveryFile,
            config.logging.progressFile
        );

        // Download settings
        this.downloadPath = config.download.localPath;
        this.batchSize = config.download.batchSize || 3; // Concurrent downloads
        this.retryAttempts = config.download.retryAttempts || 3;
        this.timeoutMs = config.download.timeoutMs || 30000;

        // Progress tracking
        this.stats = {
            totalFolders: 0,
            totalFiles: 0,
            completedFolders: 0,
            completedFiles: 0,
            failedFiles: 0,
            totalBytes: 0,
            downloadedBytes: 0,
            startTime: null
        };

        // Resume data
        this.completedFolders = new Set();
        this.completedFiles = new Set();
    }

    async loadDiscoveryAndProgress() {
        console.log('📋 Loading discovery data...');

        // Load discovery
        const discovery = await this.tracker.loadDiscovery();
        this.stats.totalFolders = discovery.totalFolders;
        this.stats.totalFiles = discovery.totalFiles;
        this.stats.totalBytes = discovery.estimatedSize;

        console.log(`📊 Discovery loaded: ${this.stats.totalFolders} folders, ${this.stats.totalFiles} files`);

        // Load existing progress
        const progress = await this.tracker.getCompletedItems();
        this.completedFolders = progress.completedFolders;
        this.completedFiles = progress.completedFiles;
        this.stats.completedFolders = this.completedFolders.size;
        this.stats.completedFiles = this.completedFiles.size;

        if (this.stats.completedFiles > 0) {
            console.log(`🔄 Resuming: ${this.stats.completedFiles} files already downloaded`);
        }

        return discovery;
    }

    async downloadFile(nodeId, localFilePath, fileSize = 0, retryCount = 0) {
        try {
            // Check if file already exists and has correct size
            if (await fs.pathExists(localFilePath)) {
                const existingStats = await fs.stat(localFilePath);
                if (existingStats.size === fileSize && fileSize > 0) {
                    console.log(`⏭️  Skipping existing file: ${path.basename(localFilePath)}`);
                    return true;
                }
            }

            // Ensure directory exists
            await fs.ensureDir(path.dirname(localFilePath));

            // Download file
            const url = `/api/-default-/public/alfresco/versions/1/nodes/${nodeId}/content`;
            console.log(`⬇️  Downloading: ${path.basename(localFilePath)} (${this.formatFileSize(fileSize)})`);

            const response = await this.axiosInstance.get(url, {
                responseType: 'stream',
                timeout: this.timeoutMs
            });

            // Create write stream
            const writer = fs.createWriteStream(localFilePath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                let downloadedBytes = 0;

                response.data.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    this.stats.downloadedBytes += chunk.length;
                });

                writer.on('finish', () => {
                    console.log(`✅ Downloaded: ${path.basename(localFilePath)}`);
                    resolve(true);
                });

                writer.on('error', (error) => {
                    console.error(`❌ Write error: ${path.basename(localFilePath)} - ${error.message}`);
                    reject(error);
                });

                response.data.on('error', (error) => {
                    console.error(`❌ Download error: ${path.basename(localFilePath)} - ${error.message}`);
                    reject(error);
                });
            });

        } catch (error) {
            if (retryCount < this.retryAttempts) {
                console.log(`🔄 Retry ${retryCount + 1}/${this.retryAttempts}: ${path.basename(localFilePath)}`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return this.downloadFile(nodeId, localFilePath, fileSize, retryCount + 1);
            } else {
                console.error(`💥 Failed after ${this.retryAttempts} attempts: ${path.basename(localFilePath)}`);
                this.stats.failedFiles++;
                await this.tracker.logProgress(`FILE_FAILED | ${localFilePath} | ${error.message}`);
                return false;
            }
        }
    }

    async downloadFolder(folderInfo, basePath = '') {
        const currentFolderPath = path.join(basePath, folderInfo.path || '');

        // Check if folder already completed
        if (this.completedFolders.has(currentFolderPath)) {
            console.log(`⏭️  Skipping completed folder: ${currentFolderPath}`);
            return;
        }

        console.log(`\n📁 Processing folder: ${currentFolderPath}`);
        await this.tracker.logProgress(`FOLDER_START | ${currentFolderPath}`);

        // Ensure local folder exists
        const localFolderPath = path.join(this.downloadPath, currentFolderPath);
        await fs.ensureDir(localFolderPath);

        // Download files in this folder
        const filesToDownload = folderInfo.files.filter(file => {
            const filePath = path.join(currentFolderPath, file.name);
            return !this.completedFiles.has(filePath);
        });

        console.log(`📄 Files to download: ${filesToDownload.length}/${folderInfo.files.length}`);

        // Download files in batches
        for (let i = 0; i < filesToDownload.length; i += this.batchSize) {
            const batch = filesToDownload.slice(i, i + this.batchSize);
            const downloadPromises = batch.map(async (file) => {
                const localFilePath = path.join(localFolderPath, file.name);
                const filePath = path.join(currentFolderPath, file.name);

                const success = await this.downloadFile(file.nodeId, localFilePath, file.size);
                if (success) {
                    this.stats.completedFiles++;
                    await this.tracker.logProgress(`FILE_DOWNLOADED | ${filePath} | ${this.formatFileSize(file.size)}`);
                }

                // Progress update
                this.showProgress();
            });

            await Promise.all(downloadPromises);

            // Small delay between batches
            if (i + this.batchSize < filesToDownload.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Process subfolders recursively
        for (const subfolder of folderInfo.subfolders) {
            if (subfolder.limitReached) continue;
            await this.downloadFolder(subfolder, basePath);
        }

        // Mark folder as complete
        this.stats.completedFolders++;
        await this.tracker.logProgress(`FOLDER_COMPLETE | ${currentFolderPath}`);
        this.completedFolders.add(currentFolderPath);

        console.log(`✅ Folder complete: ${currentFolderPath}`);
    }

    showProgress() {
        const elapsed = Date.now() - this.stats.startTime;
        const elapsedSeconds = elapsed / 1000;
        const filesPerSecond = this.stats.completedFiles / elapsedSeconds;
        const remainingFiles = this.stats.totalFiles - this.stats.completedFiles;
        const estimatedTimeRemaining = remainingFiles / filesPerSecond;

        const progressPercent = ((this.stats.completedFiles / this.stats.totalFiles) * 100).toFixed(1);
        const downloadedMB = (this.stats.downloadedBytes / (1024 * 1024)).toFixed(1);
        const totalMB = (this.stats.totalBytes / (1024 * 1024)).toFixed(1);

        console.log(`\n📊 PROGRESS UPDATE:`);
        console.log(`├── Files: ${this.stats.completedFiles}/${this.stats.totalFiles} (${progressPercent}%)`);
        console.log(`├── Folders: ${this.stats.completedFolders}/${this.stats.totalFolders}`);
        console.log(`├── Downloaded: ${downloadedMB}MB / ${totalMB}MB`);
        console.log(`├── Speed: ${filesPerSecond.toFixed(1)} files/sec`);
        console.log(`├── Failed: ${this.stats.failedFiles}`);
        console.log(`└── ETA: ${this.formatTime(estimatedTimeRemaining)}\n`);
    }

    formatTime(seconds) {
        if (!isFinite(seconds)) return 'Unknown';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours}h ${minutes}m ${secs}s`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async startDownload() {
        console.log('🚀 Starting download process...');

        try {
            // Test connection
            console.log('🔗 Testing connection...');
            const connectionOk = await this.auth.testConnection();
            if (!connectionOk) {
                throw new Error('Cannot connect to Alfresco. Check your credentials.');
            }

            // Load discovery and progress
            const discovery = await this.loadDiscoveryAndProgress();

            // Ensure download directory exists
            await fs.ensureDir(this.downloadPath);
            console.log(`📂 Download path: ${this.downloadPath}`);

            // Start download
            this.stats.startTime = Date.now();
            console.log(`⏰ Started at: ${new Date().toISOString()}`);

            await this.downloadFolder(discovery.structure, '');

            // Final summary
            const totalTime = (Date.now() - this.stats.startTime) / 1000;
            console.log('\n🎉 DOWNLOAD COMPLETE!');
            console.log(`├── Total files downloaded: ${this.stats.completedFiles}`);
            console.log(`├── Total folders processed: ${this.stats.completedFolders}`);
            console.log(`├── Failed files: ${this.stats.failedFiles}`);
            console.log(`├── Total time: ${this.formatTime(totalTime)}`);
            console.log(`├── Average speed: ${(this.stats.completedFiles / totalTime).toFixed(1)} files/sec`);
            console.log(`└── Downloaded to: ${this.downloadPath}`);

        } catch (error) {
            console.error('❌ Download failed:', error.message);
            process.exit(1);
        }
    }
}

if (require.main === module) {
    const downloader = new AlfrescoDownloader();
    downloader.startDownload();
}

module.exports = AlfrescoDownloader;