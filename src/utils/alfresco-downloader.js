// src/utils/alfresco-downloader.js
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import Helpers from './helpers.js';
import HttpClient from './http-client.js';

class AlfrescoDownloader {
    constructor(systemConfig, projectConfig, assetsData) {
        this.systemConfig = systemConfig;
        this.projectConfig = projectConfig;
        this.assetsData = assetsData;
        this.downloadConfig = projectConfig.download;
        this.stats = {
            totalAssets: 0,
            processedAssets: 0,
            totalPhotos: 0,
            downloadedPhotos: 0,
            errors: 0,
            skipped: 0
        };
    }

    async downloadAllPhotos() {
        Helpers.clearScreen();
        Helpers.showHeader('DESCARGA DE FOTOS DESDE ALFRESCO', '📷');

        if (!this.validateConfig()) {
            return false;
        }

        this.stats.totalAssets = this.assetsData.length;
        console.log(chalk.cyan(`📊 Iniciando descarga de fotos para ${this.stats.totalAssets} activos\n`));

        try {
            // Crear directorio base
            await fs.ensureDir(this.downloadConfig.localPath);

            // Procesar cada activo
            for (let i = 0; i < this.assetsData.length; i++) {
                const asset = this.assetsData[i];
                await this.processAsset(asset, i + 1);

                // Mostrar progreso cada 10 activos
                if ((i + 1) % 10 === 0 || i === this.assetsData.length - 1) {
                    this.showProgress();
                }

                // Pausa pequeña para no saturar el servidor
                await this.sleep(100);
            }

            this.showFinalStats();
            return true;

        } catch (error) {
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

    async processAsset(asset, index) {
        try {
            console.log(chalk.blue(`\n[${index}/${this.stats.totalAssets}] Procesando: ${asset.etiqueta}`));

            // Obtener contenido de la carpeta del activo
            const folderContent = await this.getFolderContent(asset.alfrescoId);

            if (!folderContent.success) {
                console.log(chalk.red(`   └─ Error obteniendo contenido: ${folderContent.message}`));
                this.stats.errors++;
                return;
            }

            const files = folderContent.files;

            if (files.length === 0) {
                console.log(chalk.yellow(`   └─ Sin archivos en la carpeta`));
                this.stats.skipped++;
                return;
            }

            console.log(chalk.gray(`   └─ Encontrados ${files.length} archivo(s)`));

            // Crear carpeta de destino
            const targetFolder = this.createTargetFolderPath(asset);
            await fs.ensureDir(targetFolder);

            // Descargar cada archivo
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const targetFileName = this.createTargetFileName(asset, file, i + 1);
                const targetPath = path.join(targetFolder, targetFileName);

                const downloaded = await this.downloadFile(file, targetPath);
                if (downloaded) {
                    this.stats.downloadedPhotos++;
                } else {
                    this.stats.errors++;
                }
            }

            this.stats.processedAssets++;
            this.stats.totalPhotos += files.length;

        } catch (error) {
            console.log(chalk.red(`   └─ Error procesando activo: ${error.message}`));
            this.stats.errors++;
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

    async downloadFile(fileInfo, targetPath) {
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

                    writer.on('error', (error) => {
                        console.log(chalk.red(`      └─ Error guardando: ${error.message}`));
                        resolve(false);
                    });
                });
            } else {
                console.log(chalk.red(`      └─ Error descargando: ${result.message}`));
                return false;
            }

        } catch (error) {
            console.log(chalk.red(`      └─ Error: ${error.message}`));
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

    showProgress() {
        const processedPercent = ((this.stats.processedAssets / this.stats.totalAssets) * 100).toFixed(1);

        console.log(chalk.cyan(`\n📊 Progreso: ${this.stats.processedAssets}/${this.stats.totalAssets} activos (${processedPercent}%)`));
        console.log(chalk.blue(`   ├─ Fotos descargadas: ${this.stats.downloadedPhotos}`));
        console.log(chalk.yellow(`   ├─ Errores: ${this.stats.errors}`));
        console.log(chalk.gray(`   └─ Sin archivos: ${this.stats.skipped}`));
    }

    showFinalStats() {
        console.log(chalk.green('\n🎉 Descarga de fotos completada!'));
        console.log(chalk.cyan('\n📊 Estadísticas finales:'));
        console.log(`   ├─ Activos procesados: ${this.stats.processedAssets}/${this.stats.totalAssets}`);
        console.log(`   ├─ Total de fotos: ${this.stats.totalPhotos}`);
        console.log(`   ├─ Fotos descargadas: ${this.stats.downloadedPhotos}`);
        console.log(`   ├─ Errores: ${this.stats.errors}`);
        console.log(`   ├─ Activos sin archivos: ${this.stats.skipped}`);
        console.log(`   └─ Ruta de descarga: ${this.downloadConfig.localPath}`);

        if (this.stats.errors > 0) {
            console.log(chalk.yellow(`\n⚠️  Se produjeron ${this.stats.errors} errores durante la descarga`));
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default AlfrescoDownloader;