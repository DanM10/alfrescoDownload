import Helpers from "./helpers.js";
import chalk from "chalk";
import axios from "axios";
import HttpClient from "./http-client.js";

const testAlfrescoConnection = async (alfrescoConfig) =>   {
    Helpers.showProgress('Probando conexión a Alfresco...');

    try {
        const auth = Buffer.from(`${alfrescoConfig.username}:${alfrescoConfig.password}`).toString('base64');
        const headers = {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
        };

        const alfrescoUrl = `${alfrescoConfig.baseUrl}/api/-default-/public/alfresco/versions/1/probes/-ready-`;

        console.log(chalk.gray(`   └─ Conectando a: ${alfrescoUrl}`));

        const response = await axios.get(alfrescoUrl, {
            headers: headers,
            timeout: 10000,
            validateStatus: function (status) {
                return status >= 200 && status < 300;
            }
        });

        if (response.data) {
            Helpers.showSuccess(`Alfresco: Conectado correctamente (${response.status})`);
            console.log(chalk.gray(`   └─ Node encontrado: ${response.data.entry.name || 'Root'} (${response.data.entry.nodeType})`));
            return true;
        } else {
            Helpers.showWarning('Alfresco: Conectado pero respuesta inesperada');
            return false;
        }

    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            Helpers.showError('Alfresco: Timeout - el servidor no responde');
        } else if (error.response) {
            // El servidor respondió con un código de error
            const status = error.response.status;
            const statusText = error.response.statusText;

            if (status === 401) {
                Helpers.showError('Alfresco: Error de autenticación (401) - Verifica credenciales');
            } else if (status === 403) {
                Helpers.showError('Alfresco: Acceso denegado (403) - Sin permisos');
            } else if (status >= 500) {
                Helpers.showError(`Alfresco: Error del servidor (${status}) - ${statusText}`);
            } else {
                Helpers.showError(`Alfresco: Error ${status} - ${statusText}`);
            }
        } else if (error.request) {
            Helpers.showError('Alfresco: Sin respuesta del servidor - Verifica URL y conectividad');
        } else {
            Helpers.showError(`Alfresco: Error de configuración - ${error.message}`);
        }

        console.log(chalk.gray(`   └─ Detalle: ${error.message}`));
        return false;
    }
}


const testApiConnection = async (apiConfig) => {
    Helpers.showProgress('Probando conexión a API...');

    try {
        const apiUrl = `${apiConfig.baseUrl}/test`;

        console.log(chalk.gray(`   └─ Conectando a: ${apiUrl}`));


        let response = await HttpClient.makeRequest(apiUrl, {
            timeout: 15000
        });


        console.log(response.data)

        Helpers.showSuccess(`API: Conectado correctamente (${response.status})`);

        if (response.data) {
            if (response.data.status) {
                console.log(chalk.gray(`   └─ Estado: ${response.data.status}`));
            }
            if (response.data.version) {
                console.log(chalk.gray(`   └─ Versión: ${response.data.version}`));
            }
        }

        return true;

    } catch (error) {
        console.log(error)
        if (error.code === 'ECONNABORTED') {
            Helpers.showError('API: Timeout - el servidor no responde');
        } else if (error.response) {
            const status = error.response.status;
            const statusText = error.response.statusText;

            if (status === 404) {
                console.log(chalk.gray(`   └─ Endpoint /health no encontrado, probando URL base...`));
                return await testApiConnectionFallback(apiConfig);
            } else if (status >= 500) {
                Helpers.showError(`API: Error del servidor (${status}) - ${statusText}`);
            } else {
                Helpers.showError(`API: Error ${status} - ${statusText}`);
            }
        } else if (error.request) {
            Helpers.showError('API: Sin respuesta del servidor - Verifica URL y conectividad');
        } else {
            Helpers.showError(`API: Error de configuración - ${error.message}`);
        }

        console.log(chalk.gray(`   └─ Detalle: ${error.message}`));
        return false;
    }
}

const testApiConnectionFallback = async (apiConfig) => {
    try {
        const response = await axios.get(apiConfig.baseUrl, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 500;
            }
        });

        if (response.status >= 200 && response.status < 300) {
            Helpers.showSuccess(`API: Conectado correctamente (${response.status})`);
            console.log(chalk.gray(`   └─ Usando URL base como endpoint de prueba`));
            return true;
        } else {
            Helpers.showWarning(`API: Respuesta recibida pero con código ${response.status}`);
            return false;
        }

    } catch (fallbackError) {
        Helpers.showError('API: No se pudo conectar ni al endpoint /health ni a la URL base');
        return false;
    }
}

const getRequest = (baseUrl) => {
    const request = {
        url: `${baseUrl}`,
        method: 'get',
    };
    return axios(request);
};


export { testAlfrescoConnection, testApiConnection, getRequest };