// src/utils/config.js
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import Helpers from '../utils/helpers.js';
import HttpClient from "../utils/http-client.js";
import helpers from "../utils/helpers.js";

class ConfigManager {
    constructor() {
        this.systemConfigPath = './config/system.json';
        this.projectConfigPath = './config/project.json';
        this.defaultSystemConfig = {
            alfresco: {
                baseUrl: '',
                username: '',
                password: '',
                nodeId: '-root-'
            },
            api: {
                baseUrl: '',
                proyectoId: ''
            }
        };

        this.defaultProjectConfig = {
            lastUpdated: null,
            projectData: null,
            filters: {
                dateFrom: null,
                dateTo: null,
                dateType: 'modified'
            },
            naming: {
                pattern: '{originalName}',
                prefix: '',
                suffix: '',
                normalizeChars: true
            },
            download: {
                desde: null,
                hasta: null,
                descargarActualizados: true,
                valor: 'Codigo anterior',
                cambiarNombre: true,
                localPath: './downloads',
                batchSize: 3,
                retryAttempts: 3,
                timeoutMs: 30000
            }
        };

    }

    async loadSystemConfig() {
        try {
            const config = await fs.readJson(this.systemConfigPath);
            return this.mergeWithSystemDefaults(config);
        } catch (error) {
            return this.defaultSystemConfig;
        }
    }

    async loadProjectConfig() {
        try {
            const config = await fs.readJson(this.projectConfigPath);
            return this.mergeWithProjectDefaults(config);
        } catch (error) {
            return this.defaultProjectConfig;
        }
    }

    async saveSystemConfig(config) {
        try {
            await fs.ensureDir(path.dirname(this.systemConfigPath));
            await fs.writeJson(this.systemConfigPath, config, { spaces: 2 });
            return true;
        } catch (error) {
            Helpers.showError(`Error guardando configuración del sistema: ${error.message}`);
            return false;
        }
    }

    async saveProjectConfig(config) {
        try {
            await fs.ensureDir(path.dirname(this.projectConfigPath));
            await fs.writeJson(this.projectConfigPath, config, { spaces: 2 });
            return true;
        } catch (error) {
            Helpers.showError(`Error guardando configuración del proyecto: ${error.message}`);
            return false;
        }
    }

    mergeWithSystemDefaults(config) {
        return {
            alfresco: { ...this.defaultSystemConfig.alfresco, ...config.alfresco },
            api: { ...this.defaultSystemConfig.api, ...config.api }
        };
    }

    mergeWithProjectDefaults(config) {
        return {
            lastUpdated: config.lastUpdated || this.defaultProjectConfig.lastUpdated,
            projectData: config.projectData || this.defaultProjectConfig.projectData,
            filters: { ...this.defaultProjectConfig.filters, ...config.filters },
            naming: { ...this.defaultProjectConfig.naming, ...config.naming },
            download: { ...this.defaultProjectConfig.download, ...config.download }
        };
    }

    async showConfigMenu() {
        Helpers.clearScreen();
        Helpers.showHeader('CONFIGURACIONES', '⚙️');

        const configChoices = [
            {
                name: '🏢 Configuración del Sistema (Alfresco, API, Proyecto ID)',
                value: 'system'
            },
            {
                name: '📁 Configuración del Proyecto (Filtros, Descarga, Nomenclatura)',
                value: 'project'
            },
            Helpers.createSeparator(),
            {
                name: '📄 Ver configuración actual',
                value: 'view'
            },
            {
                name: '🔄 Recargar datos del proyecto desde API',
                value: 'refresh-project'
            },
            Helpers.createSeparator(),
            {
                name: '🔙 Volver al menú principal',
                value: 'back'
            }
        ];

        const configAction = await Helpers.selectFromList(
            'Selecciona tipo de configuración:',
            configChoices
        );

        if (configAction === 'back') return;

        switch (configAction) {
            case 'system':
                await this.showSystemConfigMenu();
                break;
            case 'project':
                await this.showProjectConfigMenu();
                break;
            case 'view':
                await this.showCurrentConfig();
                break;
            case 'refresh-project':
                await this.refreshProjectData();
                break;
        }

        await Helpers.waitForEnter();
    }

