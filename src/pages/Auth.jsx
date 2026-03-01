// src/pages/Auth.jsx

import { useState } from "react";
import { useAppContext } from "../context/AppContext";
import { formatVehicleType } from "../utils/deliveryUtils"; 

export default function Auth() {
const { login, register } = useAppContext();

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [firstName, setFirstName] = useState(""); 
const [lastName, setLastName] = useState(""); 
const [idNumber, setIdNumber] = useState(""); 
const [address, setAddress] = useState(""); 
const [document, setDocument] = useState(null);           // Archivo File para documento
const [isRegistering, setIsRegistering] = useState(false);
const [authError, setAuthError] = useState("");

const [selectedRole, setSelectedRole] = useState("client"); 
const [selectedVehicleTypes, setSelectedVehicleTypes] = useState([]); 
const [vehicleDetails, setVehicleDetails] = useState([]); // Detalles de los vehículos (placa, color)

const handleVehicleTypeChange = (e) => {
  const { value, checked } = e.target;
  if (checked) {
    setSelectedVehicleTypes((prev) => [...prev, value]);
    setVehicleDetails((prev) => {
      if (!prev.find(v => v.type === value)) {
        return [...prev, { type: value, plate_number: '', color: '' }]; 
      }
      return prev;
    });
  } else {
    setSelectedVehicleTypes((prev) => prev.filter((type) => type !== value));
    setVehicleDetails((prev) => prev.filter(v => v.type !== value));
  }
};

const handleVehicleDetailChange = (type, field, value) => {
  setVehicleDetails((prev) => prev.map(v => 
    v.type === type ? { ...v, [field]: value } : v
  ));
};

const handleAuthSubmit = async (e) => {
  e.preventDefault();
  setAuthError(""); 

  let success = false;
  if (isRegistering) {
      // Validaciones generales para el registro
      if (!firstName || !email || !password || !idNumber || !address) {
          setAuthError("Por favor, completa Nombre, Email, Contraseña, Cédula/Pasaporte y Dirección.");
          return;
      }

      if (selectedRole === "driver") {
          if (selectedVehicleTypes.length === 0) {
              setAuthError("Los conductores deben seleccionar al menos un tipo de vehículo.");
              return;
          }
          if (!document) { // Documento es obligatorio para conductores
              setAuthError("Los conductores deben subir un documento de identificación.");
              return;
          }
          // Validar que todos los detalles de vehículos seleccionados estén completos
          for (const vehicle of vehicleDetails) {
              if (!vehicle.type || !vehicle.plate_number) { // Color es opcional, no se valida
                  setAuthError(`Por favor, completa la placa para el vehículo tipo ${formatVehicleType(vehicle.type)}.`);
                  return;
              }
          }
      }
      
      success = await register(
          firstName, 
          lastName, 
          idNumber, 
          address, 
          email, 
          password, 
          selectedRole, 
          vehicleDetails, 
          document
      );
      if (success) {
          alert("Registro exitoso. ¡Ahora puedes iniciar sesión!");
          setIsRegistering(false); 
          // Limpiar estados
          setFirstName("");
          setLastName("");
          setIdNumber("");
          setAddress("");
          setEmail("");
          setPassword("");
          setDocument(null);      
          setSelectedRole("client");
          setSelectedVehicleTypes([]);
          setVehicleDetails([]);
      } else {
          setAuthError("Error en el registro. Intenta de nuevo.");
      }
  } else {
      success = await login(email, password);
      if (!success) {
          setAuthError("Email o contraseña incorrectos.");
      }
  }
};

return (
  <div className="container auth-container">
    <h1>{isRegistering ? "Registro" : "Inicio de Sesión"}</h1>
    <form onSubmit={handleAuthSubmit}>
      {isRegistering && (
           <> {/* FRAGMENTO AÑADIDO PARA AGRUPAR CAMPOS */}
            <div className="form-group">
              <label htmlFor="firstName">Nombre:</label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="lastName">Apellido:</label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </>
      )}
      <div className="form-group">
        <label htmlFor="email">Email:</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="password">Contraseña:</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {isRegistering && (
           <> {/* FRAGMENTO AÑADIDO PARA AGRUPAR CAMPOS */}
              {/* Campos de Cédula/Pasaporte y Dirección de Residencia */}
              <div className="form-group">
                  <label htmlFor="idNumber">Cédula / Pasaporte:</label>
                  <input
                      id="idNumber"
                      type="text"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      required
                  />
              </div>
              <div className="form-group">
                  <label htmlFor="address">Dirección de Residencia:</label>
                  <input
                      id="address"
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                  />
              </div>
              
              {/* Selección de Rol */}
              <div className="form-group" style={{marginTop: '20px'}}>
                  <label>Registrarse como:</label>
                  <div>
                      <input 
                          type="radio" 
                          id="roleClient" 
                          name="role" 
                          value="client" 
                          checked={selectedRole === "client"} 
                          onChange={(e) => setSelectedRole(e.target.value)} 
                      />
                      <label htmlFor="roleClient" style={{display: 'inline', marginLeft: '5px', marginRight: '15px'}}>Cliente</label>
                      <input 
                          type="radio" 
                          id="roleDriver" 
                          name="role" 
                          value="driver" 
                          checked={selectedRole === "driver"} 
                          onChange={(e) => setSelectedRole(e.target.value)} 
                      />
                      <label htmlFor="roleDriver" style={{display: 'inline', marginLeft: '5px'}}>Conductor</label>
                  </div>
              </div>

              {selectedRole === "driver" && ( // Solo para conductores
                    <> {/* FRAGMENTO AÑADIDO */}
                      <div className="form-group">
                          <label htmlFor="document">Documento de Identidad (PDF/Imagen):</label>
                          <input
                              id="document"
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => setDocument(e.target.files[0])}
                              required
                          />
                          {document && <p style={{fontSize: '0.8em', color: '#555'}}>Archivo seleccionado: {document.name}</p>}
                      </div>
                      <div className="form-group" style={{marginTop: '15px'}}>
                          <label>Tipos de Vehículo:</label>
                          <div>
                              {/* Checkboxes de tipos de vehículo */}
                              <input type="checkbox" id="moto" value="moto" checked={selectedVehicleTypes.includes("moto")} onChange={handleVehicleTypeChange} />
                              <label htmlFor="moto" style={{display: 'inline', marginLeft: '5px', marginRight: '15px'}}>Moto</label>
                              <input type="checkbox" id="camion_liviano" value="camion_liviano" checked={selectedVehicleTypes.includes("camion_liviano")} onChange={handleVehicleTypeChange} />
                              <label htmlFor="camion_liviano" style={{display: 'inline', marginLeft: '5px', marginRight: '15px'}}>Camión Liviano</label>
                              <input type="checkbox" id="camion_pesado" value="camion_pesado" checked={selectedVehicleTypes.includes("camion_pesado")} onChange={handleVehicleTypeChange} />
                              <label htmlFor="camion_pesado" style={{display: 'inline', marginLeft: '5px'}}>Camión Pesado</label>
                          </div>
                          {/* Campos de Placa y Color para cada vehículo seleccionado */}
                          {selectedVehicleTypes.map(type => ( // Solo mostrar los detalles de los vehículos seleccionados
                              <div key={type} className="vehicle-details-group" style={{marginTop: '10px', padding: '10px', border: '1px solid #eee', borderRadius: '5px'}}>
                                  <h4>Detalles de {formatVehicleType(type)}</h4>
                                  <div className="form-group">
                                      <label htmlFor={`plate-${type}`}>Placa:</label>
                                      <input
                                          id={`plate-${type}`}
                                          type="text"
                                          value={vehicleDetails.find(v => v.type === type)?.plate_number || ''} // Obtener valor del estado
                                          onChange={(e) => handleVehicleDetailChange(type, 'plate_number', e.target.value)}
                                          required
                                      />
                                  </div>
                                  {/* Campo Color Eliminado */}
                                  {/* <div className="form-group">
                                      <label htmlFor={`color-${type}`}>Color (Opcional):</label>
                                      <input
                                          id={`color-${type}`}
                                          type="text"
                                          value={vehicleDetails.find(v => v.type === type)?.color || ''}
                                          onChange={(e) => handleVehicleDetailChange(type, 'color', e.target.value)}
                                      />
                                  </div> */}
                              </div>
                          ))}
                      </div>
                  </> /* <--- CIERRE DE FRAGMENTO */
              )}
          </> /* <--- CIERRE DE FRAGMENTO */
      )}

      {authError && <p className="error-message">{authError}</p>}
      <button type="submit" className="primary-button">
        {isRegistering ? "Registrarse" : "Iniciar Sesión"}
      </button>
    </form>
    <p className="toggle-auth">
      {isRegistering ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"}{" "}
      <span onClick={() => setIsRegistering(!isRegistering)}>
        {isRegistering ? "Inicia Sesión" : "Regístrate aquí"}
      </span>
    </p>
  </div>
);
}