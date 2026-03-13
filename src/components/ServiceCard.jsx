import { useAppContext } from "../context/AppContext";
import { VEHICLE_CATALOG } from "../services/vehicleCatalog";

export default function ServiceCard({ type }) {
  const { serviceType, setServiceType } = useAppContext();
  const isActive = serviceType === type;
  const vehicle = VEHICLE_CATALOG[type];

  return (
    <button
      type="button"
      className={`card ${isActive ? "active" : ""}`}
      onClick={() => setServiceType(type)}
    >
      <p className="service-icon" aria-hidden="true">
        {vehicle?.icon}
      </p>
      <h3>{vehicle?.title || type}</h3>
      <p>{vehicle?.description}</p>
      <small>{vehicle?.eta} · {vehicle?.maxLoad}</small>
    </button>
  );
}
