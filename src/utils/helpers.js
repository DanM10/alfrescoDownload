import chalk from 'chalk';
import inquirer from 'inquirer';


class Helpers {
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static formatTime(seconds) {
        if (!isFinite(seconds)) return 'Unknown';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours}h ${minutes}m ${secs}s`;
    }

    static async waitForEnter(message = 'Presiona Enter para continuar...') {
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: chalk.gray(message)
            }
        ]);
    }

    static clearScreen() {
        console.clear();
    }

    static showHeader(title, icon = '🚀') {
        console.log(chalk.bold.cyan(`\n${icon} ${title.toUpperCase()}\n`));
    }

    static showSuccess(message) {
        console.log(chalk.green(`✅ ${message}`));
    }

    static showError(message) {
        console.log(chalk.red(`❌ ${message}`));
    }

    static showWarning(message) {
        console.log(chalk.yellow(`⚠️  ${message}`));
    }

    static showInfo(message) {
        console.log(chalk.blue(`ℹ️  ${message}`));
    }

    static showProgress(message) {
        console.log(chalk.cyan(`🔄 ${message}`));
    }

    static validateNotEmpty(input, fieldName) {
        return input.trim() !== '' || `${fieldName} es requerido`;
    }

    static validateUrl(input) {
        try {
            new URL(input);
            return true;
        } catch {
            return 'Ingresa una URL válida';
        }
    }

    static async confirmAction(message, defaultValue = false) {
        const { confirmed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: message,
                default: defaultValue
            }
        ]);
        return confirmed;
    }

    static createSeparator() {
        return new inquirer.Separator();
    }

    static formatConfigValue(value, isPassword = false) {
        if (!value) return chalk.gray('No configurado');
        if (isPassword) return chalk.green('***configurada***');
        return chalk.green(value);
    }

    static async selectFromList(message, choices, pageSize = 10) {
        const { selection } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selection',
                message: message,
                choices: choices,
                pageSize: pageSize
            }
        ]);
        return selection;
    }

    static logWithTimestamp(message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${message}`);
    }


    static extractProjectData(rawData){
        return {
            id: rawData.id,
            identificacion: rawData.identificacion,
            creado: rawData.creado,
            alfrescoId: rawData.alfrescoId,
            etapaProyecto: rawData.etapaProyecto?.valor || null,
            nombre: rawData.nombre
        };
    }
}


export default Helpers;