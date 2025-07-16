# Alfresco Bulk Downloader

A robust Node.js application for downloading large folder structures from Alfresco with resume capability, progress tracking, and automated retry logic.

## 🎯 Purpose

This tool was designed to download massive folder structures from Alfresco (4,000+ folders with thousands of files) while maintaining the exact folder hierarchy and file names. Perfect for bulk exports, backups, or migrations.

## ✨ Features

- **🔍 Smart Discovery**: Maps entire folder structure before downloading
- **📁 Preserves Structure**: Maintains exact folder hierarchy and file names
- **🔄 Resume Capability**: Continue downloads from where you left off
- **📊 Progress Tracking**: Real-time progress with ETA calculations
- **⚡ Concurrent Downloads**: Configurable batch processing for speed
- **🛡️ Error Handling**: Automatic retry logic and graceful failure handling
- **💾 Checkpoint System**: Saves progress incrementally to prevent data loss
- **🧪 Testing Mode**: Limit folders for testing before full run

## 📋 Prerequisites

- Node.js 14+ installed
- Access to Alfresco server with username/password
- Sufficient local disk space for downloads

## 🚀 Quick Start

### 1. Installation
```bash
git clone <repository-url>
cd alfresco-downloader
npm install
```

```📁 Project Structure
alfresco-downloader/
├── src/
│   ├── auth.js              # Alfresco authentication
│   ├── discovery.js         # Folder structure mapping
│   ├── downloader.js        # File download with resume
│   ├── progress-tracker.js  # Logging and progress tracking
│   └── main.js             # Main orchestrator
├── logs/
│   ├── discovery.json       # Complete folder/file inventory
│   └── download-progress.txt # Download progress log
├── config.json            # Configuration settings
└── package.json
```

### 2. Configuration
#### Alfresco Settings

- baseUrl: Your Alfresco server URL
- username: Alfresco username
- password: Alfresco password
- nodeId: Root folder node ID to download from

#### Download Settings

- localPath: Where to save downloaded files
- batchSize: Number of concurrent downloads (1-5 recommended)
- retryAttempts: How many times to retry failed downloads
- timeoutMs: Download timeout in milliseconds

### 3. Testing Mode
For testing with limited folders, edit src/discovery.js:

### 4. How it Works
Phase 1: Discovery

Connects to Alfresco REST API
Recursively maps all folders and files
Handles pagination for large datasets
Saves complete inventory to logs/discovery.json
Creates checkpoints every 50 folders

Phase 2: Download

Reads discovery inventory
Checks existing progress for resume capability
Downloads files in configurable batches
Recreates exact folder structure locally
Logs progress for resume functionality
Shows real-time progress with ETA


### 5. 📈 Progress Tracking
Monitor your download with real-time updates:
```
📊 PROGRESS UPDATE:
├── Files: 1,250/4,500 (27.8%)
├── Folders: 150/400  
├── Downloaded: 2.1GB / 7.5GB
├── Speed: 12.5 files/sec
├── Failed: 3
└── ETA: 2h 15m 30s
```
