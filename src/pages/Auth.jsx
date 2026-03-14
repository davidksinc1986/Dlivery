import { useState } from "react";
import { useAppContext } from "../context/AppContext";
import { formatVehicleType } from "../utils/deliveryUtils";

const testimonials = [
  {
    quote: "Con Dlivery reducimos retrasos un 35% en solo dos semanas.",
    author: "Paula R.",
    role: "E-commerce Manager",
  },
  {
    quote: "Me encanta el seguimiento en tiempo real y lo fácil que es coordinar rutas.",
    author: "Carlos M.",
    role: "Operaciones Logísticas",
  },
];

export default function Auth() {
  const { login, register } = useAppContext();
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [address, setAddress] = useState("");
  const [profilePicture, setProfilePicture] = useState(null);
  const [document, setDocument] = useState(null);
  const [selectedRole, setSelectedRole] = useState("client");
  const [selectedVehicleTypes, setSelectedVehicleTypes] = useState([]);
  const [vehicleDetails, setVehicleDetails] = useState([]);

  const handleVehicleTypeChange = (e) => {
    const { value, checked } = e.target;
    if (checked) {
      setSelectedVehicleTypes((prev) => [...prev, value]);
      setVehicleDetails((prev) => [...prev, { type: value, plate_number: "" }]);
    } else {
      setSelectedVehicleTypes((prev) => prev.filter((type) => type !== value));
      setVehicleDetails((prev) => prev.filter((v) => v.type !== value));
    }
  };

  const handleVehicleDetailChange = (type, plateNumber) => {
    setVehicleDetails((prev) => prev.map((v) => (v.type === type ? { ...v, plate_number: plateNumber } : v)));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");

    if (!isRegistering) {
      const success = await login(email, password);
      if (!success) setAuthError("No se pudo iniciar sesión. Verifica tu correo, contraseña o la conexión al servidor.");
      return;
    }

    if (!firstName || !email || !password || !idNumber || !address) {
      return setAuthError("Completa todos los campos obligatorios.");
    }
    if (!profilePicture) return setAuthError("La foto de perfil es obligatoria.");

    if (selectedRole === "driver") {
      if (!document) return setAuthError("El documento es obligatorio para conductores.");
      if (!vehicleDetails.length || vehicleDetails.some((v) => !v.plate_number)) {
        return setAuthError("Debes registrar al menos un vehículo con placa.");
      }
    }

    const success = await register(
      firstName,
      lastName,
      idNumber,
      address,
      email,
      password,
      selectedRole,
      vehicleDetails,
      profilePicture,
      document
    );

    if (!success) return setAuthError("Error en el registro.");

    alert("Registro exitoso.");
    setIsRegistering(false);
  };

  return (
    <div className="container auth-container">
      <section className="auth-showcase">
        <div className="auth-showcase-header">
          <p className="auth-badge">San Carlos en Línea · Delivery</p>
          <h2>Movilidad inteligente para comercios y clientes de San Carlos</h2>
          <p className="auth-showcase-text">
            Centraliza pedidos, asigna repartidores y monitorea cada entrega en tiempo real con una experiencia clara, rápida y segura.
          </p>
        </div>

        <div className="auth-kpi-strip" aria-hidden="true">
          <article>
            <strong>+1.2K</strong>
            <span>entregas/mes</span>
          </article>
          <article>
            <strong>98%</strong>
            <span>entregas a tiempo</span>
          </article>
          <article>
            <strong>24/7</strong>
            <span>soporte activo</span>
          </article>
        </div>

        <div className="auth-hero-cards" aria-hidden="true">
          <div className="auth-image auth-image-main" />
          <div className="auth-mini-stats">
            <article>
              <h3>Ruta en vivo</h3>
              <p>Ubicación actualizada minuto a minuto para clientes y operadores.</p>
            </article>
            <article>
              <h3>Control operativo</h3>
              <p>Tablero con entregas, choferes y métricas en una sola vista.</p>
            </article>
          </div>
        </div>

        <div className="auth-testimonials" aria-label="Recomendaciones de clientes">
          {testimonials.map((item) => (
            <blockquote key={item.author} className="testimonial-card">
              <p>“{item.quote}”</p>
              <footer>
                <strong>{item.author}</strong>
                <span>{item.role}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="auth-form-panel">
        <p className="auth-form-eyebrow">Acceso plataforma</p>
        <h1>{isRegistering ? "Registro de usuario" : "Inicio de sesión"}</h1>
        <p className="auth-form-help">Usa tus credenciales para entrar al panel operativo.</p>
        {authError && <p className="error-message">{authError}</p>}
        <form onSubmit={onSubmit}>
          {isRegistering && (
            <>
              <div className="form-group"><label>Foto de perfil</label><input type="file" accept="image/*" onChange={(e) => setProfilePicture(e.target.files?.[0] || null)} required /></div>
              <div className="form-group"><label>Nombre</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} required /></div>
              <div className="form-group"><label>Apellido</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            </>
          )}
          <div className="form-group"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="form-group"><label>Contraseña</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>

          {isRegistering && (
            <>
              <div className="form-group"><label>Cédula/Pasaporte</label><input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} required /></div>
              <div className="form-group"><label>Dirección</label><input value={address} onChange={(e) => setAddress(e.target.value)} required /></div>
              <div className="form-group">
                <label>Rol</label>
                <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                  <option value="client">Cliente</option>
                  <option value="driver">Conductor</option>
                </select>
              </div>

              {selectedRole === "driver" && (
                <>
                  <div className="form-group"><label>Documento</label><input type="file" accept="image/*,application/pdf" onChange={(e) => setDocument(e.target.files?.[0] || null)} required /></div>
                  <div className="form-group">
                    <label>Tipos de vehículo</label>
                    <div className="vehicle-type-list">
                      <label><input type="checkbox" value="moto" checked={selectedVehicleTypes.includes("moto")} onChange={handleVehicleTypeChange} /> Moto</label>
                      <label><input type="checkbox" value="camion_liviano" checked={selectedVehicleTypes.includes("camion_liviano")} onChange={handleVehicleTypeChange} /> Camión liviano</label>
                      <label><input type="checkbox" value="camion_pesado" checked={selectedVehicleTypes.includes("camion_pesado")} onChange={handleVehicleTypeChange} /> Camión pesado</label>
                    </div>
                  </div>
                  {selectedVehicleTypes.map((type) => (
                    <div key={type} className="form-group">
                      <label>Placa de {formatVehicleType(type)}</label>
                      <input value={vehicleDetails.find((v) => v.type === type)?.plate_number || ""} onChange={(e) => handleVehicleDetailChange(type, e.target.value)} required />
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          <button type="submit" className="primary-button">{isRegistering ? "Crear cuenta" : "Entrar"}</button>
        </form>

        <button className="primary-button small-button" onClick={() => setIsRegistering((v) => !v)}>
          {isRegistering ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Regístrate"}
        </button>
      </section>
    </div>
  );
}
