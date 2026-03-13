import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAppContext } from "../context/AppContext";

export default function AdminDashboard() {
  const { user, logout } = useAppContext();
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [commissionPercent, setCommissionPercent] = useState(20);
  const [receiptNotes, setReceiptNotes] = useState({});

  const loadAll = async () => {
    const [ov, us, py, pr] = await Promise.all([
      api.get("/admin/overview"),
      api.get("/admin/users"),
      api.get("/admin/payouts"),
      api.get("/admin/pricing"),
    ]);

    setOverview(ov.data);
    setUsers(us.data);
    setPayouts(py.data);
    setPricing(pr.data.pricing);
    setCommissionPercent(pr.data.commissionPercent);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const updatePricing = async () => {
    await api.put("/admin/pricing", { commissionPercent, pricing });
    await loadAll();
    alert("Pricing actualizado.");
  };

  const registerManualPayout = async (paymentId) => {
    const note = receiptNotes[paymentId];
    if (!note) return alert("Debes registrar la colilla/referencia.");
    await api.put(`/admin/payouts/${paymentId}/pay`, { payout_receipt_note: note });
    await loadAll();
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>Panel Super Admin</h1>
        <div className="user-info">
          <span>{user?.first_name} {user?.last_name}</span>
          <button onClick={logout} className="logout-button">Cerrar sesión</button>
        </div>
      </header>

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
        <div className="form-group">
          <label>Comisión de la app (%)</label>
          <input type="number" value={commissionPercent} onChange={(e) => setCommissionPercent(Number(e.target.value))} />
        </div>
        {pricing.map((rule, idx) => (
          <div key={rule.vehicle_type} className="deliveries-grid" style={{ marginBottom: 8 }}>
            <div className="delivery-card"><strong>{rule.vehicle_type}</strong></div>
            <div className="form-group">
              <label>Primer Km</label>
              <input type="number" value={rule.first_km_price} onChange={(e) => {
                const clone = [...pricing];
                clone[idx].first_km_price = Number(e.target.value);
                setPricing(clone);
              }} />
            </div>
            <div className="form-group">
              <label>Por Km adicional</label>
              <input type="number" value={rule.per_km_price} onChange={(e) => {
                const clone = [...pricing];
                clone[idx].per_km_price = Number(e.target.value);
                setPricing(clone);
              }} />
            </div>
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
              <input
                type="text"
                placeholder="Colilla o referencia"
                value={receiptNotes[p.id] || p.payout_receipt_note || ""}
                onChange={(e) => setReceiptNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
              />
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
