import axios from 'axios';

// Crea una instancia de Axios con la URL base de backend
const api = axios.create({
    baseURL: 'http://localhost:3001', // ¡Asegúrate que coincida con el puerto de tu backend!
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor para añadir el token JWT a las solicitudes salientes
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token'); // Obtiene el token del almacenamiento local
        if (token) {
            config.headers.Authorization = `Bearer ${token}`; // Si hay token, lo añade al encabezado
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default api;