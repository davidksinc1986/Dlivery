const jwt = require("jsonwebtoken"); // Necesitamos JWT para verificar los tokens

// Middleware para verificar el token JWT en las solicitudes
exports.verifyToken = (req, res, next) => {
  // 1. Obtener el token del encabezado de autorización
  // Los tokens JWT se envían típicamente en el encabezado "Authorization" con el prefijo "Bearer "
  // Ejemplo: Authorization: Bearer YOUR_SUPER_LONG_JWT_TOKEN_HERE
  const authHeader = req.headers['authorization'];
  // Si no hay encabezado Authorization, no hay token
  if (!authHeader) {
    return res.status(403).json({ error: "No se proporcionó encabezado de autorización." });
  }
  
  const token = authHeader.split(' ')[1]; // Divide "Bearer YOURTOKEN" y toma la segunda parte (el token)

  // 2. Si no se pudo extraer el token (por ejemplo, si no tiene el prefijo "Bearer "), denegar acceso
  if (!token) {
    return res.status(403).json({ error: "Formato de token incorrecto. Use 'Bearer [token]'." });
  }

  try {
    // 3. Verificar el token usando la clave secreta
    // Aquí usamos process.env.JWT_SECRET o la misma clave por defecto que en authController.js
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "superSecretJWTKey");
    
    // 4. Adjuntar la información del usuario decodificada al objeto de solicitud (req)
    // Esto hace que el ID y email del usuario estén disponibles en los controladores posteriores
    req.user = decoded; 
    
    // 5. Llamar a 'next()' para pasar el control a la siguiente función middleware o al controlador de ruta
    next(); 
  } catch (err) {
    // Si la verificación falla (token expirado, mal firmado, etc.), denegar acceso
    console.error("Error al verificar token JWT:", err.message);
    return res.status(401).json({ error: "Token inválido o expirado. Acceso no autorizado." });
  }
};