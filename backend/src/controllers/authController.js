// backend/src/controllers/authController.js

const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createClient } = require('@supabase/supabase-js');

require("dotenv").config(); 

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY 
);

// Función auxiliar para subir archivos a Supabase Storage
const uploadFileToSupabase = async (file, folder = 'user-uploads') => {
  const fileExt = file.originalname.split('.').pop();
  const fileName = `${Date.now()}-${file.fieldname}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('user-files') // Tu bucket
    .upload(filePath, file.buffer, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.mimetype,
    });

  if (error) {
    throw new Error(`Error al subir archivo a Supabase: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from('user-files')
    .getPublicUrl(filePath);

  return publicUrlData.publicUrl;
};

// Función para registrar un nuevo usuario
exports.register = async (req, res) => {
  try {
    const { first_name, last_name, email, password, role, id_number, address } = req.body;
    let vehicleDetails = req.body.vehicleDetails ? JSON.parse(req.body.vehicleDetails) : []; // Parseamos el JSON STRING
    
    // NOTA: En el registro inicial NO se reciben archivos por Multer
    // const documentFile = req.files?.document ? req.files.document[0] : null;                   

    // 1. Validar que no falten datos esenciales (id_number y address son requeridos para TODOS)
    if (!first_name || !email || !password || !role || !id_number || !address) {
      return res.status(400).json({ error: "Faltan campos obligatorios: nombre, email, contraseña, rol, identificación y dirección." });
    }
    
    // Validar el rol
    if (role !== 'client' && role !== 'driver') {
      return res.status(400).json({ error: "El rol especificado es inválido. Debe ser 'client' o 'driver'." });
    }

    // Si es un conductor, validar tipos de vehículo y documento
    if (role === 'driver') {
        if (!vehicleDetails || vehicleDetails.length === 0) {
            return res.status(400).json({ error: "Los conductores deben especificar al menos un vehículo con su placa." });
        }
        for (const vehicle of vehicleDetails) {
            if (!vehicle.type || !vehicle.plate_number) { // Color es opcional
                return res.status(400).json({ error: "Cada vehículo debe tener tipo y placa." });
            }
        }
        // NOTA: Documento ya no es obligatorio en el registro inicial (se sube en el perfil)
        // if (!documentFile) { return res.status(400).json({ error: "Los conductores deben subir un documento de identificación." }); }
    }

    // 2. Verificar si el email ya está registrado
    const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "El email ya está registrado." });
    }

    // 3. NO SE SUBEN ARCHIVOS EN EL REGISTRO INICIAL
    let documentUrl = null; // Se establecerá a NULL

    // 4. Encriptar la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. Insertar el nuevo usuario en la base de datos (profile_picture_url y document_url son NULL en registro)
    const userVehicleTypes = role === 'driver' ? vehicleDetails.map(v => v.type) : null;

    const result = await pool.query(
      `INSERT INTO users(first_name, last_name, email, password, created_at, role, is_available, vehicle_types, id_number, address, document_url, profile_picture_url) 
       VALUES($1, $2, $3, $4, NOW(), $5, FALSE, $6, $7, $8, NULL, NULL) 
       RETURNING id, first_name, last_name, email, role, is_available, vehicle_types, id_number, address, document_url, profile_picture_url`, 
      [first_name, last_name || null, email, hashedPassword, role, userVehicleTypes, id_number, address]
    );

    const newUser = result.rows[0];

    // 6. Si es conductor, insertar los detalles de sus vehículos
    if (role === 'driver' && vehicleDetails && vehicleDetails.length > 0) {
        for (const vehicle of vehicleDetails) {
            await pool.query(
                "INSERT INTO vehicles(user_id, type, plate_number, color) VALUES($1, $2, $3, $4)",
                [newUser.id, vehicle.type, vehicle.plate_number, vehicle.color || null] // Color puede ser null
            );
        }
    }

    res.status(201).json({ 
      message: "Usuario registrado exitosamente.",
      user: newUser 
    });

  } catch (err) {
    console.error("Error en el registro:", err.message);
    if (err.code === '23505' && err.constraint === 'vehicles_plate_number_key') {
      return res.status(409).json({ error: "El número de placa ya está registrado." });
    }
    res.status(500).json({ error: "Error interno del servidor al registrar usuario." });
  }
};

