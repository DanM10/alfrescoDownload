import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import Helpers from './helpers.js';
import HttpClient from './http-client.js';

class AssetsDownloader {
    constructor(systemConfig, projectConfig) {
        this.systemConfig = systemConfig;
        this.projectConfig = projectConfig;
        this.allAssets = [];
        this.downloadConfig = projectConfig.download;
        this.assetsDataPath = './data/assets-data.json';
    }

    async downloadAssetsInfo() {
        Helpers.clearScreen();
        Helpers.showHeader('DESCARGA DE INFORMACIÓN DE ACTIVOS', '📊');

        // Validar configuración
        if (!this.validateDownloadConfig()) {
            return false;
        }

        try {
            console.log(chalk.cyan('📋 Configuración de descarga:'));
            console.log(`   ├─ Proyecto ID: ${chalk.green(this.systemConfig.api.proyectoId)}`);
            console.log(`   ├─ Período: ${chalk.green(this.downloadConfig.desde)} a ${chalk.green(this.downloadConfig.hasta)}`);
            console.log(`   ├─ Criterio: ${chalk.green(this.downloadConfig.valor)}`);
            console.log(`   └─ Actualizados: ${this.downloadConfig.descargarActualizados ? '✅' : '❌'}\n`);

            const confirm = await Helpers.confirmAction(
                '¿Deseas continuar con la descarga de información de activos?',
                true
            );

            if (!confirm) {
                Helpers.showWarning('Descarga cancelada');
                return false;
            }

            // Iniciar descarga paginada
            await this.downloadAllPages();

            // Guardar datos
            await this.saveAssetsData();

            Helpers.showSuccess('Descarga de información de activos completada');
            return true;

        } catch (error) {
            Helpers.showError(`Error durante la descarga: ${error.message}`);
            return false;
        }
    }

    validateDownloadConfig() {
        const issues = [];

        if (!this.systemConfig.api.baseUrl) issues.push('URL de API no configurada');
        if (!this.systemConfig.api.proyectoId) issues.push('Proyecto ID no configurado');
        if (!this.downloadConfig.desde) issues.push('Fecha desde no configurada');
        if (!this.downloadConfig.hasta) issues.push('Fecha hasta no configurada');

        if (issues.length > 0) {
            Helpers.showError('Configuración incompleta:');
            issues.forEach(issue => {
                console.log(`   └─ ${chalk.red(issue)}`);
            });
            console.log(chalk.blue('\n💡 Configura los parámetros faltantes en Configuraciones > Proyecto > Descarga'));
            return false;
        }

        return true;
    }

