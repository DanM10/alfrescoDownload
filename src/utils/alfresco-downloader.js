// src/utils/alfresco-downloader.js
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import Helpers from './helpers.js';
import HttpClient from './http-client.js';
import ErrorLogger from "./error-logger.js";

class AlfrescoDownloader {
    constructor(systemConfig, projectConfig, assetsData) {
        this.systemConfig = systemConfig;
        this.projectConfig = projectConfig;
        this.assetsData = assetsData;
        this.downloadConfig = projectConfig.download;
        this.errorLogger = new ErrorLogger();
        this.stats = {
            totalAssets: 0,
            processedAssets: 0,
            totalPhotos: 0,
            downloadedPhotos: 0,
            errors: 0,
            skipped: 0
        };
    }

    async saveAssetsProgress() {
        try {
            const AssetsDownloader = (await import('./assets-downloader.js')).default;
            const assetsDownloader = new AssetsDownloader(this.systemConfig, this.projectConfig);
            assetsDownloader.allAssets = this.assetsData;
            await assetsDownloader.saveAssetsData();
        } catch (error) {
            console.log(chalk.yellow(`⚠️ No se pudo guardar progreso: ${error.message}`));
        }
    }

    async downloadAllPhotos() {
        Helpers.clearScreen();
        Helpers.showHeader('DESCARGA DE FOTOS DESDE ALFRESCO', '📷');

        if (!this.validateConfig()) {
            return false;
        }

        const pendingAssets = this.assetsData.filter(asset => !asset.estaDescargada);
        const completedAssets = this.assetsData.filter(asset => asset.estaDescargada);

        this.stats.totalAssets = this.assetsData.length;
        this.stats.resumed = completedAssets.length;

        console.log(chalk.cyan(`📊 Estado de descarga:`));
        console.log(`   ├─ Total de activos: ${this.stats.totalAssets}`);
        console.log(`   ├─ Ya completados: ${chalk.green(completedAssets.length)}`);
        console.log(`   └─ Por descargar: ${chalk.blue(pendingAssets.length)}\n`);

        if (pendingAssets.length === 0) {
            console.log(chalk.green('🎉 ¡Todos los activos ya han sido descargados!'));
            return true;
        }

        try {
            await fs.ensureDir(this.downloadConfig.localPath);

            await this.errorLogger.logSession(`Iniciando descarga de fotos: ${pendingAssets.length} activos pendientes`);

            for (let i = 0; i < pendingAssets.length; i++) {
                const asset = pendingAssets[i];
                const originalIndex = this.assetsData.findIndex(a => a.alfrescoId === asset.alfrescoId);

                const success = await this.processAsset(asset, i + 1, pendingAssets.length);

                if (success) {
                    this.assetsData[originalIndex].estaDescargada = true;
                    await this.saveAssetsProgress();
                }

                if ((i + 1) % 10 === 0 || i === pendingAssets.length - 1) {
                    this.showProgress(pendingAssets.length);
                }

                await this.sleep(100);
            }

            this.showFinalStats();
            return true;

        } catch (error) {
            await this.errorLogger.logError({ etiqueta: 'SYSTEM', alfrescoId: 'N/A' }, error, 'photo-download');
            Helpers.showError(`Error durante la descarga: ${error.message}`);
            return false;
        }
    }

    validateConfig() {
        const issues = [];

        if (!this.systemConfig.alfresco.baseUrl) issues.push('URL de Alfresco no configurada');
        if (!this.systemConfig.alfresco.username) issues.push('Usuario de Alfresco no configurado');
        if (!this.systemConfig.alfresco.password) issues.push('Contraseña de Alfresco no configurada');
        if (!this.downloadConfig.localPath) issues.push('Ruta de descarga no configurada');
        if (!this.assetsData || this.assetsData.length === 0) issues.push('No hay datos de activos para procesar');

        if (issues.length > 0) {
            Helpers.showError('Configuración incompleta:');
            issues.forEach(issue => {
                console.log(`   └─ ${chalk.red(issue)}`);
            });
            return false;
        }

        return true;
    }