// Función para iniciar sesión
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Faltan campos obligatorios: email, password." });
    }

    const userResult = await pool.query(
      "SELECT id, first_name, last_name, email, password, role, is_available, vehicle_types, id_number, address, document_url, profile_picture_url, ST_AsText(last_known_location) as last_known_location_wkt FROM users WHERE email=$1",
      [email]
    );

    if (!userResult.rows.length) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const user = userResult.rows[0];

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role }, 
      process.env.JWT_SECRET || "superSecretJWTKey",
      { expiresIn: "1h" }
    );

    res.status(200).json({
      message: "Login exitoso.",
      token,
      user: { 
        id: user.id, 
        first_name: user.first_name, 
        last_name: user.last_name, 
        email: user.email,
        role: user.role,
        is_available: user.is_available,
        vehicle_types: user.vehicle_types,
        id_number: user.id_number,
        address: user.address,
        document_url: user.document_url,
        profile_picture_url: user.profile_picture_url,
        last_known_location_wkt: user.last_known_location_wkt
      }
    });

  } catch (err) {
    console.error("Error en el login:", err.message);
    res.status(500).json({ error: "Error interno del servidor al iniciar sesión." });
  }
};

// Función para obtener el perfil del usuario autenticado y sus vehículos
exports.getProfile = async (req, res) => {
  try {
    const user_id = req.user.id;
    const result = await pool.query(
      "SELECT id, first_name, last_name, email, role, is_available, vehicle_types, id_number, address, document_url, profile_picture_url, ST_AsText(last_known_location) as last_known_location_wkt FROM users WHERE id = $1", 
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Perfil de usuario no encontrado." });
    }
    const user = result.rows[0];

    // Si es un conductor, obtener también sus vehículos registrados
    if (user.role === 'driver') {
        const vehiclesResult = await pool.query(
            "SELECT id, type, plate_number, color FROM vehicles WHERE user_id = $1",
            [user_id]
        );
        user.registered_vehicles = vehiclesResult.rows;
    }

    res.status(200).json({ user: user });
  } catch (err) {
    console.error("Error al obtener perfil de usuario:", err.message);
    res.status(500).json({ error: "Error interno del servidor al obtener el perfil." });
  }
};

// Función para actualizar el perfil del usuario (solo campos editables)
exports.updateProfile = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { address } = req.body; 
    
    // Archivos subidos por multer
    const profilePictureFile = req.files?.profilePicture ? req.files.profilePicture[0] : null; 
    const documentFile = req.files?.document ? req.files.document[0] : null;                   

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    // Solo permitimos actualizar los campos editables: address
    if (address !== undefined) { updateFields.push(`address = $${paramIndex++}`); params.push(address); }

    // Subir archivos si se proporcionan
    let newProfilePictureUrl = null;
    let newDocumentUrl = null;

    try {
        if (profilePictureFile) { 
            newProfilePictureUrl = await uploadFileToSupabase(profilePictureFile, 'profile-pictures');
            updateFields.push(`profile_picture_url = $${paramIndex++}`); params.push(newProfilePictureUrl);
        }
        if (documentFile) {
            newDocumentUrl = await uploadFileToSupabase(documentFile, 'identification-documents');
            updateFields.push(`document_url = $${paramIndex++}`); params.push(newDocumentUrl);
        }
    } catch (uploadError) {
        console.error("Error al subir archivos en actualización de perfil:", uploadError.message);
        return res.status(500).json({ error: "Error al subir archivos en la actualización del perfil." });
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar." });
    }
    
    params.push(user_id); // El user_id va al final de los parámetros para el WHERE
    const result = await pool.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} 
       RETURNING id, first_name, last_name, email, role, is_available, vehicle_types, id_number, address, document_url, profile_picture_url, ST_AsText(last_known_location) as last_known_location_wkt`, 
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado para actualizar." });
    }

    res.status(200).json({ message: "Perfil actualizado exitosamente.", user: result.rows[0] });
  } catch (err) {
    console.error("Error al actualizar perfil de usuario:", err.message);
    res.status(500).json({ error: "Error interno del servidor al actualizar el perfil." });
  }
};

// Función para cambiar la contraseña del usuario
exports.changePassword = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Faltan la contraseña actual y la nueva." });
    }

    const userResult = await pool.query("SELECT password FROM users WHERE id = $1", [user_id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const storedHashedPassword = userResult.rows[0].password;
    const validOldPassword = await bcrypt.compare(oldPassword, storedHashedPassword);

    if (!validOldPassword) {
      return res.status(401).json({ error: "La contraseña actual es incorrecta." });
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [newHashedPassword, user_id]);

    res.status(200).json({ message: "Contraseña actualizada exitosamente." });
  } catch (err) {
    console.error("Error al cambiar contraseña:", err.message);
    res.status(500).json({ error: "Error interno del servidor al cambiar la contraseña." });
  }
};