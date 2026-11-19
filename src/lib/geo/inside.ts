/**
 * Point in polygon by ray casting, for GeoJSON-style polygons: each polygon a
 * list of rings ([lng, lat] pairs), the first ring the outline and the rest
 * holes. Plain arithmetic, so the browser and the server give the same answer
 * from the same data.
 */
type Ring = readonly (readonly [number, number] | readonly number[])[];

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when [lng, lat] is inside any of the polygons (and not in one of its holes). */
export function insidePolygons(lng: number, lat: number, polygons: readonly (readonly Ring[])[]): boolean {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  return polygons.some(([outline, ...holes]) => outline !== undefined && inRing(lng, lat, outline) && !holes.some((h) => inRing(lng, lat, h)));
}
