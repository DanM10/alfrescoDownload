import chalk from "chalk";
import Helpers from "../utils/helpers.js";
import ConfigManager from "./config.js";
import {testAlfrescoConnection, testApiConnection} from "../utils/api.js";
import AssetsDownloader from "../utils/assets-downloader.js";


class MenuManager {
    constructor() {
        this.configManager = new ConfigManager();
    }

    async showMainMenu() {
        Helpers.clearScreen();
        Helpers.showHeader('ALFRESCO CLI MANAGER');


        const choices = [
            {
                name: chalk.green('🏥 Health Status') + ' - Revisar estado de Alfresco y API',
                value: 'health'
            },
            {
                name: chalk.blue('⚙️  Configuraciones') + ' - Configurar credenciales y endpoints',
                value: 'config'
            },
            {
                name: chalk.yellow('📊 Proyecto Actual') + ' - Ver estado del proyecto',
                value: 'project'
            },
            {
                name: chalk.magenta('📁 Configuración Descarga') + ' - Parámetros de descarga',
                value: 'download-config'
            },
            {
                name: chalk.cyan('⬇️  Iniciar Descarga') + ' - Descargar activos y archivos',
                value: 'download'
            },
            Helpers.createSeparator(),
            {
                name: chalk.red('❌ Salir'),
                value: 'exit'
            }
        ];

        try {
            const action = await Helpers.selectFromList('Selecciona una opción:', choices);
            await this.handleMenuAction(action);
        } catch (error) {
            console.log(chalk.yellow('\n👋 ¡Hasta luego!'));
            process.exit(0);
        }
    }

    async handleMenuAction(action) {
        switch (action) {
            case 'health':
                await this.checkHealth();
                break;
            case 'config':
                await this.configManager.showConfigMenu();
                break;
            case 'project':
                await this.showProjectStatus();
                break;
            case 'download-config':
                await this.showDownloadConfig();
                break;
            case 'download':
                await this.startDownload();
                break;
            case 'exit':
                console.log(chalk.yellow('\n👋 ¡Hasta luego!'));
                process.exit(0);
                break;
        }

        // Volver al menú principal después de cada acción
        await Helpers.waitForEnter();
        await this.showMainMenu();
    }


    async checkHealth() {
        Helpers.clearScreen();
        Helpers.showHeader('HEALTH STATUS CHECK', '🏥');

        try {
            const validation = await this.configManager.validateSystemConfig();

            console.log(chalk.blue('📋 Estado de Configuración del Sistema:'));

            if (validation.isValid) {
                Helpers.showSuccess('Configuración del sistema completa');
            } else {
                Helpers.showWarning('Configuración del sistema incompleta:');
                validation.issues.forEach(issue => {
                    console.log(`   └─ ${chalk.red(issue)}`);
                });
                console.log();
            }

            if (validation.config) {
                console.log(`   └─ URL Alfresco: ${Helpers.formatConfigValue(validation.config.alfresco?.baseUrl)}`);
                console.log(`   └─ Usuario: ${Helpers.formatConfigValue(validation.config.alfresco?.username)}`);
                console.log(`   └─ URL API: ${Helpers.formatConfigValue(validation.config.api?.baseUrl)}`);
                console.log(`   └─ Proyecto ID: ${Helpers.formatConfigValue(validation.config.api?.proyectoId)}\n`);
            }

            // Realizar pruebas de conectividad solo si la configuración es válida
            if (validation.isValid) {
                console.log(chalk.blue('🌐 Pruebas de Conectividad:\n'));

                // Test 1: Alfresco
                await testAlfrescoConnection(validation.config.alfresco);

                // Test 2: API
                await testApiConnection(validation.config.api);

            } else {
                Helpers.showWarning('Saltando pruebas de conectividad - configuración incompleta');
            }

        } catch (error) {
            Helpers.showError(`Error durante health check: ${error.message}`);
        }
    }



