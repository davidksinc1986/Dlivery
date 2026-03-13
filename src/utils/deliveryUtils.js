export const formatVehicleType = (type) => {
  if (!type) return "N/A";
  return type
    .replace("_", " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const parseCoordinateString = (coordinateText) => {
  if (!coordinateText || typeof coordinateText !== "string") return null;

  const matches = coordinateText.match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return null;

  const lat = Number(matches[0]);
  const lng = Number(matches[1]);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return [lat, lng];
};

export const toMapsQuery = (coordinateText) => {
  const coords = parseCoordinateString(coordinateText);
  return coords ? `${coords[0]},${coords[1]}` : encodeURIComponent(coordinateText || "");
};

export const groupDeliveriesByVehicleType = (deliveries) => {
  return deliveries.reduce((grouped, delivery) => {
    const type = delivery.vehicle_requested_type || "unspecified";
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(delivery);
    return grouped;
  }, {});
};
