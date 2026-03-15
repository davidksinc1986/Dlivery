import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useAppContext } from "../context/AppContext";
import MapComponent from "../components/Map/MapComponent";

const TAB_USERS = "users";
const TAB_DRIVERS = "drivers";
const TAB_COMPANIES = "companies";
const TAB_WIZARD = "wizard";

const emptyPerson = { first_name: "", last_name: "", email: "", password: "" };
const emptyCompany = { name: "", contact_name: "", contact_email: "", phone: "", status: "active", notes: "" };

export default function AdminDashboard() {
  const { user, logout } = useAppContext();
  const [activeTab, setActiveTab] = useState(TAB_USERS);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [smartPlans, setSmartPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [liveDrivers, setLiveDrivers] = useState([]);

  const [newUser, setNewUser] = useState(emptyPerson);
  const [newDriver, setNewDriver] = useState(emptyPerson);
  const [newCompany, setNewCompany] = useState(emptyCompany);

  const [wizardStep, setWizardStep] = useState(1);
  const [plannerForm, setPlannerForm] = useState({
    company_name: "",
    monthly_priority_active: true,
    max_deviation_km: 3,
    start_point: { lat: 9.9358, lng: -84.0994, address: "Sabana" },
    end_point: { lat: 10.0162, lng: -84.2116, address: "Alajuela" },
    packages: [{ label: "Paquete 1", lat: 9.9963, lng: -84.2111, vehicle_type: "moto", load_type: "ligero" }],
  });

  const loadAll = async () => {
    const [ov, us, dr, cp, sr] = await Promise.all([
      api.get("/admin/overview"),
      api.get("/admin/users"),
      api.get("/admin/drivers"),
      api.get("/admin/companies"),
      api.get("/admin/smart-routes"),
    ]);

    setOverview(ov.data);
    setUsers(us.data.filter((row) => row.role !== "driver"));
    setDrivers(dr.data);
    setCompanies(cp.data);
    setSmartPlans(sr.data);
    if (!selectedPlan && sr.data.length) setSelectedPlan(sr.data[0]);
  };

  const loadLiveDriverLocations = async () => {
    const response = await api.get("/admin/drivers/live-locations");
    setLiveDrivers(response.data);
  };

  useEffect(() => {
    loadAll();
    loadLiveDriverLocations();
  }, []);

  const upsertEntity = async (type, row, editing = false) => {
    const id = row.id;
    const endpoint = `/admin/${type}${editing ? `/${id}` : ""}`;
    const method = editing ? "put" : "post";
    await api[method](endpoint, row);
    await loadAll();
  };

  const deleteEntity = async (type, id) => {
    if (!window.confirm("¿Seguro que deseas borrar este registro?")) return;
    await api.delete(`/admin/${type}/${id}`);
    await loadAll();
  };

  const addWizardPackage = () => {
    setPlannerForm((prev) => ({
      ...prev,
      packages: [...prev.packages, { label: `Paquete ${prev.packages.length + 1}`, lat: 9.99, lng: -84.2, vehicle_type: "moto", load_type: "ligero" }],
    }));
  };

  const updateWizardPackage = (idx, key, value) => {
    setPlannerForm((prev) => {
      const next = [...prev.packages];
      next[idx] = { ...next[idx], [key]: value };
      return { ...prev, packages: next };
    });
  };

  const createSmartPlan = async () => {
    const response = await api.post("/deliveries/smart-plan", {
      company_name: plannerForm.company_name,
      monthly_priority_active: plannerForm.monthly_priority_active,
      max_deviation_km: Number(plannerForm.max_deviation_km),
      start_point: plannerForm.start_point,
      end_point: plannerForm.end_point,
      packages: plannerForm.packages.map((p, index) => ({ ...p, id: p.id || `pkg-${index + 1}` })),
    });

    alert("Plan inteligente generado");
    await loadAll();
    setSelectedPlan({ id: response.data.plan_id, company_name: plannerForm.company_name, payload: response.data.plan });
    setWizardStep(4);
  };

  const mapData = useMemo(() => {
    const payload = selectedPlan?.payload;
    if (!payload?.routes?.length) return { markers: [], circles: [], polylines: [] };
    const markers = [];
    const circles = [];
    const polylines = [];

    payload.routes.forEach((route) => {
      markers.push({ position: [route.origin.lat, route.origin.lng], popupText: `Origen · ${route.vehicle_type}` });
      markers.push({ position: [route.destination.lat, route.destination.lng], popupText: `Destino · ${route.vehicle_type}` });
      route.stops.forEach((stop) => markers.push({ position: [stop.lat, stop.lng], popupText: `${stop.stop_order}. ${stop.label}` }));
      route.circles.forEach((circle) => circles.push({ center: circle.center, radius: circle.radius_m, color: "#f0b90b", fillOpacity: 0.12 }));
      polylines.push({ positions: route.polyline, color: "#f0b90b" });
    });

    return { markers, circles, polylines };
  }, [selectedPlan]);

  const liveDriverMarkers = useMemo(() => liveDrivers
    .filter((driver) => Number.isFinite(Number(driver.lat)) && Number.isFinite(Number(driver.lng)))
    .map((driver) => ({ position: [Number(driver.lat), Number(driver.lng)], popupText: `${driver.first_name} ${driver.last_name}` })), [liveDrivers]);

  const EditableTable = ({ rows, type, setRows }) => (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>{Object.keys(rows[0] || {}).filter((k) => !["created_at", "profile_picture_url", "vehicles"].includes(k)).map((k) => <th key={k}>{k}</th>)}<th>acciones</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              {Object.entries(row).filter(([k]) => !["created_at", "profile_picture_url", "vehicles"].includes(k)).map(([key, value]) => (
                <td key={key}>
                  {key === "id" ? value : (
                    <input
                      value={value ?? ""}
                      onChange={(e) => {
                        const clone = [...rows];
                        clone[index] = { ...clone[index], [key]: e.target.value };
                        setRows(clone);
                      }}
                    />
                  )}
                </td>
              ))}
              <td>
                <button className="small-button primary-button" onClick={() => upsertEntity(type, row, true)}>Guardar</button>
                <button className="small-button logout-button" onClick={() => deleteEntity(type, row.id)}>Borrar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="container admin-biance">
      <header className="app-header admin-header-dark">
        <h1>Super Dashboard</h1>
        <div className="user-info">
          <span>{user?.first_name} {user?.last_name}</span>
          <button className="logout-button" onClick={logout}>Cerrar sesión</button>
        </div>
      </header>

      <div className="binance-kpis">
        <div className="delivery-card"><h3>Usuarios</h3><p>{overview?.users || 0}</p></div>
        <div className="delivery-card"><h3>Conductores</h3><p>{overview?.drivers || 0}</p></div>
        <div className="delivery-card"><h3>Entregas</h3><p>{overview?.deliveries || 0}</p></div>
        <div className="delivery-card"><h3>Ingresos</h3><p>₡{overview?.grossRevenue || 0}</p></div>
      </div>

      <div className="admin-tabs">
        {[TAB_USERS, TAB_DRIVERS, TAB_COMPANIES, TAB_WIZARD].map((tab) => (
          <button key={tab} className={`tab-pill ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
      </div>

      {activeTab === TAB_USERS && (
        <section className="delivery-list-section">
          <h2>Usuarios (CRUD)</h2>
          <div className="admin-inline-inputs">
            <input placeholder="Nombre" value={newUser.first_name} onChange={(e) => setNewUser((p) => ({ ...p, first_name: e.target.value }))} />
            <input placeholder="Apellido" value={newUser.last_name} onChange={(e) => setNewUser((p) => ({ ...p, last_name: e.target.value }))} />
            <input placeholder="Email" value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} />
            <input placeholder="Password" type="password" value={newUser.password} onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))} />
            <button className="primary-button" onClick={async () => { await upsertEntity("users", { ...newUser, role: "client" }); setNewUser(emptyPerson); }}>Crear</button>
          </div>
          <EditableTable rows={users} type="users" setRows={setUsers} />
        </section>
      )}

      {activeTab === TAB_DRIVERS && (
        <section className="delivery-list-section">
          <h2>Conductores (CRUD + mapa live)</h2>
          <div className="admin-inline-inputs">
            <input placeholder="Nombre" value={newDriver.first_name} onChange={(e) => setNewDriver((p) => ({ ...p, first_name: e.target.value }))} />
            <input placeholder="Apellido" value={newDriver.last_name} onChange={(e) => setNewDriver((p) => ({ ...p, last_name: e.target.value }))} />
            <input placeholder="Email" value={newDriver.email} onChange={(e) => setNewDriver((p) => ({ ...p, email: e.target.value }))} />
            <input placeholder="Password" type="password" value={newDriver.password} onChange={(e) => setNewDriver((p) => ({ ...p, password: e.target.value }))} />
            <button className="primary-button" onClick={async () => { await upsertEntity("drivers", newDriver); setNewDriver(emptyPerson); }}>Crear</button>
          </div>
          <EditableTable rows={drivers} type="drivers" setRows={setDrivers} />
          <div className="map-block">
            <MapComponent center={liveDriverMarkers[0]?.position || [9.9358, -84.0994]} markers={liveDriverMarkers} height="340px" />
          </div>
        </section>
      )}

      {activeTab === TAB_COMPANIES && (
        <section className="delivery-list-section">
          <h2>Empresas (CRM interno)</h2>
          <div className="admin-inline-inputs">
            <input placeholder="Empresa" value={newCompany.name} onChange={(e) => setNewCompany((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder="Contacto" value={newCompany.contact_name} onChange={(e) => setNewCompany((p) => ({ ...p, contact_name: e.target.value }))} />
            <input placeholder="Correo" value={newCompany.contact_email} onChange={(e) => setNewCompany((p) => ({ ...p, contact_email: e.target.value }))} />
            <input placeholder="Teléfono" value={newCompany.phone} onChange={(e) => setNewCompany((p) => ({ ...p, phone: e.target.value }))} />
            <button className="primary-button" onClick={async () => { await upsertEntity("companies", newCompany); setNewCompany(emptyCompany); }}>Crear</button>
          </div>
          <EditableTable rows={companies} type="companies" setRows={setCompanies} />
        </section>
      )}

      {activeTab === TAB_WIZARD && (
        <section className="create-delivery-section wizard-wrap">
          <h2>Planificador Inteligente (Wizard)</h2>
          <div className="wizard-steps">
            {[1, 2, 3, 4].map((step) => <button key={step} className={`tab-pill ${wizardStep === step ? "active" : ""}`} onClick={() => setWizardStep(step)}>Paso {step}</button>)}
          </div>

          {wizardStep === 1 && (
            <div className="wizard-panel">
              <input placeholder="Empresa" value={plannerForm.company_name} onChange={(e) => setPlannerForm((p) => ({ ...p, company_name: e.target.value }))} />
              <label className="inline-check"><input type="checkbox" checked={plannerForm.monthly_priority_active} onChange={(e) => setPlannerForm((p) => ({ ...p, monthly_priority_active: e.target.checked }))} /> Prioridad mensual activa</label>
              <button className="primary-button" onClick={() => setWizardStep(2)}>Continuar</button>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="wizard-panel">
              <div className="admin-inline-inputs">
                <input type="number" value={plannerForm.start_point.lat} onChange={(e) => setPlannerForm((p) => ({ ...p, start_point: { ...p.start_point, lat: Number(e.target.value) } }))} />
                <input type="number" value={plannerForm.start_point.lng} onChange={(e) => setPlannerForm((p) => ({ ...p, start_point: { ...p.start_point, lng: Number(e.target.value) } }))} />
                <input type="number" value={plannerForm.end_point.lat} onChange={(e) => setPlannerForm((p) => ({ ...p, end_point: { ...p.end_point, lat: Number(e.target.value) } }))} />
                <input type="number" value={plannerForm.end_point.lng} onChange={(e) => setPlannerForm((p) => ({ ...p, end_point: { ...p.end_point, lng: Number(e.target.value) } }))} />
              </div>
              <button className="primary-button" onClick={() => setWizardStep(3)}>Continuar</button>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="wizard-panel">
              {plannerForm.packages.map((pkg, idx) => (
                <div className="admin-inline-inputs" key={`${pkg.label}-${idx}`}>
                  <input value={pkg.label} onChange={(e) => updateWizardPackage(idx, "label", e.target.value)} />
                  <input type="number" value={pkg.lat} onChange={(e) => updateWizardPackage(idx, "lat", Number(e.target.value))} />
                  <input type="number" value={pkg.lng} onChange={(e) => updateWizardPackage(idx, "lng", Number(e.target.value))} />
                  <select value={pkg.vehicle_type} onChange={(e) => updateWizardPackage(idx, "vehicle_type", e.target.value)}><option value="moto">moto</option><option value="camion_liviano">camion_liviano</option><option value="camion_pesado">camion_pesado</option></select>
                </div>
              ))}
              <button className="small-button" onClick={addWizardPackage}>+ Agregar paquete</button>
              <button className="primary-button" onClick={createSmartPlan}>Generar rutas</button>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="wizard-panel">
              <MapComponent center={[plannerForm.start_point.lat, plannerForm.start_point.lng]} markers={mapData.markers} circles={mapData.circles} polylines={mapData.polylines} height="420px" />
              <div className="deliveries-grid">
                {smartPlans.map((plan) => (
                  <div className="delivery-card" key={plan.id}>
                    <h3>Plan #{plan.id}</h3>
                    <p>{plan.company_name || "Sin empresa"}</p>
                    <button className="small-button primary-button" onClick={() => setSelectedPlan(plan)}>Ver</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
