/**
 * One place that loads MapLibre GL JS for the browser.
 *
 * MapLibre touches `window`, so it is imported lazily from client components:
 *
 *   const maplibre = await loadMapLibre();
 *   const map = new maplibre.Map({ container, style: MAP_STYLE_URL });
 */

/** OpenFreeMap's hosted "Liberty" style. Free, no API key. */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

type MapLibre = typeof import("maplibre-gl");

let loading: Promise<MapLibre> | undefined;

export function loadMapLibre(): Promise<MapLibre> {
  loading ??= import("maplibre-gl").then((maplibre) => {
    // The worker file is copied into /public by scripts/copy-maplibre-worker.mjs.
    // The version in the URL keeps browsers from reusing a worker from an older release.
    maplibre.setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${maplibre.getVersion()}`);
    return maplibre;
  });
  return loading;
}