    async processAsset(asset, currentIndex, totalPending) {
        try {
            console.log(chalk.blue(`\n[${currentIndex}/${totalPending}] Procesando: ${asset.etiqueta}`));

            // Obtener contenido de la carpeta del activo
            const folderContent = await this.getFolderContent(asset.alfrescoId);

            if (!folderContent.success) {
                console.log(chalk.red(`   └─ Error obteniendo contenido: ${folderContent.message}`));
                await this.errorLogger.logError(asset, new Error(folderContent.message), 'folder-access');
                this.stats.errors++;
                return false;
            }

            const files = folderContent.files;

            if (files.length === 0) {
                console.log(chalk.yellow(`   └─ Sin archivos en la carpeta`));
                this.stats.skipped++;
                return true;
            }

            console.log(chalk.gray(`   └─ Encontrados ${files.length} archivo(s)`));

            // Crear carpeta de destino
            const targetFolder = this.createTargetFolderPath(asset);
            await fs.ensureDir(targetFolder);

            // Descargar cada archivo
            let downloadedFilesCount = 0;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const targetFileName = this.createTargetFileName(asset, file, i + 1);
                const targetPath = path.join(targetFolder, targetFileName);

                const downloaded = await this.downloadFile(file, targetPath, asset);
                if (downloaded) {
                    this.stats.downloadedPhotos++;
                    downloadedFilesCount++;
                } else {
                    this.stats.errors++;
                }
            }

            this.stats.processedAssets++;
            this.stats.totalPhotos += files.length;

            return downloadedFilesCount > 0 || files.length === 0;

        } catch (error) {
            console.log(chalk.red(`   └─ Error procesando activo: ${error.message}`));
            await this.errorLogger.logError(asset, error, 'asset-processing');
            this.stats.errors++;
            return false;
        }
    }

    async getFolderContent(alfrescoId) {
        try {
            const url = `${this.systemConfig.alfresco.baseUrl}/api/-default-/public/alfresco/versions/1/nodes/${alfrescoId}/children`;

            const credentials = {
                type: 'basic',
                username: this.systemConfig.alfresco.username,
                password: this.systemConfig.alfresco.password
            };

            const result = await HttpClient.makeAuthenticatedRequest(url, credentials, {
                timeout: 15000
            });

            if (result.success && result.data && result.data.list) {
                const entries = result.data.list.entries || [];
                const totalItems = result.data.list.pagination?.totalItems || 0;

                if (totalItems === 0) {
                    return { success: true, files: [] };
                }

                // Filtrar solo archivos (no carpetas)
                const files = entries
                    .filter(entry => entry.entry && !entry.entry.isFolder)
                    .map(entry => entry.entry);

                return { success: true, files: files };
            } else {
                return { success: false, message: result.message || 'Respuesta inválida' };
            }

        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async downloadFile(fileInfo, targetPath, asset) {
        try {
            const url = `${this.systemConfig.alfresco.baseUrl}/api/-default-/public/alfresco/versions/1/nodes/${fileInfo.id}/content`;

            const credentials = {
                type: 'basic',
                username: this.systemConfig.alfresco.username,
                password: this.systemConfig.alfresco.password
            };

            // Verificar si ya existe
            if (await fs.pathExists(targetPath)) {
                const stats = await fs.stat(targetPath);
                if (stats.size === fileInfo.content?.sizeInBytes) {
                    console.log(chalk.gray(`      └─ Ya existe: ${path.basename(targetPath)}`));
                    return true;
                }
            }

            const result = await HttpClient.makeAuthenticatedRequest(url, credentials, {
                timeout: 30000,
                responseType: 'stream'
            });

            if (result.success) {
                // Guardar el archivo
                const writer = fs.createWriteStream(targetPath);
                result.data.pipe(writer);

                return new Promise((resolve) => {
                    writer.on('finish', () => {
                        const sizeKB = (fileInfo.content?.sizeInBytes / 1024).toFixed(1);
                        console.log(chalk.green(`      └─ Descargado: ${path.basename(targetPath)} (${sizeKB} KB)`));
                        resolve(true);
                    });

                    writer.on('error', async (error) => {
                        console.log(chalk.red(`      └─ Error guardando: ${error.message}`));
                        await this.errorLogger.logError(asset, error, 'file-save');
                        resolve(false);
                    });
                });
            } else {
                const error = new Error(result.message);
                console.log(chalk.red(`      └─ Error descargando: ${result.message}`));
                await this.errorLogger.logError(asset, error, 'file-download');
                return false;
            }

        } catch (error) {
            console.log(chalk.red(`      └─ Error: ${error.message}`));
            await this.errorLogger.logError(asset, error, 'file-download');
            return false;
        }
    }

    createTargetFolderPath(asset) {
        const basePath = this.downloadConfig.localPath;

        if (this.downloadConfig.cambiarNombre && asset.cambiarNombre) {
            const folderName = `${asset.nuevoNombre}-${asset.etiqueta}`;

            return path.join(basePath, this.sanitizeFolderName(folderName));
        } else {
            // Usar etiqueta como nombre de carpeta
            return path.join(basePath, this.sanitizeFolderName(asset.etiqueta));
        }
    }

    createTargetFileName(asset, fileInfo, contador) {
        if (this.downloadConfig.cambiarNombre && asset.cambiarNombre) {
            // Obtener extensión del archivo original
            const extension = path.extname(fileInfo.name);
            return `${asset.nuevoNombre}-${contador}${extension}`;
        } else {
            // Mantener nombre original
            return fileInfo.name;
        }
    }

    sanitizeFolderName(name) {
        // Limpiar caracteres no válidos para nombres de carpeta
        return name.replace(/[<>:"/\\|?*]/g, '_').trim();
    }

    showProgress(totalPending) {
        const processedPercent = ((this.stats.processedAssets / totalPending) * 100).toFixed(1);

        console.log(chalk.cyan(`\n📊 Progreso: ${this.stats.processedAssets}/${totalPending} activos pendientes (${processedPercent}%)`));
        if (this.stats.resumed > 0) {
            console.log(chalk.blue(`   ├─ Previamente completados: ${this.stats.resumed}`));
        }
        console.log(chalk.blue(`   ├─ Fotos descargadas: ${this.stats.downloadedPhotos}`));
        console.log(chalk.yellow(`   ├─ Errores: ${this.stats.errors}`));
        console.log(chalk.gray(`   └─ Sin archivos: ${this.stats.skipped}`));
    }

    showFinalStats() {
        console.log(chalk.green('\n🎉 Descarga de fotos completada!'));
        console.log(chalk.cyan('\n📊 Estadísticas finales:'));
        console.log(`   ├─ Total de activos: ${this.stats.totalAssets}`);
        if (this.stats.resumed > 0) {
            console.log(`   ├─ Previamente completados: ${chalk.blue(this.stats.resumed)}`);
        }
        console.log(`   ├─ Activos procesados en esta sesión: ${this.stats.processedAssets}`);
        console.log(`   ├─ Total de fotos: ${this.stats.totalPhotos}`);
        console.log(`   ├─ Fotos descargadas: ${this.stats.downloadedPhotos}`);
        console.log(`   ├─ Errores: ${this.stats.errors}`);
        console.log(`   ├─ Activos sin archivos: ${this.stats.skipped}`);
        console.log(`   └─ Ruta de descarga: ${this.downloadConfig.localPath}`);

        if (this.stats.errors > 0) {
            console.log(chalk.yellow(`\n⚠️ Se produjeron ${this.stats.errors} errores durante la descarga`));
            console.log(chalk.blue('📝 Revisa los logs en: ./logs/download-errors.json'));
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default AlfrescoDownloader;