    async showProjectStatus() {
        Helpers.clearScreen();
        Helpers.showHeader('PROYECTO ACTUAL', '📊');

        try {
            const projectConfig = await this.configManager.loadProjectConfig();
            const systemConfig = await this.configManager.loadSystemConfig();

            if (!projectConfig.projectData) {
                console.log(chalk.yellow('📝 No hay datos del proyecto cargados'));
                console.log(chalk.blue('💡 Usa "Configuraciones > Recargar datos del proyecto" para cargar desde la API\n'));

                if (systemConfig.api.proyectoId) {
                    const loadNow = await Helpers.confirmAction(
                        '¿Deseas cargar los datos del proyecto ahora?',
                        true
                    );

                    if (loadNow) {
                        await this.configManager.refreshProjectData();
                    }
                } else {
                    console.log(chalk.red('⚠️  Configura primero el Proyecto ID en Configuraciones > Sistema'));
                }
                return;
            }

            // Mostrar datos del proyecto
            const project = projectConfig.projectData;
            console.log(chalk.cyan('📋 Información del proyecto:\n'));

            console.log(chalk.blue('   Datos básicos:'));
            console.log(`      ├─ ID: ${chalk.green(project.id)}`);
            console.log(`      ├─ Identificación: ${chalk.green(project.identificacion)}`);
            console.log(`      ├─ Nombre: ${chalk.green(project.nombre)}`);
            console.log(`      └─ Etapa: ${chalk.green(project.etapaProyecto || 'No definida')}\n`);

            console.log(chalk.blue('   Integración:'));
            console.log(`      ├─ Alfresco ID: ${chalk.green(project.alfrescoId)}`);
            console.log(`      └─ Creado: ${chalk.gray(new Date(project.creado).toLocaleString())}\n`);

            console.log(chalk.blue('   Estado de sincronización:'));
            console.log(`      └─ Última actualización: ${chalk.gray(new Date(projectConfig.lastUpdated).toLocaleString())}\n`);

            // Opciones del proyecto
            const projectChoices = [
                {
                    name: '🔄 Recargar datos del proyecto',
                    value: 'refresh'
                },
                {
                    name: '📁 Explorar en Alfresco',
                    value: 'explore-alfresco'
                },
                {
                    name: '📊 Ver configuración completa',
                    value: 'view-config'
                },
                Helpers.createSeparator(),
                {
                    name: '🔙 Volver al menú principal',
                    value: 'back'
                }
            ];

            const action = await Helpers.selectFromList('¿Qué deseas hacer?', projectChoices);

            switch (action) {
                case 'refresh':
                    await this.configManager.refreshProjectData();
                    await Helpers.waitForEnter();
                    await this.showProjectStatus(); // Volver a mostrar
                    break;
                case 'explore-alfresco':
                    await this.exploreProjectInAlfresco(project);
                    break;
                case 'view-config':
                    await this.configManager.showCurrentConfig();
                    break;
                case 'back':
                    break;
            }

        } catch (error) {
            Helpers.showError(`Error cargando información del proyecto: ${error.message}`);
        }
    }

// Nuevo método para explorar el proyecto en Alfresco
    async exploreProjectInAlfresco(project) {
        Helpers.clearScreen();
        Helpers.showHeader('EXPLORAR EN ALFRESCO', '📁');

        console.log(chalk.blue(`🔍 Explorando proyecto: ${project.nombre}`));
        console.log(chalk.gray(`   └─ Alfresco ID: ${project.alfrescoId}\n`));

        // TODO: Implementar exploración de Alfresco usando el alfrescoId
        console.log(chalk.yellow('⚠️  Funcionalidad pendiente: explorar estructura en Alfresco'));
        console.log(chalk.blue('💡 Se conectará con los módulos de discovery existentes'));

        await Helpers.waitForEnter();
    }

    async showDownloadConfig() {
        Helpers.clearScreen();
        Helpers.showHeader('CONFIGURACIÓN DE DESCARGA', '📁');

        const choices = [
            {
                name: '📅 Configurar descarga por fecha',
                value: 'date-filter'
            },
            {
                name: '🏷️  Configurar cambio de nombres',
                value: 'naming'
            },
            {
                name: '⚙️  Parámetros generales de descarga',
                value: 'general'
            },
            Helpers.createSeparator(),
            {
                name: '🔙 Volver al menú principal',
                value: 'back'
            }
        ];

        const action = await Helpers.selectFromList('Selecciona configuración de descarga:', choices);

        if (action === 'back') return;

        switch (action) {
            case 'date-filter':
                await this.configureDateFilter();
                break;
            case 'naming':
                await this.configureNaming();
                break;
            case 'general':
                await this.configManager.configureDownload();
                break;
        }
    }

    async configureDateFilter() {
        console.log(chalk.blue('\n📅 Configuración de Filtro por Fecha\n'));

        // TODO: Implementar filtro por fecha
        console.log(chalk.gray('📝 Próximamente:'));
        console.log('   ├─ Fecha desde');
        console.log('   ├─ Fecha hasta');
        console.log('   └─ Criterio de fecha (creación/modificación)');
    }

    async configureNaming() {
        console.log(chalk.blue('\n🏷️ Configuración de Nomenclatura\n'));

        // TODO: Implementar cambio de nombres
        console.log(chalk.gray('📝 Próximamente:'));
        console.log('   ├─ Patrones de nombres');
        console.log('   ├─ Prefijos/sufijos');
        console.log('   └─ Normalización de caracteres');
    }


