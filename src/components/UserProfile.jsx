// src/components/UserProfile.jsx

import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import api from '../api/axios';
import { formatVehicleType } from '../utils/deliveryUtils';

export default function UserProfile({ onClose }) {
const { user, fetchUserProfile, logout } = useAppContext();

// Estados para la información del perfil
const [firstName, setFirstName] = useState(user?.first_name || '');
const [lastName, setLastName] = useState(user?.last_name || '');
const [address, setAddress] = useState(user?.address || ''); 
const [idNumber, setIdNumber] = useState(user?.id_number || ''); 
const [profilePictureUrl, setProfilePictureUrl] = useState(user?.profile_picture_url || ''); // URL actual
const [newProfilePictureFile, setNewProfilePictureFile] = useState(null); // Nuevo archivo para subir
const [newDocumentFile, setNewDocumentFile] = useState(null); // Nuevo archivo de documento para subir

// Estados para cambio de contraseña
const [oldPassword, setOldPassword] = useState('');
const [newPassword, setNewPassword] = useState('');

// Mensajes de estado y errores
const [profileMessage, setProfileMessage] = useState('');
const [passwordMessage, setPasswordMessage] = useState('');
const [profileError, setProfileError] = useState('');
const [passwordError, setPasswordError] = useState('');

// Estados de carga
const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
const [isChangingPassword, setIsChangingPassword] = useState(false);

// Efecto para actualizar los estados locales si 'user' del contexto cambia (ej. al recargar el perfil)
useEffect(() => {
  if (user) {
    setFirstName(user.first_name || '');
    setLastName(user.last_name || '');
    setAddress(user.address || '');
    setIdNumber(user.id_number || '');
    setProfilePictureUrl(user.profile_picture_url || '');
  }
}, [user]);

// Función para actualizar el perfil del usuario (solo campos editables)
const handleUpdateProfile = async (e) => {
  e.preventDefault();
  setProfileMessage('');
  setProfileError('');
  setIsUpdatingProfile(true);

  const formData = new FormData();
  let hasChanges = false;

  // Solo actualizamos campos permitidos para edición
  if (address !== (user?.address || '')) { // Comprobar si la dirección ha cambiado
      formData.append('address', address);
      hasChanges = true;
  }
  if (newProfilePictureFile) { // Si hay un nuevo archivo de imagen de perfil
      formData.append('profilePicture', newProfilePictureFile); // 'profilePicture' coincide con el nombre en Multer
      hasChanges = true;
  }
  if (user?.role === 'driver' && newDocumentFile) { // Si es conductor y hay un nuevo archivo de documento
      formData.append('document', newDocumentFile); // 'document' coincide con el nombre en Multer
      hasChanges = true;
  }
  
  // No permitimos cambiar first_name, last_name, email, id_number desde aquí por seguridad/reglas.

  if (!hasChanges) {
      setProfileError('No hay cambios para guardar.');
      setIsUpdatingProfile(false);
      return;
  }

  try {
    // Usar PUT para actualizar el perfil
    const response = await api.put('/auth/profile', formData); 
    setProfileMessage(response.data.message);
    setNewProfilePictureFile(null); // Limpiar el archivo seleccionado
    setNewDocumentFile(null); // Limpiar el archivo de documento seleccionado
    fetchUserProfile(); // Recargar el perfil para actualizar el contexto y UI
  } catch (error) {
    setProfileError(error.response?.data?.error || 'Error al actualizar el perfil.');
  } finally {
    setIsUpdatingProfile(false);
  }
};

// Función para cambiar la contraseña
const handleChangePassword = async (e) => {
  e.preventDefault();
  setPasswordMessage('');
  setPasswordError('');
  setIsChangingPassword(true);
  if (!oldPassword || !newPassword) {
    setPasswordError('Por favor, completa ambos campos de contraseña.');
    setIsChangingPassword(false);
    return;
  }
  if (oldPassword === newPassword) {
    setPasswordError('La nueva contraseña no puede ser igual a la actual.');
    setIsChangingPassword(false);
    return;
  }
  try {
    await api.put('/auth/change-password', { oldPassword, newPassword });
    setPasswordMessage('Contraseña actualizada. Por favor, inicia sesión de nuevo.');
    setOldPassword('');
    setNewPassword('');
    alert('Contraseña actualizada. Por favor, inicia sesión de nuevo.');
    logout(); // Forzar cierre de sesión por seguridad
  } catch (error) {
    setPasswordError(error.response?.data?.error || 'Error al cambiar la contraseña.');
  } finally {
    setIsChangingPassword(false);
  }
};

return (
  <div className="user-profile-section container">
    <button onClick={onClose} className="primary-button back-button">Volver</button>
    <h2>Mi Perfil</h2>
    {profileError && <p className="error-message">{profileError}</p>}
    {profileMessage && <p className="success-message">{profileMessage}</p>}

    <form onSubmit={handleUpdateProfile}>
      <div className="profile-details">
          <div className="form-group profile-picture-group">
              <label>Foto de Perfil:</label>
              {user?.profile_picture_url && <img src={user.profile_picture_url} alt="Perfil" className="profile-avatar" />}
              {!user?.profile_picture_url && <div className="profile-avatar-placeholder">Sin Foto</div>}
              <input
                  id="newProfilePicture"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewProfilePictureFile(e.target.files[0])}
                  style={{marginTop: '10px'}}
              />
          </div>
          
          <div className="profile-info-display">
              <div className="form-group">
              <label htmlFor="profileFirstName">Nombre:</label>
              <input id="profileFirstName" type="text" value={firstName} readOnly disabled />
              </div>
              <div className="form-group">
              <label htmlFor="profileLastName">Apellido:</label>
              <input id="profileLastName" type="text" value={lastName} readOnly disabled />
              </div>
              <div className="form-group">
              <label htmlFor="profileEmail">Email:</label>
              <input id="profileEmail" type="email" value={user?.email || ''} readOnly disabled />
              </div>
              <div className="form-group">
                <label htmlFor="idNumber">Cédula / Pasaporte:</label>
                <input id="idNumber" type="text" value={idNumber} readOnly disabled />
              </div>
              <div className="form-group">
                  <label htmlFor="address">Dirección de Residencia:</label>
                  <input id="address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              {user?.role === 'driver' && (
                <> {/* <--- FRAGMENTO AÑADIDO */}
                  <div className="form-group">
                      <label htmlFor="newDocument">Documento de Identidad:</label>
                      {user?.document_url ? (
                          <a href={user.document_url} target="_blank" rel="noopener noreferrer" className="document-link">Ver Documento Actual</a>
                      ) : (
                          <p>No se ha subido documento.</p>
                      )}
                      <input
                          id="newDocument"
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => setNewDocumentFile(e.target.files[0])}
                          style={{marginTop: '10px'}}
                      />
                  </div>
                  <div className="form-group">
                      <label>Vehículos:</label>
                      {user?.registered_vehicles && user.registered_vehicles.length > 0 ? (
                          <div className="vehicles-list">
                              {user.registered_vehicles.map(vehicle => (
                                  <div key={vehicle.id} className="vehicle-card">
                                      <h4>{formatVehicleType(vehicle.type)}</h4>
                                      <p>Placa: {vehicle.plate_number}</p>
                                      {vehicle.color && <p>Color: {vehicle.color}</p>}
                                      {/* Aquí iría el SVG del tipo de vehículo */}
                                      {vehicle.type === 'moto' && <span role="img" aria-label="moto">🏍️</span>}
                                      {vehicle.type === 'camion_liviano' && <span role="img" aria-label="camion liviano">🚚</span>}
                                      {vehicle.type === 'camion_pesado' && <span role="img" aria-label="camion pesado">🚛</span>}
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <p>No hay vehículos registrados.</p>
                      )}
                  </div>
                </> /* <--- CIERRE DE FRAGMENTO */
              )}
          </div>
      </div> {/* Cierre de profile-details */}

      <button type="submit" className="primary-button" disabled={isUpdatingProfile}>
        {isUpdatingProfile ? 'Guardando Cambios...' : 'Guardar Cambios del Perfil'}
      </button>
    </form>

    <h2 style={{marginTop: '30px'}}>Cambiar Contraseña</h2>
    {passwordError && <p className="error-message">{passwordError}</p>}
    {passwordMessage && <p className="success-message">{passwordMessage}</p>}
    <form onSubmit={handleChangePassword}>
      <div className="form-group">
        <label htmlFor="oldPassword">Contraseña Actual:</label>
        <input
          id="oldPassword"
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="newPassword">Nueva Contraseña:</label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="primary-button" disabled={isChangingPassword}>
        {isChangingPassword ? 'Cambiando...' : 'Cambiar Contraseña'}
      </button>
    </form>

    {/* Placeholder para Métodos de Pago / Cuentas Bancarias */}
    <h2 style={{marginTop: '30px'}}>Gestión de Pagos</h2>
    <p>Aquí podrás agregar y gestionar tus tarjetas de crédito (clientes) o cuentas bancarias para depósitos (conductores).</p>
    <button className="primary-button" disabled>Configurar Métodos de Pago</button>
  </div>
);
}