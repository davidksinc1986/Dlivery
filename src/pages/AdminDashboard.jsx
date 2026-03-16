import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useAppContext } from "../context/AppContext";
import MapComponent from "../components/Map/MapComponent";

const TAB_USERS = "users";
const TAB_DRIVERS = "drivers";
const TAB_COMPANIES = "companies";
const TAB_WIZARD = "wizard";

const tabMeta = {
  [TAB_USERS]: { label: "Usuarios", hint: "CRUD de clientes" },
  [TAB_DRIVERS]: { label: "Conductores", hint: "Estado y mapa live" },
  [TAB_COMPANIES]: { label: "Empresas", hint: "CRM y acuerdos" },
  [TAB_WIZARD]: { label: "Crear viajes", hint: "Rutas inteligentes" },
};

const emptyPerson = { first_name: "", last_name: "", email: "", password: "" };
const emptyCompany = { name: "", contact_name: "", contact_email: "", phone: "", status: "active", notes: "" };

const defaultPackageSizes = [
  { id: "small", name: "Pequeño", description: "Hasta una caja de zapatos", max_dimensions: "35 x 25 x 15 cm", active: true },
  { id: "medium", name: "Mediano", description: "Hasta tamaño microondas", max_dimensions: "60 x 45 x 45 cm", active: true },
  { id: "large", name: "Grande", description: "Tipo refrigeradora", max_dimensions: "180 x 90 x 80 cm", active: true },
  { id: "xlarge", name: "Extra Big", description: "Aprox. 4 refrigeradoras juntas", max_dimensions: "240 x 200 x 180 cm", active: true },
];

const defaultCommercialRules = [
  { id: "r1", company_name: "", package_size: "small", base_value: 1800, agreement_note: "Tarifa base estándar", active: true },
];

const defaultDriverBatchRules = [
  { id: "d1", min_packages: 2, max_packages: 4, discount_percent: 8, payout_percent: 92, active: true },
  { id: "d2", min_packages: 5, max_packages: 8, discount_percent: 12, payout_percent: 88, active: true },
];