    async showSystemConfigMenu() {
        Helpers.clearScreen();
        Helpers.showHeader('CONFIGURACIÓN DEL SISTEMA', '🏢');

        const systemChoices = [
            {
                name: '🏛️  Configurar Alfresco (URL, credenciales, Node ID)',
                value: 'alfresco'
            },
            {
                name: '🌐 Configurar API (URL base)',
                value: 'api'
            },
            {
                name: '🆔 Configurar Proyecto ID',
                value: 'proyecto-id'
            },
            Helpers.createSeparator(),
            {
                name: '🔙 Volver',
                value: 'back'
            }
        ];

        const action = await Helpers.selectFromList('Configuración del sistema:', systemChoices);

        if (action === 'back') return;

        switch (action) {
            case 'alfresco':
                await this.configureAlfresco();
                break;
            case 'api':
                await this.configureApi();
                break;
            case 'proyecto-id':
                await this.configureProyectoId();
                break;
        }
    }

    async showProjectConfigMenu() {
        Helpers.clearScreen();
        Helpers.showHeader('CONFIGURACIÓN DEL PROYECTO', '📁');

        const projectChoices = [
            {
                name: '📅 Filtros de fecha (desde/hasta)',
                value: 'filters'
            },
            {
                name: '🏷️  Nomenclatura de archivos',
                value: 'naming'
            },
            {
                name: '⬇️  Parámetros de descarga',
                value: 'download'
            },
            Helpers.createSeparator(),
            {
                name: '🔙 Volver',
                value: 'back'
            }
        ];

        const action = await Helpers.selectFromList('Configuración del proyecto:', projectChoices);

        if (action === 'back') return;

        switch (action) {
            case 'filters':
                await this.configureFilters();
                break;
            case 'naming':
                await this.configureNaming();
                break;
            case 'download':
                await this.configureDownload();
                break;
        }
    }

    async configureAlfresco() {
        console.log(chalk.blue('\n🏛️ Configuración de Alfresco\n'));

        const currentConfig = await this.loadSystemConfig();

        const alfrescoConfig = await inquirer.prompt([
            {
                type: 'input',
                name: 'baseUrl',
                message: 'URL base de Alfresco:',
                default: currentConfig.alfresco.baseUrl,
                validate: (input) => Helpers.validateNotEmpty(input, 'URL base')
            },
            {
                type: 'input',
                name: 'username',
                message: 'Usuario:',
                default: currentConfig.alfresco.username,
                validate: (input) => Helpers.validateNotEmpty(input, 'Usuario')
            },
            {
                type: 'password',
                name: 'password',
                message: 'Contraseña:',
                validate: (input) => Helpers.validateNotEmpty(input, 'Contraseña')
            },
            {
                type: 'input',
                name: 'nodeId',
                message: 'Node ID raíz:',
                default: currentConfig.alfresco.nodeId,
                validate: (input) => Helpers.validateNotEmpty(input, 'Node ID')
            }
        ]);

        const updatedConfig = {
            ...currentConfig,
            alfresco: alfrescoConfig
        };

        const saved = await this.saveSystemConfig(updatedConfig);
        if (saved) {
            Helpers.showSuccess('Configuración de Alfresco guardada correctamente');
        }
    }

    async configureApi() {
        console.log(chalk.blue('\n🌐 Configuración de API\n'));

        const currentConfig = await this.loadSystemConfig();

        const apiConfig = await inquirer.prompt([
            {
                type: 'input',
                name: 'baseUrl',
                message: 'URL base de la API:',
                default: currentConfig.api.baseUrl,
                validate: (input) => {
                    if (!input.trim()) return 'La URL de la API es requerida';
                    return Helpers.validateUrl(input);
                }
            }
        ]);

        const updatedConfig = {
            ...currentConfig,
            api: { ...currentConfig.api, baseUrl: apiConfig.baseUrl }
        };

        const saved = await this.saveSystemConfig(updatedConfig);
        if (saved) {
            Helpers.showSuccess('Configuración de API guardada correctamente');
        }
    }

