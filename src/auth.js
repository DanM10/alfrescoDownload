const axios = require('axios');

class AlfrescoAuth {
    constructor(baseUrl, username, password) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.password = password;
    }

    createHeaders() {
        return {
            'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
            'Content-Type': 'application/json'
        };
    }

    createAxiosInstance() {
        return axios.create({
            baseURL: this.baseUrl,
            headers: this.createHeaders(),
            timeout: 30000
        });
    }

    async testConnection() {
        try {
            const axiosInstance = this.createAxiosInstance();
            const response = await axiosInstance.get('/api/-default-/public/alfresco/versions/1/nodes/-root-');
            console.log('✅ Connection successful!');
            return true;
        } catch (error) {
            console.error('❌ Connection failed:', error.response?.status, error.response?.statusText);
            return false;
        }
    }
}

module.exports = AlfrescoAuth;