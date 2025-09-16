import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

class ErrorLogger {
    constructor() {
        this.errorLogPath = './logs/download-errors.json';
        this.sessionLogPath = './logs/session-log.txt';
    }

    async logError(asset, error, context = 'download') {
        try {
            const errorEntry = {
                timestamp: new Date().toISOString(),
                context: context,
                asset: {
                    etiqueta: asset.etiqueta,
                    alfrescoId: asset.alfrescoId,
                    nuevoNombre: asset.nuevoNombre || null
                },
                error: {
                    message: error.message,
                    stack: error.stack
                }
            };

            // Asegurar que existe el directorio
            await fs.ensureDir(path.dirname(this.errorLogPath));

            // Cargar errores existentes
            let errors = [];
            if (await fs.pathExists(this.errorLogPath)) {
                errors = await fs.readJson(this.errorLogPath);
            }

            // Agregar nuevo error
            errors.push(errorEntry);

            // Guardar
            await fs.writeJson(this.errorLogPath, errors, { spaces: 2 });

            // Log en consola
            console.log(chalk.red(`📝 Error registrado: ${asset.etiqueta} - ${error.message}`));

            // Log en archivo de sesión
            await this.logSession(`ERROR: ${asset.etiqueta} - ${error.message}`);

        } catch (logError) {
            console.log(chalk.red(`Error guardando log: ${logError.message}`));
        }
    }

    async logSession(message) {
        try {
            await fs.ensureDir(path.dirname(this.sessionLogPath));
            const timestamp = new Date().toISOString();
            const logLine = `[${timestamp}] ${message}\n`;
            await fs.appendFile(this.sessionLogPath, logLine);
        } catch (error) {
            // Silent fail para logs de sesión
        }
    }

    async getErrorSummary() {
        try {
            if (await fs.pathExists(this.errorLogPath)) {
                const errors = await fs.readJson(this.errorLogPath);
                return {
                    total: errors.length,
                    byAsset: errors.reduce((acc, error) => {
                        const key = error.asset.etiqueta;
                        acc[key] = (acc[key] || 0) + 1;
                        return acc;
                    }, {}),
                    recent: errors.slice(-10) // Últimos 10 errores
                };
            }
            return { total: 0, byAsset: {}, recent: [] };
        } catch (error) {
            return { total: 0, byAsset: {}, recent: [] };
        }
    }

    async clearErrorLog() {
        try {
            if (await fs.pathExists(this.errorLogPath)) {
                await fs.remove(this.errorLogPath);
                console.log(chalk.green('📝 Log de errores limpiado'));
            }
        } catch (error) {
            console.log(chalk.red(`Error limpiando log: ${error.message}`));
        }
    }
}

export default ErrorLogger;