const deliveryDeadlineMin = () => {
  const minDate = new Date(Date.now() + (24 * 60 * 60 * 1000));
  minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset());
  return minDate.toISOString().slice(0, 16);
};

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
  const [packageSizes, setPackageSizes] = useState(defaultPackageSizes);
  const [commercialRules, setCommercialRules] = useState(defaultCommercialRules);
  const [driverBatchRules, setDriverBatchRules] = useState(defaultDriverBatchRules);

  const [plannerForm, setPlannerForm] = useState({
    company_name: "",
    monthly_priority_active: true,
    max_deviation_km: 3,
    start_point: { lat: 9.9358, lng: -84.0994, address: "Centro de consolidación" },
    end_point: { lat: 10.0162, lng: -84.2116, address: "Hub de cierre" },
    packages: [
      {
        label: "Paquete 1",
        lat: 9.9963,
        lng: -84.2111,
        vehicle_type: "moto",
        package_size: "small",
        country: "Costa Rica",
        province: "San José",
        city: "San José",
        location_input: "https://maps.google.com/?q=9.9963,-84.2111",
        deadline: deliveryDeadlineMin(),
      },
    ],
  });

  useEffect(() => {
    const savedSizes = localStorage.getItem("dlivery_package_sizes");
    const savedCommercial = localStorage.getItem("dlivery_commercial_rules");
    const savedDriverRules = localStorage.getItem("dlivery_driver_batch_rules");

    if (savedSizes) setPackageSizes(JSON.parse(savedSizes));
    if (savedCommercial) setCommercialRules(JSON.parse(savedCommercial));
    if (savedDriverRules) setDriverBatchRules(JSON.parse(savedDriverRules));
  }, []);

  useEffect(() => {
    localStorage.setItem("dlivery_package_sizes", JSON.stringify(packageSizes));
  }, [packageSizes]);

  useEffect(() => {
    localStorage.setItem("dlivery_commercial_rules", JSON.stringify(commercialRules));
  }, [commercialRules]);

  useEffect(() => {
    localStorage.setItem("dlivery_driver_batch_rules", JSON.stringify(driverBatchRules));
  }, [driverBatchRules]);

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
      packages: [
        ...prev.packages,
        {
          label: `Paquete ${prev.packages.length + 1}`,
          lat: 9.99,
          lng: -84.2,
          vehicle_type: "moto",
          package_size: "small",
          country: "Costa Rica",
          province: "San José",
          city: "San José",
          location_input: "",
          deadline: deliveryDeadlineMin(),
        },
      ],
    }));
  };

  const removeWizardPackage = (idx) => {
    setPlannerForm((prev) => ({ ...prev, packages: prev.packages.filter((_, index) => index !== idx) }));
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
      package_size_catalog: packageSizes,
      commercial_rules: commercialRules,
      driver_batch_rules: driverBatchRules,
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

  const activeTabDetails = tabMeta[activeTab] || tabMeta[TAB_USERS];

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

  const updateSizeRule = (idx, key, value) => {
    setPackageSizes((prev) => prev.map((rule, index) => (index === idx ? { ...rule, [key]: value } : rule)));
  };

  const updateCommercialRule = (idx, key, value) => {
    setCommercialRules((prev) => prev.map((rule, index) => (index === idx ? { ...rule, [key]: value } : rule)));
  };

  const updateDriverBatchRule = (idx, key, value) => {
    setDriverBatchRules((prev) => prev.map((rule, index) => (index === idx ? { ...rule, [key]: value } : rule)));
  };

  return (
    <div className="container admin-biance uber-ish-shell">
      <header className="app-header admin-header-dark">
        <div>
          <p className="admin-header-kicker">Control center · Dlivery</p>
          <h1>Super Dashboard</h1>
        </div>
        <div className="user-info">
          <span>{user?.first_name} {user?.last_name}</span>
          <button className="logout-button" onClick={logout}>Cerrar sesión</button>
        </div>
      </header>

      <section className="admin-hero">
        <div className="admin-hero-panel">
          <p className="admin-hero-kicker">Centro operativo</p>
          <h2>{activeTabDetails.label}</h2>
          <p>{activeTabDetails.hint}. Administra operaciones, métricas y ejecución de entregas con una interfaz más clara.</p>
          <div className="admin-hero-quick-actions">
            <button className="primary-button" onClick={() => setActiveTab(TAB_WIZARD)}>Crear viaje</button>
            <button className="small-button" onClick={() => setActiveTab(TAB_DRIVERS)}>Ver conductores live</button>
          </div>
        </div>
        <div className="admin-hero-map" aria-hidden="true">
          <div className="admin-hero-map-overlay">Live network</div>
        </div>
      </section>

      <div className="binance-kpis">
        <div className="delivery-card stat-card"><h3>Usuarios</h3><p>{overview?.users || 0}</p></div>
        <div className="delivery-card stat-card"><h3>Conductores</h3><p>{overview?.drivers || 0}</p></div>
        <div className="delivery-card stat-card"><h3>Entregas</h3><p>{overview?.deliveries || 0}</p></div>
        <div className="delivery-card stat-card"><h3>Ingresos</h3><p>₡{overview?.grossRevenue || 0}</p></div>
      </div>

      <div className="admin-tabs">
        {[TAB_USERS, TAB_DRIVERS, TAB_COMPANIES, TAB_WIZARD].map((tab) => (
          <button key={tab} className={`tab-pill ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
            <span>{tabMeta[tab].label}</span>
            <small>{tabMeta[tab].hint}</small>
          </button>
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
        <section className="create-delivery-section wizard-wrap uber-wizard">
          <h2>Planificador Inteligente (Wizard)</h2>
          <div className="wizard-steps">
            {[1, 2, 3, 4].map((step) => <button key={step} className={`tab-pill ${wizardStep === step ? "active" : ""}`} onClick={() => setWizardStep(step)}>Paso {step}</button>)}
          </div>

          {wizardStep === 1 && (
            <div className="wizard-panel">
              <p className="help-chip">ℹ️ Paso 1: configura empresa y acuerdos. Si no entiendes los pasos 2 y 3, revisa las etiquetas "Ayuda" debajo.</p>
              <input placeholder="Empresa" value={plannerForm.company_name} onChange={(e) => setPlannerForm((p) => ({ ...p, company_name: e.target.value }))} />
              <label className="inline-check"><input type="checkbox" checked={plannerForm.monthly_priority_active} onChange={(e) => setPlannerForm((p) => ({ ...p, monthly_priority_active: e.target.checked }))} /> Prioridad mensual activa</label>

              <h3>Catálogo de tamaños (editable por super user)</h3>
              {packageSizes.map((rule, idx) => (
                <div className="admin-inline-inputs compact" key={rule.id}>
                  <input value={rule.name} onChange={(e) => updateSizeRule(idx, "name", e.target.value)} />
                  <input value={rule.description} onChange={(e) => updateSizeRule(idx, "description", e.target.value)} />
                  <input value={rule.max_dimensions} onChange={(e) => updateSizeRule(idx, "max_dimensions", e.target.value)} />
                  <button className="small-button logout-button" onClick={() => setPackageSizes((prev) => prev.filter((_, index) => index !== idx))}>Borrar</button>
                </div>
              ))}
              <button className="small-button" onClick={() => setPackageSizes((prev) => [...prev, { id: `size-${Date.now()}`, name: "Nuevo", description: "", max_dimensions: "", active: true }])}>+ Agregar tamaño</button>

              <h3>Valor por paquete (empresa + acuerdo comercial)</h3>
              {commercialRules.map((rule, idx) => (
                <div className="admin-inline-inputs compact" key={rule.id}>
                  <input placeholder="Compañía" value={rule.company_name} onChange={(e) => updateCommercialRule(idx, "company_name", e.target.value)} />
                  <select value={rule.package_size} onChange={(e) => updateCommercialRule(idx, "package_size", e.target.value)}>{packageSizes.map((size) => <option key={size.id} value={size.id}>{size.name}</option>)}</select>
                  <input type="number" placeholder="Valor base" value={rule.base_value} onChange={(e) => updateCommercialRule(idx, "base_value", Number(e.target.value))} />
                  <input placeholder="Nota comercial" value={rule.agreement_note} onChange={(e) => updateCommercialRule(idx, "agreement_note", e.target.value)} />
                  <button className="small-button logout-button" onClick={() => setCommercialRules((prev) => prev.filter((_, index) => index !== idx))}>Borrar</button>
                </div>
              ))}
              <button className="small-button" onClick={() => setCommercialRules((prev) => [...prev, { id: `comm-${Date.now()}`, company_name: "", package_size: packageSizes[0]?.id || "small", base_value: 0, agreement_note: "", active: true }])}>+ Agregar regla comercial</button>
              <button className="primary-button" onClick={() => setWizardStep(2)}>Continuar</button>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="wizard-panel">
              <p className="help-chip">🧭 Ayuda Paso 2: define origen y destino del lote. Puedes pegar coordenadas o direcciones tipo Google Maps.</p>
              <div className="admin-inline-inputs">
                <input type="number" placeholder="Lat origen" value={plannerForm.start_point.lat} onChange={(e) => setPlannerForm((p) => ({ ...p, start_point: { ...p.start_point, lat: Number(e.target.value) } }))} />
                <input type="number" placeholder="Lng origen" value={plannerForm.start_point.lng} onChange={(e) => setPlannerForm((p) => ({ ...p, start_point: { ...p.start_point, lng: Number(e.target.value) } }))} />
                <input placeholder="Dirección origen" value={plannerForm.start_point.address} onChange={(e) => setPlannerForm((p) => ({ ...p, start_point: { ...p.start_point, address: e.target.value } }))} />
                <input type="number" placeholder="Lat destino" value={plannerForm.end_point.lat} onChange={(e) => setPlannerForm((p) => ({ ...p, end_point: { ...p.end_point, lat: Number(e.target.value) } }))} />
                <input type="number" placeholder="Lng destino" value={plannerForm.end_point.lng} onChange={(e) => setPlannerForm((p) => ({ ...p, end_point: { ...p.end_point, lng: Number(e.target.value) } }))} />
                <input placeholder="Dirección destino" value={plannerForm.end_point.address} onChange={(e) => setPlannerForm((p) => ({ ...p, end_point: { ...p.end_point, address: e.target.value } }))} />
                <input type="number" placeholder="Máx desvío (km)" value={plannerForm.max_deviation_km} onChange={(e) => setPlannerForm((p) => ({ ...p, max_deviation_km: Number(e.target.value) }))} />
              </div>
              <button className="primary-button" onClick={() => setWizardStep(3)}>Continuar</button>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="wizard-panel">
              <p className="help-chip">📦 Ayuda Paso 3: agrega varios paquetes con país/provincia/ciudad, ubicación exacta y fecha límite (no same-day).</p>
              {plannerForm.packages.map((pkg, idx) => (
                <div className="admin-inline-inputs compact package-editor" key={`${pkg.label}-${idx}`}>
                  <input placeholder="Etiqueta" value={pkg.label} onChange={(e) => updateWizardPackage(idx, "label", e.target.value)} />
                  <select value={pkg.package_size} onChange={(e) => updateWizardPackage(idx, "package_size", e.target.value)}>{packageSizes.map((size) => <option key={size.id} value={size.id}>{size.name}</option>)}</select>
                  <input placeholder="País" value={pkg.country} onChange={(e) => updateWizardPackage(idx, "country", e.target.value)} />
                  <input placeholder="Provincia" value={pkg.province} onChange={(e) => updateWizardPackage(idx, "province", e.target.value)} />
                  <input placeholder="Ciudad" value={pkg.city} onChange={(e) => updateWizardPackage(idx, "city", e.target.value)} />
                  <input placeholder="Maps URL o coordenadas" value={pkg.location_input} onChange={(e) => updateWizardPackage(idx, "location_input", e.target.value)} />
                  <input type="number" placeholder="Lat" value={pkg.lat} onChange={(e) => updateWizardPackage(idx, "lat", Number(e.target.value))} />
                  <input type="number" placeholder="Lng" value={pkg.lng} onChange={(e) => updateWizardPackage(idx, "lng", Number(e.target.value))} />
                  <select value={pkg.vehicle_type} onChange={(e) => updateWizardPackage(idx, "vehicle_type", e.target.value)}><option value="moto">moto</option><option value="camion_liviano">camion_liviano</option><option value="camion_pesado">camion_pesado</option></select>
                  <input type="datetime-local" min={deliveryDeadlineMin()} value={pkg.deadline} onChange={(e) => updateWizardPackage(idx, "deadline", e.target.value)} />
                  <button className="small-button logout-button" onClick={() => removeWizardPackage(idx)} disabled={plannerForm.packages.length === 1}>Borrar</button>
                </div>
              ))}
              <button className="small-button" onClick={addWizardPackage}>+ Agregar paquete</button>

              <h3>Reglas de pago para conductor en rutas en serie</h3>
              {driverBatchRules.map((rule, idx) => (
                <div className="admin-inline-inputs compact" key={rule.id}>
                  <input type="number" placeholder="Mín paquetes" value={rule.min_packages} onChange={(e) => updateDriverBatchRule(idx, "min_packages", Number(e.target.value))} />
                  <input type="number" placeholder="Máx paquetes" value={rule.max_packages} onChange={(e) => updateDriverBatchRule(idx, "max_packages", Number(e.target.value))} />
                  <input type="number" placeholder="Descuento %" value={rule.discount_percent} onChange={(e) => updateDriverBatchRule(idx, "discount_percent", Number(e.target.value))} />
                  <input type="number" placeholder="Pago conductor %" value={rule.payout_percent} onChange={(e) => updateDriverBatchRule(idx, "payout_percent", Number(e.target.value))} />
                  <button className="small-button logout-button" onClick={() => setDriverBatchRules((prev) => prev.filter((_, index) => index !== idx))}>Borrar</button>
                </div>
              ))}
              <button className="small-button" onClick={() => setDriverBatchRules((prev) => [...prev, { id: `drv-${Date.now()}`, min_packages: 2, max_packages: 3, discount_percent: 5, payout_percent: 95, active: true }])}>+ Agregar regla de pago</button>

              <button className="primary-button" onClick={createSmartPlan}>Generar rutas</button>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="wizard-panel">
              <MapComponent center={[plannerForm.start_point.lat, plannerForm.start_point.lng]} markers={mapData.markers} circles={mapData.circles} polylines={mapData.polylines} height="420px" />
              <div className="delivery-card">
                <h3>Resumen de estrategia</h3>
                <p>Se priorizan rutas por menor desvío, fecha límite y compatibilidad de vehículo/tamaño.</p>
                <p>Total paquetes analizados: {plannerForm.packages.length}</p>
              </div>
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
