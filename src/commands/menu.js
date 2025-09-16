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

        // 🔄 Verificar si hay descargas pendientes
        let hasPendingDownloads = false;
        try {
            const { default: AssetsDownloader } = await import('../utils/assets-downloader.js');
            const loadResult = await AssetsDownloader.loadAssetsData();
            if (loadResult.success) {
                const pendingAssets = loadResult.data.filter(asset => !asset.estaDescargada);
                hasPendingDownloads = pendingAssets.length > 0;

                if (hasPendingDownloads) {
                    console.log(chalk.yellow(`⚠️  Hay ${pendingAssets.length} activos pendientes de descarga\n`));
                }
            }
        } catch (error) {
            // Silently ignore errors here
        }

        const choices = [
            {
                name: chalk.green('🏥 Health Status') + ' - Revisar estado de Alfresco y API',
                value: 'health'
            },
            {
                name: chalk.blue('⚙️ Configuraciones') + ' - Configurar credenciales y endpoints',
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
                name: (hasPendingDownloads ? chalk.red.bold('⬇️ Iniciar/Continuar Descarga') : chalk.cyan('⬇️ Iniciar Descarga')) +
                    ' - Descargar activos y archivos' +
                    (hasPendingDownloads ? chalk.yellow(' (pendientes)') : ''),
                value: 'download'
            },
            {
                name: chalk.magenta('📝 Ver Logs de Errores') + ' - Revisar errores de descarga',
                value: 'logs'
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
            case 'logs':
                await this.showErrorLogs();
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

    async showCompletedAssetsDetails(assets) {
        const completedAssets = assets.filter(asset => asset.estaDescargada);

        console.log(chalk.green('\n✅ Activos completados:'));

        if (completedAssets.length <= 10) {
            completedAssets.forEach((asset, index) => {
                console.log(`   ${index + 1}. ${chalk.green(asset.etiqueta)} ${asset.nuevoNombre ? `(${asset.nuevoNombre})` : ''}`);
            });
        } else {
            // Mostrar primeros 5 y últimos 5
            completedAssets.slice(0, 5).forEach((asset, index) => {
                console.log(`   ${index + 1}. ${chalk.green(asset.etiqueta)} ${asset.nuevoNombre ? `(${asset.nuevoNombre})` : ''}`);
            });

            console.log(`   ... ${completedAssets.length - 10} activos más ...`);

            completedAssets.slice(-5).forEach((asset, index) => {
                const realIndex = completedAssets.length - 5 + index + 1;
                console.log(`   ${realIndex}. ${chalk.green(asset.etiqueta)} ${asset.nuevoNombre ? `(${asset.nuevoNombre})` : ''}`);
            });
        }

        console.log(chalk.cyan(`\n📊 Total completado: ${completedAssets.length} activos`));
    }

    async proceedWithContinue(systemConfig, projectConfig, assets) {
        const completedAssets = assets.filter(asset => asset.estaDescargada);
        const pendingAssets = assets.filter(asset => !asset.estaDescargada);

        // Mostrar estado actual
        console.log(chalk.cyan('📋 Estado de la descarga previa:\n'));
        console.log(`   ├─ Total de activos: ${chalk.blue(assets.length)}`);
        console.log(`   ├─ Ya descargados: ${chalk.green(completedAssets.length)}`);
        console.log(`   ├─ Pendientes: ${chalk.yellow(pendingAssets.length)}`);
        console.log(`   └─ Progreso: ${chalk.cyan(((completedAssets.length / assets.length) * 100).toFixed(1))}%\n`);

        if (pendingAssets.length === 0) {
            console.log(chalk.green('🎉 ¡Todas las descargas ya están completadas!'));
            console.log(chalk.blue('💡 No hay nada pendiente por descargar\n'));

            const showCompleted = await Helpers.confirmAction(
                '¿Deseas ver un resumen de los activos descargados?',
                false
            );

            if (showCompleted) {
                await this.showCompletedAssetsDetails(assets);
            }
            return true;
        }

        // Mostrar detalles de activos pendientes
        console.log(chalk.yellow('📝 Próximos activos a descargar:'));
        pendingAssets.slice(0, 8).forEach((asset, index) => {
            console.log(`   ${index + 1}. ${chalk.blue(asset.etiqueta)} ${asset.nuevoNombre ? `(${asset.nuevoNombre})` : ''}`);
        });

        if (pendingAssets.length > 8) {
            console.log(`   ... y ${chalk.yellow(pendingAssets.length - 8)} activos más\n`);
        } else {
            console.log('');
        }

        // Confirmación para continuar
        const shouldContinue = await Helpers.confirmAction(
            `¿Deseas continuar descargando ${pendingAssets.length} activos pendientes?`,
            true
        );

        if (!shouldContinue) {
            Helpers.showWarning('Descarga cancelada');
            return false;
        }

        console.log(chalk.blue('\n🔄 Reanudando descarga...\n'));
        return await this.downloadAlfrescoPhotos(systemConfig, projectConfig, assets);
    }

    async continueInterruptedDownload(systemConfig, projectConfig) {
        Helpers.clearScreen();
        Helpers.showHeader('CONTINUAR DESCARGA INTERRUMPIDA', '🔄');

        try {
            // 🔧 Validar configuraciones primero
            if (!systemConfig || !projectConfig) {
                Helpers.showError('Error de configuración del sistema o proyecto');
                return false;
            }

            if (!projectConfig.download) {
                Helpers.showError('Configuración de descarga no encontrada');
                console.log(chalk.blue('💡 Configura los parámetros de descarga en: Configuraciones > Proyecto > Descarga\n'));
                return false;
            }

            // Verificar si hay datos de activos - usando instancia en lugar de método estático
            const { default: AssetsDownloader } = await import('../utils/assets-downloader.js');
            const assetsDownloader = new AssetsDownloader(systemConfig, projectConfig);
            const loadResult = await assetsDownloader.loadSavedAssetsData();

            if (!loadResult.success) {
                Helpers.showError('No se encontraron datos de descarga previa');
                console.log(chalk.blue('💡 Primero debes ejecutar "Descargar información de activos"\n'));

                // Ofrecer descargar información ahora
                const downloadNow = await Helpers.confirmAction(
                    '¿Deseas descargar la información de activos ahora?',
                    true
                );

                if (downloadNow) {
                    const success = await assetsDownloader.downloadAssetsInfo();
                    if (!success) {
                        return false;
                    }
                    // Recargar los datos después de descargar
                    const newLoadResult = await assetsDownloader.loadSavedAssetsData();
                    if (!newLoadResult.success) {
                        Helpers.showError('Error cargando datos recién descargados');
                        return false;
                    }
                    // Continuar con los nuevos datos
                    return await this.proceedWithContinue(systemConfig, projectConfig, newLoadResult.data);
                }
                return false;
            }

            return await this.proceedWithContinue(systemConfig, projectConfig, loadResult.data);

        } catch (error) {
            Helpers.showError(`Error al continuar descarga: ${error.message}`);
            console.log(chalk.gray(`Detalle: ${error.stack}`));
            return false;
        }
    }

    async showErrorLogs() {
        Helpers.clearScreen();
        Helpers.showHeader('LOGS DE ERRORES', '📝');

        const { default: ErrorLogger } = await import('../utils/error-logger.js');
        const errorLogger = new ErrorLogger();

        try {
            const summary = await errorLogger.getErrorSummary();

            if (summary.total === 0) {
                console.log(chalk.green('✅ No hay errores registrados'));
                return;
            }

            console.log(chalk.cyan(`📊 Resumen de errores: ${summary.total} total\n`));

            // Mostrar errores por activo
            console.log(chalk.blue('🔍 Errores por activo:'));
            Object.entries(summary.byAsset).forEach(([asset, count]) => {
                console.log(`   ├─ ${asset}: ${chalk.red(count)} error(es)`);
            });

            // Mostrar errores recientes
            if (summary.recent.length > 0) {
                console.log(chalk.blue('\n🕒 Errores recientes:'));
                summary.recent.slice(-5).forEach(error => {
                    console.log(`   ├─ ${chalk.gray(error.timestamp.substring(0, 19))}`);
                    console.log(`   │  └─ ${error.asset.etiqueta}: ${chalk.red(error.error.message)}`);
                });
            }

            // Opciones
            const logChoices = [
                {
                    name: '🗑️ Limpiar log de errores',
                    value: 'clear'
                },
                {
                    name: '📄 Ver archivo completo de errores',
                    value: 'view-file'
                },
                {
                    name: '🔙 Volver al menú principal',
                    value: 'back'
                }
            ];

            const action = await Helpers.selectFromList('¿Qué deseas hacer?', logChoices);

            switch (action) {
                case 'clear':
                    const confirm = await Helpers.confirmAction('¿Estás seguro de limpiar el log de errores?', false);
                    if (confirm) {
                        await errorLogger.clearErrorLog();
                    }
                    break;
                case 'view-file':
                    console.log(chalk.blue('\n📄 Archivo de errores completo:'));
                    console.log(chalk.gray('Ubicación: ./logs/download-errors.json'));
                    break;
                case 'back':
                    break;
            }

        } catch (error) {
            Helpers.showError(`Error leyendo logs: ${error.message}`);
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
                    name: '🔄 Continuar descarga interrumpida',
                    value: 'continue-download'
                },
                {
                    name: '📷 Descargar solo fotos (requiere datos previos)',
                    value: 'alfresco-files'
                },
                {
                    name: '📄 Proceso completo (datos + fotos)',
                    value: 'complete'
                },
                Helpers.createSeparator(),
                {
                    name: '📊 Ver estado actual de descarga',
                    value: 'status'
                },
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
                case 'continue-download':
                    await this.continueInterruptedDownload(systemConfig, projectConfig);
                    break;
                case 'complete':
                    await this.downloadComplete(systemConfig, projectConfig);
                    break;
                case 'back':
                    return;
            }

        } catch (error) {
            Helpers.showError(`Error durante la descarga: ${error.message} assad`);
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

                const downloadNow = await Helpers.confirmAction(
                    '¿Deseas descargar la información de activos ahora?',
                    true
                );

                if (downloadNow) {
                    const assetsDownloader = new AssetsDownloader(systemConfig, projectConfig);
                    const success = await assetsDownloader.downloadAssetsInfo();
                    if (success) {
                        assetsData = assetsDownloader.allAssets;
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            } else {
                assetsData = loadResult.data;
            }
        }

        const pendingAssets = assetsData.filter(asset => !asset.estaDescargada);
        const completedAssets = assetsData.filter(asset => asset.estaDescargada);

        if (pendingAssets.length === 0) {
            console.log(chalk.green('🎉 Todas las fotos ya han sido descargadas!'));

            if (completedAssets.length > 0) {
                console.log(chalk.blue(`📊 Total de activos completados: ${completedAssets.length}`));
            }

            const redownload = await Helpers.confirmAction(
                '¿Deseas forzar la re-descarga de todos los activos?',
                false
            );

            if (!redownload) {
                return true;
            }

            assetsData.forEach(asset => asset.estaDescargada = false);
        }

        const { default: AlfrescoDownloader } = await import('../utils/alfresco-downloader.js');
        const alfrescoDownloader = new AlfrescoDownloader(systemConfig, projectConfig, assetsData);

        return await alfrescoDownloader.downloadAllPhotos();
    }

}

export default MenuManager