    async startDownload() {
        Helpers.clearScreen();
        Helpers.showHeader('INICIAR DESCARGA', '⬇️');

        try {
            // Validar configuración del sistema
            const systemValidation = await this.configManager.validateSystemConfig();
            if (!systemValidation.isValid) {
                Helpers.showError('No se puede iniciar la descarga. Problemas de configuración del sistema:');
                systemValidation.issues.forEach(issue => {
                    console.log(`   └─ ${chalk.red(issue)}`);
                });
                return;
            }

            // Cargar configuraciones
            const systemConfig = systemValidation.config;
            const projectConfig = await this.configManager.loadProjectConfig();

            // Validar configuración de descarga
            if (!projectConfig.download.desde || !projectConfig.download.hasta) {
                Helpers.showError('Configuración de descarga incompleta');
                console.log(chalk.blue('💡 Configura los parámetros en: Configuraciones > Proyecto > Parámetros de descarga'));
                return;
            }

            // Mostrar resumen antes de comenzar
            console.log(chalk.cyan('📋 Resumen de descarga:'));
            console.log(`   ├─ Proyecto: ${chalk.green(systemConfig.api.proyectoId)}`);
            console.log(`   ├─ Período: ${chalk.green(projectConfig.download.desde)} a ${chalk.green(projectConfig.download.hasta)}`);
            console.log(`   ├─ Criterio: ${chalk.green(projectConfig.download.valor)}`);
            console.log(`   └─ Cambiar nombres: ${projectConfig.download.cambiarNombre ? '✅' : '❌'}\n`);

            // Opciones de descarga
            const downloadChoices = [
                {
                    name: '📊 Descargar información de activos (API)',
                    value: 'assets-info'
                },
                {
                    name: '📁 Descargar archivos desde Alfresco (próximamente)',
                    value: 'alfresco-files'
                },
                {
                    name: '🔄 Proceso completo (información + archivos)',
                    value: 'complete'
                },
                Helpers.createSeparator(),
                {
                    name: '🔙 Volver al menú principal',
                    value: 'back'
                }
            ];

            const downloadAction = await Helpers.selectFromList(
                '¿Qué tipo de descarga deseas realizar?',
                downloadChoices
            );

            switch (downloadAction) {
                case 'assets-info':
                    await this.downloadAssetsInfo(systemConfig, projectConfig);
                    break;
                case 'alfresco-files':
                    await  this.downloadAlfrescoPhotos(systemConfig, projectConfig);
                    break;
                case 'complete':
                    await this.downloadComplete(systemConfig, projectConfig);
                    break;
                case 'back':
                    return;
            }

        } catch (error) {
            Helpers.showError(`Error durante la descarga: ${error.message}`);
        }
    }


    async downloadAssetsInfo(systemConfig, projectConfig) {
        const assetsDownloader = new AssetsDownloader(systemConfig, projectConfig);
        const success = await assetsDownloader.downloadAssetsInfo();

        if (success) {
            assetsDownloader.displayStats();

            const continueToFiles = await Helpers.confirmAction(
                '¿Deseas continuar con la descarga de archivos desde Alfresco?',
                false
            );

            if (continueToFiles) {
                Helpers.showWarning('Descarga de archivos desde Alfresco: Próximamente');
            }
        }
    }

    async downloadComplete(systemConfig, projectConfig) {
        Helpers.showProgress('Iniciando proceso completo de descarga...');

        console.log(chalk.blue('\n🔸 Paso 1: Descargando información de activos'));
        const assetsDownloader = new AssetsDownloader(systemConfig, projectConfig);
        const assetsSuccess = await assetsDownloader.downloadAssetsInfo();

        if (assetsSuccess) {
            console.log(chalk.blue('\n🔸 Paso 2: Descargando fotos desde Alfresco'));
            await this.downloadAlfrescoPhotos(systemConfig, projectConfig, assetsDownloader.allAssets);
        }
    }
    async downloadAlfrescoPhotos(systemConfig, projectConfig, assetsData = null) {
        // Si no tenemos datos de activos, cargar desde archivo
        if (!assetsData) {
            const loadResult = await AssetsDownloader.loadAssetsData();
            if (!loadResult.success) {
                Helpers.showError('No se pudieron cargar los datos de activos');
                console.log(chalk.blue('💡 Ejecuta primero "Descargar información de activos"'));
                return false;
            }
            assetsData = loadResult.data;
        }

        const { default: AlfrescoDownloader } = await import('../utils/alfresco-downloader.js');
        const alfrescoDownloader = new AlfrescoDownloader(systemConfig, projectConfig, assetsData);

        return await alfrescoDownloader.downloadAllPhotos();
    }

}

export default MenuManager