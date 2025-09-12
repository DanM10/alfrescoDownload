import chalk from "chalk";
import Helpers from "../utils/helpers.js";
import ConfigManager from "./config.js";
import axios from "axios";
import {testAlfrescoConnection, testApiConnection} from "../utils/api.js";


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
                name: chalk.cyan('⬇️  Iniciar Descarga') + ' - Iniciar o reanudar descarga',
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



    // Método para probar conectividad con el proyecto específico
    async testProjectConnection(apiConfig) {
        if (!apiConfig.proyectoId) {
            Helpers.showWarning('Proyecto: No hay Proyecto ID configurado');
            return false;
        }

        Helpers.showProgress(`Probando acceso al proyecto ${apiConfig.proyectoId}...`);

        try {
            const projectUrl = `${apiConfig.baseUrl}/projects/${apiConfig.proyectoId}`;

            console.log(chalk.gray(`   └─ Conectando a: ${projectUrl}`));

            const response = await axios.get(projectUrl, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                },
                validateStatus: function (status) {
                    return status >= 200 && status < 300;
                }
            });

            Helpers.showSuccess(`Proyecto: Acceso correcto (${response.status})`);

            if (response.data) {
                if (response.data.name) {
                    console.log(chalk.gray(`   └─ Proyecto: ${response.data.name}`));
                }
                if (response.data.status) {
                    console.log(chalk.gray(`   └─ Estado: ${response.data.status}`));
                }
            }

            return true;

        } catch (error) {
            if (error.response?.status === 404) {
                Helpers.showError(`Proyecto: ID '${apiConfig.proyectoId}' no encontrado`);
            } else if (error.response?.status === 403) {
                Helpers.showError('Proyecto: Acceso denegado - Verifica permisos');
            } else {
                Helpers.showError(`Proyecto: Error de conexión - ${error.message}`);
            }
            return false;
        }
    }




    async showProjectStatus() {
        Helpers.clearScreen();
        Helpers.showHeader('PROYECTO ACTUAL', '📊');

        // TODO: Implementar cuando tengas el endpoint listo
        console.log(chalk.gray('📝 Funcionalidad pendiente de implementación'));
        console.log(chalk.blue('🔗 Se conectará con el endpoint del proyecto cuando esté disponible'));

        // Placeholder para mostrar estructura futura
        console.log('\n' + chalk.cyan('📋 Información del proyecto:'));
        console.log('   ├─ Nombre: ' + chalk.gray('Pendiente'));
        console.log('   ├─ Estado: ' + chalk.gray('Pendiente'));
        console.log('   ├─ Última actualización: ' + chalk.gray('Pendiente'));
        console.log('   └─ Progreso: ' + chalk.gray('Pendiente'));
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

        // Validar configuración primero
        const validation = await this.configManager.validateConfig();
        if (!validation.isValid) {
            Helpers.showError('No se puede iniciar la descarga. Problemas de configuración:');
            validation.issues.forEach(issue => {
                console.log(`   └─ ${chalk.red(issue)}`);
            });
            return;
        }

        const confirmDownload = await Helpers.confirmAction(
            '¿Deseas iniciar el proceso de descarga?',
            false
        );

        if (!confirmDownload) {
            Helpers.showWarning('Descarga cancelada');
            return;
        }

        try {
            Helpers.showProgress('Iniciando proceso de descarga...');

            // Primero ejecutar discovery
            Helpers.showProgress('Ejecutando discovery...');
            const discovery = new AlfrescoDiscovery();
            await discovery.startDiscovery();

            // Luego iniciar descarga
            Helpers.showProgress('Iniciando descarga...');
            const downloader = new AlfrescoDownloader();
            await downloader.startDownload();

            Helpers.showSuccess('Proceso de descarga completado');

        } catch (error) {
            Helpers.showError(`Error durante la descarga: ${error.message}`);
        }
    }
}

export default MenuManager