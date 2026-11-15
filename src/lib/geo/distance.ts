/** Mean Earth radius in meters (IUGG). Used everywhere a distance is computed. */
export const EARTH_RADIUS_M = 6_371_008.8;

export type LngLat = { lng: number; lat: number };

/** [west, south, east, north] in degrees, the GeoJSON bbox order. */
export type Bbox = [west: number, south: number, east: number, north: number];

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle (haversine) distance in meters between two points. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Diagonal of a bounding box in meters: the haversine distance from its
 * south-west corner to its north-east corner. This is the scoring constant D.
 */
export function bboxDiagonalMeters([west, south, east, north]: Bbox): number {
  return haversineMeters({ lng: west, lat: south }, { lng: east, lat: north });
}

/** Width (along the middle latitude) and height of a bounding box in meters. */
export function bboxSizeMeters([west, south, east, north]: Bbox): { width: number; height: number } {
  const midLat = (south + north) / 2;
  return {
    width: haversineMeters({ lng: west, lat: midLat }, { lng: east, lat: midLat }),
    height: haversineMeters({ lng: west, lat: south }, { lng: west, lat: north }),
  };
}