    async configureProyectoId() {
        console.log(chalk.blue('\n🆔 Configuración de Proyecto ID\n'));

        const currentConfig = await this.loadSystemConfig();

        const proyectoConfig = await inquirer.prompt([
            {
                type: 'input',
                name: 'proyectoId',
                message: 'ID del Proyecto:',
                default: currentConfig.api.proyectoId,
                validate: (input) => Helpers.validateNotEmpty(input, 'Proyecto ID')
            }
        ]);

        const updatedConfig = {
            ...currentConfig,
            api: { ...currentConfig.api, proyectoId: proyectoConfig.proyectoId }
        };

        const saved = await this.saveSystemConfig(updatedConfig);
        if (saved) {
            Helpers.showSuccess('Proyecto ID guardado correctamente');

            // Preguntar si quiere cargar datos del proyecto
            const loadData = await Helpers.confirmAction(
                '¿Deseas cargar los datos del proyecto desde la API ahora?',
                true
            );

            if (loadData) {
                await this.refreshProjectData();
            }
        }
    }

    async configureFilters() {
        console.log(chalk.blue('\n📅 Configuración de Filtros de Fecha\n'));

        const currentConfig = await this.loadProjectConfig();

        const filterConfig = await inquirer.prompt([
            {
                type: 'input',
                name: 'dateFrom',
                message: 'Fecha desde (YYYY-MM-DD) [opcional]:',
                default: currentConfig.filters.dateFrom,
                validate: (input) => {
                    if (!input.trim()) return true; // Opcional
                    const date = new Date(input);
                    return !isNaN(date.getTime()) || 'Formato de fecha inválido (YYYY-MM-DD)';
                }
            },
            {
                type: 'input',
                name: 'dateTo',
                message: 'Fecha hasta (YYYY-MM-DD) [opcional]:',
                default: currentConfig.filters.dateTo,
                validate: (input) => {
                    if (!input.trim()) return true; // Opcional
                    const date = new Date(input);
                    return !isNaN(date.getTime()) || 'Formato de fecha inválido (YYYY-MM-DD)';
                }
            },
            {
                type: 'list',
                name: 'dateType',
                message: 'Criterio de fecha:',
                default: currentConfig.filters.dateType,
                choices: [
                    { name: 'Fecha de modificación', value: 'modified' },
                    { name: 'Fecha de creación', value: 'created' }
                ]
            }
        ]);

        // Limpiar fechas vacías
        if (!filterConfig.dateFrom.trim()) filterConfig.dateFrom = null;
        if (!filterConfig.dateTo.trim()) filterConfig.dateTo = null;

        const updatedConfig = {
            ...currentConfig,
            filters: filterConfig
        };

        const saved = await this.saveProjectConfig(updatedConfig);
        if (saved) {
            Helpers.showSuccess('Filtros de fecha configurados correctamente');
        }
    }

    async configureNaming() {
        console.log(chalk.blue('\n🏷️ Configuración de Nomenclatura\n'));

        const currentConfig = await this.loadProjectConfig();

        const namingConfig = await inquirer.prompt([
            {
                type: 'input',
                name: 'pattern',
                message: 'Patrón de nombres (usa {originalName}, {date}, {index}):',
                default: currentConfig.naming.pattern,
                validate: (input) => Helpers.validateNotEmpty(input, 'Patrón')
            },
            {
                type: 'input',
                name: 'prefix',
                message: 'Prefijo [opcional]:',
                default: currentConfig.naming.prefix
            },
            {
                type: 'input',
                name: 'suffix',
                message: 'Sufijo [opcional]:',
                default: currentConfig.naming.suffix
            },
            {
                type: 'confirm',
                name: 'normalizeChars',
                message: '¿Normalizar caracteres especiales?',
                default: currentConfig.naming.normalizeChars
            }
        ]);

        const updatedConfig = {
            ...currentConfig,
            naming: namingConfig
        };

        const saved = await this.saveProjectConfig(updatedConfig);
        if (saved) {
            Helpers.showSuccess('Configuración de nomenclatura guardada correctamente');
        }
    }


