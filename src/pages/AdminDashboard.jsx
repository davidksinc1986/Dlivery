import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useAppContext } from "../context/AppContext";
import MapComponent from "../components/Map/MapComponent";

const defaultPackagesJson = JSON.stringify([
  { id: "pkg-1", label: "Sabana -> Alajuela #1", lat: 9.9963, lng: -84.2111, vehicle_type: "moto", load_type: "ligero" },
  { id: "pkg-2", label: "Sabana -> Alajuela #2", lat: 10.0103, lng: -84.214, vehicle_type: "moto", load_type: "ligero" },
  { id: "pkg-3", label: "Carga camión", lat: 9.9802, lng: -84.19, vehicle_type: "camion_liviano", load_type: "camion" },
], null, 2);

export default function AdminDashboard() {
  const { user, logout } = useAppContext();
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [commissionPercent, setCommissionPercent] = useState(20);
  const [receiptNotes, setReceiptNotes] = useState({});
  const [smartPlans, setSmartPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [liveDrivers, setLiveDrivers] = useState([]);
  const [systemConfig, setSystemConfig] = useState({
    embeddedSuperAdminEmail: "davidksinc@gmail.com",
    embeddedSuperAdminPassword: "M@davi19!",
    allowEmbeddedAdminWithoutDb: true,
  });
  const [plannerForm, setPlannerForm] = useState({
    company_name: "",
    monthly_priority_active: true,
    max_deviation_km: 3,
    start_point: { lat: 9.9358, lng: -84.0994, address: "Sabana" },
    end_point: { lat: 10.0162, lng: -84.2116, address: "Alajuela" },
    packages_json: defaultPackagesJson,
  });

  const loadAll = async () => {
    const [ov, us, py, pr, sr, cfg] = await Promise.all([
      api.get("/admin/overview"),
      api.get("/admin/users"),
      api.get("/admin/payouts"),
      api.get("/admin/pricing"),
      api.get("/admin/smart-routes"),
      api.get("/admin/system-config"),
    ]);

    setOverview(ov.data);
    setUsers(us.data);
    setPayouts(py.data);
    setPricing(pr.data.pricing);
    setCommissionPercent(pr.data.commissionPercent);
    setSmartPlans(sr.data);
    setSystemConfig(cfg.data);
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

  useEffect(() => {
    const interval = setInterval(() => {
      loadLiveDriverLocations();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const updatePricing = async () => {
    await api.put("/admin/pricing", { commissionPercent, pricing });
    await loadAll();
    alert("Pricing actualizado.");
  };

  const updateSystemConfig = async () => {
    await api.put("/admin/system-config", systemConfig);
    alert("Configuración de sistema guardada.");
    await loadAll();
  };

  const registerManualPayout = async (paymentId) => {
    const note = receiptNotes[paymentId];
    if (!note) return alert("Debes registrar la colilla/referencia.");
    await api.put(`/admin/payouts/${paymentId}/pay`, { payout_receipt_note: note });
    await loadAll();
  };

  const createSmartPlan = async () => {
    try {
      const packages = JSON.parse(plannerForm.packages_json);
      const response = await api.post("/deliveries/smart-plan", {
        company_name: plannerForm.company_name,
        monthly_priority_active: plannerForm.monthly_priority_active,
        max_deviation_km: Number(plannerForm.max_deviation_km),
        start_point: plannerForm.start_point,
        end_point: plannerForm.end_point,
        packages,
      });
      alert("Plan inteligente generado.");
      await loadAll();
      setSelectedPlan({ id: response.data.plan_id, company_name: plannerForm.company_name, payload: response.data.plan });
    } catch (error) {
      alert(error?.response?.data?.error || "No se pudo generar el plan inteligente.");
    }
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
      route.stops.forEach((stop) => {
        markers.push({ position: [stop.lat, stop.lng], popupText: `${stop.stop_order}. ${stop.label} (${stop.deviation_km}km)` });
      });
      route.circles.forEach((circle) => {
        circles.push({
          center: circle.center,
          radius: circle.radius_m,
          popupText: `${circle.package_id} · radio ${circle.radius_m / 1000}km`,
          color: "#457b9d",
          fillOpacity: 0.15,
        });
      });
      polylines.push({ positions: route.polyline, color: "#e76f51", popupText: `${route.route_id} · ${route.total_packages} paquetes` });
    });

    return { markers, circles, polylines };
  }, [selectedPlan]);

  const liveDriverMarkers = useMemo(() => {
    return liveDrivers
      .filter((driver) => Number.isFinite(Number(driver.lat)) && Number.isFinite(Number(driver.lng)))
      .map((driver) => ({
        position: [Number(driver.lat), Number(driver.lng)],
        popupText: `${driver.first_name} ${driver.last_name} · ${driver.is_available ? "Activo" : "Desconectado"} · última señal: ${driver.last_location_at ? String(driver.last_location_at).replace("T", " ").slice(0, 19) : "N/D"}`,
      }));
  }, [liveDrivers]);

  const liveMapCenter = liveDriverMarkers[0]?.position || [9.93, -84.08];

  return (
    <div className="container admin-shell">
      <header className="app-header">
        <h1>Panel Super Admin</h1>
        <div className="user-info">
          <span>{user?.first_name} {user?.last_name}</span>
          <button onClick={logout} className="logout-button">Cerrar sesión</button>
        </div>
      </header>

      <div className="delivery-list-section">
        <h2>Mapa de conductores activos (tiempo real)</h2>
        <MapComponent center={liveMapCenter} markers={liveDriverMarkers} height="380px" />
      </div>

      <div className="create-delivery-section">
        <h2>Configuración del sistema</h2>
        <p className="config-description">Controla el usuario super admin embebido para que el acceso no dependa de la base de datos.</p>
        <div className="admin-config-grid">
          <div className="form-group">
            <label>Email super admin embebido</label>
            <input value={systemConfig.embeddedSuperAdminEmail} onChange={(e) => setSystemConfig((prev) => ({ ...prev, embeddedSuperAdminEmail: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Contraseña super admin embebida</label>
            <input type="password" value={systemConfig.embeddedSuperAdminPassword} onChange={(e) => setSystemConfig((prev) => ({ ...prev, embeddedSuperAdminPassword: e.target.value }))} />
          </div>
        </div>
        <label className="inline-check">
          <input type="checkbox" checked={systemConfig.allowEmbeddedAdminWithoutDb} onChange={(e) => setSystemConfig((prev) => ({ ...prev, allowEmbeddedAdminWithoutDb: e.target.checked }))} />
          Permitir login embebido incluso si la DB falla
        </label>
        <button className="primary-button" onClick={updateSystemConfig}>Guardar configuración de sistema</button>
      </div>

      <div className="create-delivery-section">
        <h2>Planificador inteligente (empresa)</h2>
        <div className="admin-config-grid">
          <div className="form-group"><label>Empresa</label><input value={plannerForm.company_name} onChange={(e) => setPlannerForm((prev) => ({ ...prev, company_name: e.target.value }))} /></div>
          <div className="form-group"><label>Origen (lat/lng)</label><div className="admin-inline-inputs"><input value={plannerForm.start_point.lat} onChange={(e) => setPlannerForm((prev) => ({ ...prev, start_point: { ...prev.start_point, lat: Number(e.target.value) } }))} type="number" /><input value={plannerForm.start_point.lng} onChange={(e) => setPlannerForm((prev) => ({ ...prev, start_point: { ...prev.start_point, lng: Number(e.target.value) } }))} type="number" /></div></div>
          <div className="form-group"><label>Destino (lat/lng)</label><div className="admin-inline-inputs"><input value={plannerForm.end_point.lat} onChange={(e) => setPlannerForm((prev) => ({ ...prev, end_point: { ...prev.end_point, lat: Number(e.target.value) } }))} type="number" /><input value={plannerForm.end_point.lng} onChange={(e) => setPlannerForm((prev) => ({ ...prev, end_point: { ...prev.end_point, lng: Number(e.target.value) } }))} type="number" /></div></div>
          <div className="form-group"><label>Desviación máxima (km)</label><input type="number" value={plannerForm.max_deviation_km} onChange={(e) => setPlannerForm((prev) => ({ ...prev, max_deviation_km: Number(e.target.value) }))} /></div>
        </div>
        <div className="form-group"><label>Paquetes JSON (hasta 200)</label><textarea rows={8} value={plannerForm.packages_json} onChange={(e) => setPlannerForm((prev) => ({ ...prev, packages_json: e.target.value }))} /></div>
        <label className="inline-check"><input type="checkbox" checked={plannerForm.monthly_priority_active} onChange={(e) => setPlannerForm((prev) => ({ ...prev, monthly_priority_active: e.target.checked }))} />Empresa con prioridad mensual activa</label>
        <button className="primary-button" onClick={createSmartPlan}>Generar rutas inteligentes</button>

        {selectedPlan?.payload && (
          <div className="map-block">
            <h3>Mapa de rutas con círculos configurables</h3>
            <MapComponent center={[plannerForm.start_point.lat, plannerForm.start_point.lng]} markers={mapData.markers} circles={mapData.circles} polylines={mapData.polylines} height="420px" />
          </div>
        )}
      </div>

      <div className="delivery-list-section">
        <h2>Planes inteligentes guardados</h2>
        <div className="deliveries-grid">
          {smartPlans.map((plan) => (
            <div key={plan.id} className="delivery-card">
              <h3>Plan #{plan.id} · {plan.company_name || "Sin empresa"}</h3>
              <p>Prioridad mensual: {plan.monthly_priority_active ? "Activa" : "No"}</p>
              <p>Paquetes: {plan.payload?.summary?.planned_packages || 0}</p>
              <p>Rutas: {plan.payload?.summary?.routes_created || 0}</p>
              <button className="primary-button" onClick={() => setSelectedPlan(plan)}>Ver en mapa</button>
            </div>
          ))}
        </div>
      </div>

      <div className="delivery-list-section">
        <h2>KPIs Globales</h2>
        {overview && (
          <div className="deliveries-grid">
            <div className="delivery-card"><h3>Usuarios</h3><p>{overview.users}</p></div>
            <div className="delivery-card"><h3>Conductores</h3><p>{overview.drivers}</p></div>
            <div className="delivery-card"><h3>Entregas</h3><p>{overview.deliveries}</p></div>
            <div className="delivery-card"><h3>Ingresos</h3><p>₡{overview.grossRevenue}</p></div>
            <div className="delivery-card"><h3>Retenido conductores</h3><p>₡{overview.pendingDriverPayouts}</p></div>
          </div>
        )}
      </div>

      <div className="create-delivery-section">
        <h2>Pricing dinámico</h2>
        <div className="form-group"><label>Comisión de la app (%)</label><input type="number" value={commissionPercent} onChange={(e) => setCommissionPercent(Number(e.target.value))} /></div>
        {pricing.map((rule, idx) => (
          <div key={rule.vehicle_type} className="admin-pricing-grid">
            <div className="delivery-card"><strong>{rule.vehicle_type}</strong></div>
            <div className="form-group"><label>Primer Km</label><input type="number" value={rule.first_km_price} onChange={(e) => {
              const clone = [...pricing];
              clone[idx].first_km_price = Number(e.target.value);
              setPricing(clone);
            }} /></div>
            <div className="form-group"><label>Por Km adicional</label><input type="number" value={rule.per_km_price} onChange={(e) => {
              const clone = [...pricing];
              clone[idx].per_km_price = Number(e.target.value);
              setPricing(clone);
            }} /></div>
          </div>
        ))}
        <button className="primary-button" onClick={updatePricing}>Guardar pricing</button>
      </div>

      <div className="assigned-deliveries-section">
        <h2>Pagos semanales (manuales)</h2>
        <div className="deliveries-grid">
          {payouts.map((p) => (
            <div key={p.id} className="delivery-card">
              <h3>Pago #{p.id} · Entrega #{p.delivery_id}</h3>
              <p>Conductor: {p.first_name} {p.last_name}</p>
              <p>Monto conductor: ₡{p.driver_earning}</p>
              <p>Vence: {String(p.payout_due_date).slice(0, 10)}</p>
              <p>Estado: {p.status}</p>
              <input type="text" placeholder="Colilla o referencia" value={receiptNotes[p.id] || p.payout_receipt_note || ""} onChange={(e) => setReceiptNotes((prev) => ({ ...prev, [p.id]: e.target.value }))} />
              {p.status !== "paid_to_driver_manual" && (
                <button className="primary-button" onClick={() => registerManualPayout(p.id)}>Marcar como pagado</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="delivery-list-section">
        <h2>Usuarios recientes</h2>
        <div className="deliveries-grid">
          {users.slice(0, 20).map((u) => (
            <div key={u.id} className="delivery-card">
              <h3>{u.first_name} {u.last_name}</h3>
              <p>{u.email}</p>
              <p>Rol: {u.role}</p>
              <p>⭐ {u.rating || 5} ({u.rating_count || 0})</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
