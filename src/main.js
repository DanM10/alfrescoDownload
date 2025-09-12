
import {Command} from "commander";
import chalk from "chalk";
import ConfigManager from './commands/config.js';  // ← Agrega .js
import MenuManager from './commands/menu.js';  // ← Agrega .js

class AlfrescoCliApp {
    constructor() {
        this.program = new Command();
        this.menuManager = new MenuManager();
        this.configManager = new ConfigManager();
        this.setupCommands();
    }

    setupCommands() {
        this.program
            .name('alfresco-cli')
            .description('CLI para gestión y descarga de contenido de Alfresco')
            .version('1.0.0');

        this.program
            .command('menu')
            .description('Mostrar menú interactivo')
            .action(() => this.menuManager.showMainMenu());

        this.program
            .command('health')
            .description('Verificar estado de Alfresco y API')
            .action(() => this.menuManager.checkHealth());

        this.program
            .command('config')
            .description('Configurar credenciales y endpoints')
            .action(() => this.configManager.showConfigMenu());

        this.program
            .command('test')
            .description('Probar dependencias')
            .action(() => {
                console.log(chalk.green('✅ ES Modules funcionando!'));
                console.log(chalk.blue('Chalk test:'), chalk.red('ROJO'), chalk.green('VERDE'));
            });

        // Si no se proporciona comando, mostrar menú
        if (process.argv.length === 2) {
            this.menuManager.showMainMenu();
            return;
        }
    }

    run() {
        this.program.parse(process.argv);
    }
}

const app = new AlfrescoCliApp();
app.run();