    async configureDownload() {
        console.log(chalk.blue('\n⬇️ Configuración de Descarga de Activos\n'));

        const currentConfig = await this.loadProjectConfig();

        // Validar que tengamos un proyecto configurado
        const systemConfig = await this.loadSystemConfig();
        if (!systemConfig.api.proyectoId) {
            Helpers.showError('Primero debes configurar un Proyecto ID en Configuración del Sistema');
            return;
        }

        const downloadConfig = await inquirer.prompt([
            {
                type: 'input',
                name: 'desde',
                message: 'Fecha desde (YYYY-MM-DD):',
                default: currentConfig.download.desde || '2025-01-01',
                validate: (input) => {
                    if (!input.trim()) return 'La fecha desde es requerida';
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (!dateRegex.test(input)) return 'Formato debe ser YYYY-MM-DD';
                    const date = new Date(input);
                    if (isNaN(date.getTime())) return 'Fecha inválida';
                    return true;
                }
            },
            {
                type: 'input',
                name: 'hasta',
                message: 'Fecha hasta (YYYY-MM-DD):',
                default: currentConfig.download.hasta || '2025-12-31',
                validate: (input, answers) => {
                    if (!input.trim()) return 'La fecha hasta es requerida';
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (!dateRegex.test(input)) return 'Formato debe ser YYYY-MM-DD';
                    const fechaHasta = new Date(input);
                    if (isNaN(fechaHasta.getTime())) return 'Fecha inválida';

                    // Validar que 'hasta' sea posterior o igual a 'desde'
                    const fechaDesde = new Date(answers.desde);
                    if (fechaHasta < fechaDesde) {
                        return 'La fecha hasta debe ser posterior o igual a la fecha desde';
                    }
                    return true;
                }
            },
            {
                type: 'confirm',
                name: 'descargarActualizados',
                message: '¿Descargar elementos actualizados?',
                default: currentConfig.download.descargarActualizados !== undefined ?
                    currentConfig.download.descargarActualizados : true
            },
            {
                type: 'list',
                name: 'valor',
                message: 'Criterio de descarga:',
                default: currentConfig.download.valor || 'Codigo anterior',
                choices: [
                    { name: 'Código anterior', value: 'Codigo anterior' },
                    { name: 'Etiqueta', value: 'etiqueta' },
                    { name: 'Relevador', value: 'relevador' }
                ]
            },
            {
                type: 'confirm',
                name: 'cambiarNombre',
                message: '¿Cambiar nombres de archivos y carpetas?',
                default: currentConfig.download.cambiarNombre !== undefined ?
                    currentConfig.download.cambiarNombre : true
            },
            {
                type: 'input',
                name: 'localPath',
                message: 'Ruta local para descargas:',
                default: currentConfig.download.localPath || './downloads',
                validate: (input) => Helpers.validateNotEmpty(input, 'Ruta local')
            },
            {
                type: 'number',
                name: 'batchSize',
                message: 'Descargas concurrentes:',
                default: currentConfig.download.batchSize || 3,
                validate: (input) => {
                    if (input < 1 || input > 10) return 'Debe ser entre 1 y 10';
                    return true;
                }
            }
        ]);

        const updatedConfig = {
            ...currentConfig,
            download: {
                ...currentConfig.download,
                ...downloadConfig
            }
        };

        const saved = await this.saveProjectConfig(updatedConfig);
        if (saved) {
            Helpers.showSuccess('Configuración de descarga guardada correctamente');

            // Mostrar resumen de la configuración
            console.log(chalk.cyan('\n📋 Resumen de configuración:'));
            console.log(`   ├─ Período: ${chalk.green(downloadConfig.desde)} a ${chalk.green(downloadConfig.hasta)}`);
            console.log(`   ├─ Descargar actualizados: ${downloadConfig.descargarActualizados ? chalk.green('Sí') : chalk.red('No')}`);
            console.log(`   ├─ Criterio: ${chalk.green(downloadConfig.valor)}`);
            console.log(`   ├─ Cambiar nombres: ${downloadConfig.cambiarNombre ? chalk.green('Sí') : chalk.red('No')}`);
            console.log(`   └─ Ruta: ${chalk.green(downloadConfig.localPath)}`);

            // Calcular aproximadamente cuántos días abarca
            const fechaDesde = new Date(downloadConfig.desde);
            const fechaHasta = new Date(downloadConfig.hasta);
            const diffTime = Math.abs(fechaHasta - fechaDesde);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            console.log(chalk.gray(`\n   📅 Período configurado: ${diffDays} días`));
        }
    }


