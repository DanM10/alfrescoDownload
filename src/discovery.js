const fs = require('fs-extra');
const config = require('../config.json');
const AlfrescoAuth = require('./auth');
const ProgressTracker = require('./progress-tracker');

class AlfrescoDiscovery {
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
        this.discoveryData = {
            timestamp: new Date().toISOString(),
            rootNodeId: config.alfresco.nodeId,
            totalFolders: 0,
            totalFiles: 0,
            estimatedSize: 0,
            structure: []
        };

        this.checkpointInterval = 50;
        this.lastCheckpoint = 0;


        this.MAX_FOLDERS_FOR_TESTING = 400;
        this.foldersProcessed = 0;
    }

    async saveCheckpoint() {
        if (this.discoveryData.totalFolders - this.lastCheckpoint >= this.checkpointInterval) {
            console.log(`💾 Saving checkpoint at ${this.discoveryData.totalFolders} folders...`);
            await this.tracker.saveDiscovery(this.discoveryData);
            this.lastCheckpoint = this.discoveryData.totalFolders;
            console.log(`✅ Checkpoint saved!`);
        }
    }

    checkTestingLimit() {
        if (this.MAX_FOLDERS_FOR_TESTING && this.foldersProcessed >= this.MAX_FOLDERS_FOR_TESTING) {
            console.log(`\n🛑 TESTING LIMIT REACHED: ${this.MAX_FOLDERS_FOR_TESTING} folders`);
            console.log(`📝 To process all folders, change MAX_FOLDERS_FOR_TESTING to null in discovery.js`);
            return true;
        }
        return false;
    }

    async getAllNodeChildren(nodeId, nodePath = '') {
        let allChildren = [];
        let skipCount = 0;
        const maxItems = 500;
        let hasMoreItems = true;
        let pageNumber = 1;

        console.log(`🔍 Starting pagination for: ${nodePath || 'ROOT'}`);

        while (hasMoreItems) {
            try {
                const url = `/api/-default-/public/alfresco/versions/1/nodes/${nodeId}/children`;
                const params = {
                    skipCount: skipCount,
                    maxItems: maxItems
                };

                console.log(`   📄 Page ${pageNumber}: Getting items ${skipCount + 1}-${skipCount + maxItems}`);

                const response = await this.axiosInstance.get(url, { params });
                const entries = response.data.list.entries;
                const pagination = response.data.list.pagination;

                allChildren = allChildren.concat(entries);

                hasMoreItems = pagination.hasMoreItems;
                skipCount += maxItems;
                pageNumber++;

                console.log(`   ✅ Page ${pageNumber - 1}: Got ${entries.length} items. Running total: ${allChildren.length}`);

                if (pageNumber % 5 === 0 || !hasMoreItems) {
                    console.log(`   🎯 Progress: ${allChildren.length} items found so far...`);
                }

                if (hasMoreItems) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

            } catch (error) {
                console.error(`❌ Error on page ${pageNumber} for node ${nodeId}:`, error.message);

                if (error.response?.status === 429) {
                    console.log(`⏳ Rate limited. Waiting 2 seconds before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }

                throw error;
            }
        }

        console.log(`✅ Pagination complete for ${nodePath || 'ROOT'}: ${allChildren.length} total items`);
        return allChildren;
    }

    async exploreNodeRecursive(nodeId, currentPath = '', depth = 0) {
        // Check testing limit
        if (this.checkTestingLimit()) {
            return {
                path: currentPath,
                nodeId: nodeId,
                files: [],
                subfolders: [],
                limitReached: true
            };
        }

        const indent = '  '.repeat(depth);
        console.log(`\n${indent}🔍 Exploring: ${currentPath || 'ROOT'} (depth: ${depth})`);

        const children = await this.getAllNodeChildren(nodeId, currentPath);
        const folderInfo = {
            path: currentPath,
            nodeId: nodeId,
            files: [],
            subfolders: []
        };

        const folders = [];
        const files = [];

        for (const child of children) {
            const node = child.entry;
            if (node.nodeType === 'cm:folder') {
                folders.push(node);
            } else if (node.nodeType === 'cm:content') {
                files.push(node);
            }
        }

        console.log(`${indent}📊 Found ${folders.length} folders and ${files.length} files in this level`);

        // Process files first
        for (const node of files) {
            const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;

            this.discoveryData.totalFiles++;
            this.discoveryData.estimatedSize += node.content?.sizeInBytes || 0;

            folderInfo.files.push({
                name: node.name,
                nodeId: node.id,
                size: node.content?.sizeInBytes || 0,
                mimeType: node.content?.mimeType || 'unknown'
            });

            if (this.discoveryData.totalFiles % 10 === 0) {
                console.log(`${indent}📄 Files processed: ${this.discoveryData.totalFiles}`);
            }
        }

        // Process folders recursively
        for (let i = 0; i < folders.length; i++) {
            // Check limit before processing each folder
            if (this.checkTestingLimit()) {
                console.log(`${indent}🛑 Stopping folder processing due to testing limit`);
                break;
            }

            const node = folders[i];
            const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;

            this.discoveryData.totalFolders++;
            this.foldersProcessed++;

            console.log(`${indent}📁 [${i + 1}/${folders.length}] Processing folder: ${node.name}`);
            console.log(`${indent}📈 Progress: ${this.discoveryData.totalFolders} folders, ${this.discoveryData.totalFiles} files`);

            // Save checkpoint
            await this.saveCheckpoint();

            // Recursively explore subfolder
            const subfolderInfo = await this.exploreNodeRecursive(node.id, nodePath, depth + 1);
            folderInfo.subfolders.push(subfolderInfo);

            // If limit was reached in recursion, stop here
            if (subfolderInfo.limitReached) {
                break;
            }
        }

        return folderInfo;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async startDiscovery() {
        console.log('🚀 Starting discovery process...');
        console.log(`📍 Root Node ID: ${config.alfresco.nodeId}`);
        console.log(`📄 Page size: 500 items per request`);

        if (this.MAX_FOLDERS_FOR_TESTING) {
            console.log(`🧪 TESTING MODE: Limited to ${this.MAX_FOLDERS_FOR_TESTING} folders`);
            console.log(`🔧 To run full discovery, change MAX_FOLDERS_FOR_TESTING to null`);
        }

        try {
            console.log('🔗 Testing connection...');
            const connectionOk = await this.auth.testConnection();
            if (!connectionOk) {
                throw new Error('Cannot connect to Alfresco. Check your credentials.');
            }

            const startTime = Date.now();
            this.discoveryData.structure = await this.exploreNodeRecursive(config.alfresco.nodeId);
            const endTime = Date.now();

            // Final save
            this.discoveryData.discoveryDuration = `${(endTime - startTime) / 1000} seconds`;
            this.discoveryData.testingMode = !!this.MAX_FOLDERS_FOR_TESTING;
            this.discoveryData.testingLimit = this.MAX_FOLDERS_FOR_TESTING;
            await this.tracker.saveDiscovery(this.discoveryData);

            console.log('\n🎉 DISCOVERY COMPLETE!');
            console.log(`├── Total folders: ${this.discoveryData.totalFolders}`);
            console.log(`├── Total files: ${this.discoveryData.totalFiles}`);
            console.log(`├── Estimated size: ${this.formatFileSize(this.discoveryData.estimatedSize)}`);
            console.log(`├── Duration: ${this.discoveryData.discoveryDuration}`);

            if (this.MAX_FOLDERS_FOR_TESTING) {
                console.log(`├── 🧪 Testing mode: ${this.MAX_FOLDERS_FOR_TESTING} folder limit`);
            }

            console.log(`└── Results saved to: ${config.logging.discoveryFile}`);

        } catch (error) {
            console.error('❌ Discovery failed:', error.message);
            // Save what we have so far
            if (this.discoveryData.totalFolders > 0) {
                console.log('💾 Saving partial results...');
                await this.tracker.saveDiscovery(this.discoveryData);
            }
            process.exit(1);
        }
    }
}

if (require.main === module) {
    const discovery = new AlfrescoDiscovery();
    discovery.startDiscovery();
}

module.exports = AlfrescoDiscovery;