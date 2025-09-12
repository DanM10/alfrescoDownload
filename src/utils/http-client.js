import axios from 'axios';

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

class HttpClient {
    static async makeRequest(url, options = {}) {
        try {
            const response = await axios.get(url, {
                timeout: options.timeout || 10000,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            return {
                success: true,
                status: response.status,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                status: error.response?.status,
                message: error.message
            };
        }
    }

    static async makeAuthenticatedRequest(url, credentials, options = {}) {
        const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');

        return this.makeRequest(url, {
            ...options,
            headers: {
                'Authorization': `Basic ${auth}`,
                ...options.headers
            }
        });
    }
}

export default HttpClient;