    async refreshProjectData() {
        console.log(chalk.blue('\n🔄 Cargando datos del proyecto...\n'));

        const systemConfig = await this.loadSystemConfig();

        if (!systemConfig.api.baseUrl || !systemConfig.api.proyectoId) {
            Helpers.showError('Configuración incompleta: se requiere URL de la API y Proyecto ID');
            return;
        }

        Helpers.showProgress('Conectando a la API...');

        try {
            const projectUrl = `${systemConfig.api.baseUrl}/proyecto/${systemConfig.api.proyectoId}`;
            console.log(chalk.gray(`   └─ URL: ${projectUrl}`));

            const result = await HttpClient.makeRequest(projectUrl, {
                timeout: 15000
            });

            if (result.success && result.data) {
                // Extraer solo los campos que necesitas
                const projectData = helpers.extractProjectData(result.data);

                const projectConfig = await this.loadProjectConfig();
                const updatedConfig = {
                    ...projectConfig,
                    lastUpdated: new Date().toISOString(),
                    projectData: projectData
                };

                const saved = await this.saveProjectConfig(updatedConfig);
                if (saved) {
                    Helpers.showSuccess('Datos del proyecto actualizados correctamente');
                    this.displayProjectData(projectData);
                }
            } else {
                Helpers.showError(`Error cargando proyecto: ${result.message}`);
                if (result.status === 404) {
                    console.log(chalk.gray(`   └─ El proyecto con ID '${systemConfig.api.proyectoId}' no fue encontrado`));
                }
            }
        } catch (error) {
            Helpers.showError(`Error de conexión: ${error.message}`);
        }
    }