    async downloadAllPages() {
        let currentPage = 1;
        let totalPages = null;
        let totalElements = null;

        Helpers.showProgress('Iniciando descarga paginada...');

        while (totalPages === null || currentPage <= totalPages) {
            const pageResult = await this.downloadPage(currentPage);

            if (!pageResult.success) {
                throw new Error(`Error en página ${currentPage}: ${pageResult.message}`);
            }

            // Primera página - obtener información total
            if (totalPages === null) {
                totalPages = pageResult.data.totalPages;
                totalElements = pageResult.data.totalElements;

                console.log(chalk.cyan(`\n📊 Información de descarga:`));
                console.log(`   ├─ Total de páginas: ${chalk.green(totalPages)}`);
                console.log(`   ├─ Total de elementos: ${chalk.green(totalElements)}`);
                console.log(`   └─ Elementos por página: ${chalk.green(pageResult.data.size)}\n`);
            }

            // Agregar contenido de esta página
            this.allAssets = this.allAssets.concat(pageResult.data.content);

            // Mostrar progreso
            const progress = ((currentPage / totalPages) * 100).toFixed(1);
            console.log(chalk.blue(`📄 Página ${currentPage}/${totalPages} (${progress}%) - ${pageResult.data.content.length} elementos`));

            currentPage++;

            // Pequeña pausa entre páginas para no saturar el servidor
            if (currentPage <= totalPages) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(chalk.green(`\n✅ Descarga completada: ${this.allAssets.length} activos obtenidos`));
    }

    async downloadPage(page) {
        try {
            const url = this.buildApiUrl(page);
            console.log(chalk.gray(`   └─ Descargando: ${url}`));
            const result = await HttpClient.makeRequest(url, {
                timeout: 30000
            });

            if (result.success) {
                return {
                    success: true,
                    data: result.data
                };
            } else {
                return {
                    success: false,
                    message: result.message
                };
            }

        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }

    buildApiUrl(page) {
        const baseUrl = this.systemConfig.api.baseUrl;
        const params = new URLSearchParams({
            proyectoId: this.systemConfig.api.proyectoId,
            desde: this.downloadConfig.desde,
            hasta: this.downloadConfig.hasta,
            descargarActualizados: this.downloadConfig.descargarActualizados,
            page: page,
            valor: this.normalizeText(this.downloadConfig.valor)
        });

        return `${baseUrl}/descarga/fotos/?${params.toString()}`;
    }

    async saveAssetsData() {
        try {
            // Asegurar que existe el directorio
            await fs.ensureDir(path.dirname(this.assetsDataPath));

            // Crear metadata
            const metadata = {
                timestamp: new Date().toISOString(),
                totalAssets: this.allAssets.length,
                downloadConfig: this.downloadConfig,
                projectId: this.systemConfig.api.proyectoId
            };

            // Guardar en archivos separados si es muy grande
            if (this.allAssets.length > 5000) {
                await this.saveAssetsDataChunked(metadata);
            } else {
                await this.saveAssetsDataSingle(metadata);
            }

        } catch (error) {
            throw new Error(`Error guardando datos: ${error.message}`);
        }
    }

    async saveAssetsDataSingle(metadata) {
        const data = {
            metadata: metadata,
            assets: this.allAssets
        };

        await fs.writeJson(this.assetsDataPath, data, { spaces: 2 });
        console.log(chalk.green(`💾 Datos guardados en: ${this.assetsDataPath}`));
    }

    async saveAssetsDataChunked(metadata) {
        const chunkSize = 1000;
        const chunks = Math.ceil(this.allAssets.length / chunkSize);

        // Guardar metadata
        const metadataPath = './data/assets-metadata.json';
        await fs.writeJson(metadataPath, {
            ...metadata,
            chunked: true,
            chunks: chunks,
            chunkSize: chunkSize
        }, { spaces: 2 });

        // Guardar chunks
        for (let i = 0; i < chunks; i++) {
            const start = i * chunkSize;
            const end = start + chunkSize;
            const chunk = this.allAssets.slice(start, end);

            const chunkPath = `./data/assets-chunk-${i + 1}.json`;
            await fs.writeJson(chunkPath, chunk, { spaces: 2 });

            console.log(chalk.blue(`💾 Chunk ${i + 1}/${chunks} guardado: ${chunk.length} elementos`));
        }

        console.log(chalk.green(`💾 Datos guardados en ${chunks} archivos + metadata`));
    }

    getAssetsStats() {
        if (this.allAssets.length === 0) return null;

        const stats = {
            total: this.allAssets.length,
            conCambioNombre: this.allAssets.filter(a => a.cambiarNombre).length,
            descargadas: this.allAssets.filter(a => a.estaDescargada).length,
            porDescargar: this.allAssets.filter(a => !a.estaDescargada).length
        };

        return stats;
    }

    displayStats() {
        const stats = this.getAssetsStats();
        if (!stats) return;

        console.log(chalk.cyan('\n📊 Estadísticas de activos:'));
        console.log(`   ├─ Total: ${chalk.green(stats.total)}`);
        console.log(`   ├─ Con cambio de nombre: ${chalk.blue(stats.conCambioNombre)}`);
        console.log(`   ├─ Ya descargadas: ${chalk.yellow(stats.descargadas)}`);
        console.log(`   └─ Por descargar: ${chalk.green(stats.porDescargar)}`);
    }

    async loadSavedAssetsData() {
        try {
            // Verificar si hay datos guardados
            const metadataPath = './data/assets-metadata.json';
            const singlePath = './data/assets-data.json';

            if (await fs.pathExists(metadataPath)) {
                // Cargar datos chunked
                const metadata = await fs.readJson(metadataPath);
                let allAssets = [];

                for (let i = 1; i <= metadata.chunks; i++) {
                    const chunkPath = `./data/assets-chunk-${i}.json`;
                    if (await fs.pathExists(chunkPath)) {
                        const chunk = await fs.readJson(chunkPath);
                        allAssets = allAssets.concat(chunk);
                    }
                }

                return { success: true, data: allAssets, metadata: metadata };

            } else if (await fs.pathExists(singlePath)) {
                // Cargar archivo único
                const data = await fs.readJson(singlePath);
                return { success: true, data: data.assets, metadata: data.metadata };
            } else {
                return { success: false, message: 'No hay datos de activos guardados' };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    static async loadAssetsData() {
        const downloader = new AssetsDownloader(null, null);
        return await downloader.loadSavedAssetsData();
    }

    normalizeText(text) {
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }
}

export default AssetsDownloader;