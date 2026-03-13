const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const haversineDistanceKm = (pointA, pointB) => {
  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);
  const dLat = lat2 - lat1;
  const dLng = toRadians(pointB.lng - pointA.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
};

const toCartesianKm = (point, referenceLat) => {
  const latKm = point.lat * 111.32;
  const lngKm = point.lng * 111.32 * Math.cos(toRadians(referenceLat));
  return { x: lngKm, y: latKm };
};

const pointToSegmentDistanceKm = (point, segmentStart, segmentEnd) => {
  const refLat = (segmentStart.lat + segmentEnd.lat + point.lat) / 3;
  const p = toCartesianKm(point, refLat);
  const a = toCartesianKm(segmentStart, refLat);
  const b = toCartesianKm(segmentEnd, refLat);

  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const apX = p.x - a.x;
  const apY = p.y - a.y;
  const abLenSquared = abX ** 2 + abY ** 2;

  if (!abLenSquared) {
    return { distanceKm: Math.sqrt(apX ** 2 + apY ** 2), projection: 0 };
  }

  const projection = Math.max(0, Math.min(1, (apX * abX + apY * abY) / abLenSquared));
  const closestX = a.x + projection * abX;
  const closestY = a.y + projection * abY;
  const dX = p.x - closestX;
  const dY = p.y - closestY;

  return { distanceKm: Math.sqrt(dX ** 2 + dY ** 2), projection };
};

const normalizePackage = (pkg, index) => ({
  id: pkg.id || `pkg_${index + 1}`,
  label: pkg.label || `Paquete ${index + 1}`,
  address: pkg.address || null,
  lat: Number(pkg.lat),
  lng: Number(pkg.lng),
  vehicle_type: pkg.vehicle_type || "moto",
  load_type: pkg.load_type || "ligero",
});

const buildSmartPlan = ({
  startPoint,
  endPoint,
  packages,
  maxDeviationKm = 3,
}) => {
  const normalizedPackages = (packages || [])
    .map(normalizePackage)
    .filter((pkg) => Number.isFinite(pkg.lat) && Number.isFinite(pkg.lng));

  const byVehicleType = new Map();
  const excluded = [];

  normalizedPackages.forEach((pkg) => {
    const analysis = pointToSegmentDistanceKm(pkg, startPoint, endPoint);

    if (analysis.distanceKm > maxDeviationKm) {
      excluded.push({
        ...pkg,
        reason: `Desviación ${analysis.distanceKm.toFixed(2)}km (> ${maxDeviationKm}km).`,
      });
      return;
    }

    const candidate = {
      ...pkg,
      deviation_km: Number(analysis.distanceKm.toFixed(3)),
      route_progress: Number(analysis.projection.toFixed(4)),
      marker: { center: [pkg.lat, pkg.lng], radius_km: maxDeviationKm },
    };

    if (!byVehicleType.has(pkg.vehicle_type)) byVehicleType.set(pkg.vehicle_type, []);
    byVehicleType.get(pkg.vehicle_type).push(candidate);
  });

  const routes = Array.from(byVehicleType.entries()).map(([vehicleType, items], routeIndex) => {
    const orderedStops = items
      .sort((a, b) => a.route_progress - b.route_progress || a.deviation_km - b.deviation_km)
      .map((pkg, stopIndex) => ({
        ...pkg,
        stop_order: stopIndex + 1,
      }));

    return {
      route_id: `route_${routeIndex + 1}_${vehicleType}`,
      vehicle_type: vehicleType,
      max_deviation_km: maxDeviationKm,
      origin: startPoint,
      destination: endPoint,
      total_packages: orderedStops.length,
      estimated_distance_km: Number(
        (haversineDistanceKm(startPoint, endPoint) + orderedStops.reduce((acc, pkg) => acc + pkg.deviation_km, 0) * 0.35).toFixed(2)
      ),
      circles: orderedStops.map((pkg) => ({
        package_id: pkg.id,
        center: [pkg.lat, pkg.lng],
        radius_m: maxDeviationKm * 1000,
      })),
      polyline: [
        [startPoint.lat, startPoint.lng],
        ...orderedStops.map((pkg) => [pkg.lat, pkg.lng]),
        [endPoint.lat, endPoint.lng],
      ],
      stops: orderedStops,
    };
  });

  return {
    summary: {
      requested_packages: normalizedPackages.length,
      planned_packages: routes.reduce((acc, route) => acc + route.total_packages, 0),
      excluded_packages: excluded.length,
      routes_created: routes.length,
      max_deviation_km: maxDeviationKm,
    },
    routes,
    excluded,
  };
};

module.exports = {
  haversineDistanceKm,
  buildSmartPlan,
};