    async showCurrentConfig() {
        Helpers.clearScreen();
        Helpers.showHeader('CONFIGURACIÓN ACTUAL', '📄');

        try {
            const systemConfig = await this.loadSystemConfig();
            const projectConfig = await this.loadProjectConfig();

            console.log(chalk.cyan('🏢 SISTEMA:'));
            console.log(chalk.blue('   Alfresco:'));
            console.log(`      ├─ URL: ${Helpers.formatConfigValue(systemConfig.alfresco.baseUrl)}`);
            console.log(`      ├─ Usuario: ${Helpers.formatConfigValue(systemConfig.alfresco.username)}`);
            console.log(`      ├─ Contraseña: ${Helpers.formatConfigValue(systemConfig.alfresco.password, true)}`);
            console.log(`      └─ Node ID: ${Helpers.formatConfigValue(systemConfig.alfresco.nodeId)}`);

            console.log(chalk.blue('   API:'));
            console.log(`      ├─ URL: ${Helpers.formatConfigValue(systemConfig.api.baseUrl)}`);
            console.log(`      └─ Proyecto ID: ${Helpers.formatConfigValue(systemConfig.api.proyectoId)}\n`);

            console.log(chalk.cyan('📁 PROYECTO:'));
            console.log(chalk.blue('   Filtros:'));
            console.log(`      ├─ Desde: ${Helpers.formatConfigValue(projectConfig.filters.dateFrom)}`);
            console.log(`      ├─ Hasta: ${Helpers.formatConfigValue(projectConfig.filters.dateTo)}`);
            console.log(`      └─ Criterio: ${Helpers.formatConfigValue(projectConfig.filters.dateType)}`);

            console.log(chalk.blue('   Nomenclatura:'));
            console.log(`      ├─ Patrón: ${Helpers.formatConfigValue(projectConfig.naming.pattern)}`);
            console.log(`      ├─ Prefijo: ${Helpers.formatConfigValue(projectConfig.naming.prefix)}`);
            console.log(`      ├─ Sufijo: ${Helpers.formatConfigValue(projectConfig.naming.suffix)}`);
            console.log(`      └─ Normalizar: ${projectConfig.naming.normalizeChars ? '✅' : '❌'}`);

            console.log(chalk.blue('   Descarga:'));
            console.log(`      ├─ Desde: ${Helpers.formatConfigValue(projectConfig.download.desde)}`);
            console.log(`      ├─ Hasta: ${Helpers.formatConfigValue(projectConfig.download.hasta)}`);
            console.log(`      ├─ Actualizados: ${projectConfig.download.descargarActualizados ? '✅' : '❌'}`);
            console.log(`      ├─ Criterio: ${Helpers.formatConfigValue(projectConfig.download.valor)}`);
            console.log(`      ├─ Cambiar nombres: ${projectConfig.download.cambiarNombre ? '✅' : '❌'}`);
            console.log(`      ├─ Ruta: ${Helpers.formatConfigValue(projectConfig.download.localPath)}`);
            console.log(`      ├─ Concurrencia: ${Helpers.formatConfigValue(projectConfig.download.batchSize)}`);
            console.log(`      └─ Timeout: ${Helpers.formatConfigValue(projectConfig.download.timeoutMs + 'ms')}`);

            if (projectConfig.projectData) {
                console.log(chalk.blue('   Datos del proyecto:'));
                console.log(`      ├─ Nombre: ${Helpers.formatConfigValue(projectConfig.projectData.name)}`);
                console.log(`      ├─ Estado: ${Helpers.formatConfigValue(projectConfig.projectData.status)}`);
                console.log(`      └─ Última actualización: ${Helpers.formatConfigValue(projectConfig.lastUpdated)}`);
            }

        } catch (error) {
            Helpers.showError(`Error leyendo configuración: ${error.message}`);
        }
    }

    async validateSystemConfig() {
        const config = await this.loadSystemConfig();
        const issues = [];

        if (!config.alfresco.baseUrl) issues.push('URL de Alfresco no configurada');
        if (!config.alfresco.username) issues.push('Usuario de Alfresco no configurado');
        if (!config.alfresco.password) issues.push('Contraseña de Alfresco no configurada');
        if (!config.api.baseUrl) issues.push('URL de la API no configurada');
        if (!config.api.proyectoId) issues.push('Proyecto ID no configurado');

        return {
            isValid: issues.length === 0,
            issues: issues,
            config: config
        };
    }

    displayProjectData(projectData) {
        console.log(chalk.cyan('\n📊 Datos del proyecto cargados:'));
        console.log(`   ├─ ID: ${chalk.green(projectData.id)}`);
        console.log(`   ├─ Identificación: ${chalk.green(projectData.identificacion)}`);
        console.log(`   ├─ Nombre: ${chalk.green(projectData.nombre)}`);
        console.log(`   ├─ Etapa: ${chalk.green(projectData.etapaProyecto || 'No definida')}`);
        console.log(`   ├─ Alfresco ID: ${chalk.green(projectData.alfrescoId)}`);
        console.log(`   └─ Creado: ${chalk.gray(new Date(projectData.creado).toLocaleString())}`);
    }
}

export default ConfigManager;