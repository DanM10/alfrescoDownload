const fs = require('fs-extra');
const path = require('path');

class ProgressTracker {
    constructor(discoveryFile, progressFile) {
        this.discoveryFile = discoveryFile;
        this.progressFile = progressFile;
        this.ensureLogDirectories();
    }

    async ensureLogDirectories() {
        await fs.ensureDir(path.dirname(this.discoveryFile));
        await fs.ensureDir(path.dirname(this.progressFile));
    }

    async saveDiscovery(discoveryData) {
        await fs.writeJson(this.discoveryFile, discoveryData, { spaces: 2 });
        console.log(`Discovery saved to: ${this.discoveryFile}`);
    }

    async loadDiscovery() {
        try {
            return await fs.readJson(this.discoveryFile);
        } catch (error) {
            throw new Error(`Discovery file not found. Please run discovery first.`);
        }
    }

    async logProgress(message) {
        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} | ${message}\n`;
        await fs.appendFile(this.progressFile, logEntry);
        console.log(logEntry.trim());
    }

    async getCompletedItems() {
        try {
            const content = await fs.readFile(this.progressFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());

            const completedFolders = new Set();
            const completedFiles = new Set();

            lines.forEach(line => {
                if (line.includes('FOLDER_COMPLETE')) {
                    const folderPath = line.split(' | ')[2];
                    completedFolders.add(folderPath);
                } else if (line.includes('FILE_DOWNLOADED')) {
                    const filePath = line.split(' | ')[2];
                    completedFiles.add(filePath);
                }
            });

            return { completedFolders, completedFiles };
        } catch (error) {
            return { completedFolders: new Set(), completedFiles: new Set() };
        }
    }
}

module.exports = ProgressTracker;