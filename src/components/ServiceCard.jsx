import { useAppContext } from "../context/AppContext";

export default function ServiceCard({ title, type }) {
  const { serviceType, setServiceType } = useAppContext();

  const isActive = serviceType === type;

  return (
    <div
      className={`card ${isActive ? "active" : ""}`}
      onClick={() => setServiceType(type)}
    >
      <h3>{title}</h3>
    </div>
  );
}