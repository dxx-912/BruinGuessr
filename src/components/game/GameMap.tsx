"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, LngLatBoundsLike, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { LatLng, RoundResult } from "@/lib/game/types";
import { seatColor } from "@/lib/versus/types";
import { CAMPUS_BBOX, CAMPUS_GEOJSON, paddedBbox } from "@/lib/map/campus";
import { loadMapLibre, MAP_STYLE_URL } from "@/lib/map/maplibre";

/** A player in a versus game, as the map needs them: a seat (for the colour) and a letter. */
export type MapPlayer = { seat: number; label: string; isYou: boolean };

export type MapView =
  /** Guessing: a click drops the pin, and the pin can be dragged. */
  | { kind: "guess"; pin: LatLng | null; canPlace: boolean; player?: MapPlayer | null }
  /** One round's reveal: the guess, the answer, and a line between them. With `players`, every player's pin. */
  | { kind: "reveal"; result: RoundResult; players?: MapPlayer[] | null }
  /** Every round at once. `focus` zooms to one of them and, with `players`, adds everyone's pin for that round. */
  | { kind: "summary"; results: RoundResult[]; focus: number | null; players?: MapPlayer[] | null };

type Props = {
  view: MapView;
  onPin: (pin: LatLng) => void;
  /** Space the camera should keep clear, in pixels, where panels cover the map. */
  inset?: { top?: number; bottom?: number; left?: number; right?: number };
};

const BLUE = "#2774AE";
const GOLD = "#FFD100";
const NIGHT = "#06182B";
const EMPTY = { type: "FeatureCollection" as const, features: [] };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The player's pin: a blue teardrop. With a number, the small version used on the summary map. */
function guessPinElement(label?: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-pin";
  el.innerHTML = label
    ? `<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="${BLUE}" stroke="#fff" stroke-width="3"/><text x="13" y="17.5" text-anchor="middle" font-family="var(--font-display)" font-style="italic" font-weight="800" font-size="13" fill="#fff">${label}</text></svg>`
    : `<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 2C8.7 2 2 8.6 2 16.8 2 27.600 17 42 17 42s15-14.400 15-25.200C32 8.600 25.300 2 17 2z" fill="${BLUE}" stroke="#fff" stroke-width="3"/><circle cx="17" cy="17" r="5.500" fill="#fff"/></svg>`;
  return el;
}

/** A versus player's pin: a teardrop in their seat colour with their initial. Your own is a little larger. */
function playerPinElement(player: MapPlayer): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-pin";
  if (player.isYou) el.style.zIndex = "2";
  const [w, h] = player.isYou ? [38, 49] : [30, 39];
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 34 44"><path d="M17 2C8.7 2 2 8.6 2 16.8 2 27.600 17 42 17 42s15-14.400 15-25.200C32 8.600 25.300 2 17 2z" fill="${seatColor(player.seat)}" stroke="#fff" stroke-width="3"/><text x="17" y="22.500" text-anchor="middle" font-family="var(--font-display)" font-style="italic" font-weight="800" font-size="16" fill="#fff"></text></svg>`;
  el.innerHTML = svg;
  // The letter comes from a username, so it goes in as text, never as markup.
  el.querySelector("text")!.textContent = player.label;
  return el;
}

/** The true location: a gold flag. With a number, the small version used on the summary map. */
function answerPinElement(label?: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-pin";
  el.innerHTML = label
    ? `<svg width="26" height="26" viewBox="0 0 26 26"><rect x="2" y="2" width="22" height="22" rx="6" fill="${GOLD}" stroke="${NIGHT}" stroke-width="3"/><text x="13" y="17.500" text-anchor="middle" font-family="var(--font-display)" font-style="italic" font-weight="800" font-size="13" fill="${NIGHT}">${label}</text></svg>`
    : `<svg width="40" height="46" viewBox="0 0 40 46"><path d="M8 5h25l-6 8.500 6 8.500H8z" fill="${GOLD}" stroke="${NIGHT}" stroke-width="3" stroke-linejoin="round"/><rect x="5" y="2" width="5" height="40" rx="2.500" fill="${NIGHT}"/><ellipse cx="7.500" cy="42" rx="6" ry="2.500" fill="${NIGHT}" opacity=".35"/></svg>`;
  return el;
}

const toLngLat = (p: LatLng): [number, number] => [p.lng, p.lat];

function lineFeature(from: LatLng, to: LatLng, share = 1, color: string = NIGHT) {
  const end: [number, number] = [from.lng + (to.lng - from.lng) * share, from.lat + (to.lat - from.lat) * share];
  return { type: "Feature" as const, properties: { color }, geometry: { type: "LineString" as const, coordinates: [toLngLat(from), end] } };
}

const lineCollection = (features: ReturnType<typeof lineFeature>[]) => ({ type: "FeatureCollection" as const, features });

function boundsOf(points: LatLng[]): LngLatBoundsLike {
  return [
    [Math.min(...points.map((p) => p.lng)), Math.min(...points.map((p) => p.lat))],
    [Math.max(...points.map((p) => p.lng)), Math.max(...points.map((p) => p.lat))],
  ];
}

/** The pins to show for one scored round: every player's in a versus game, otherwise the player's own. */
function pinsOf(result: RoundResult, players: MapPlayer[] | null | undefined): { at: LatLng; player: MapPlayer | null }[] {
  if (players && result.players) {
    return result.players
      .flatMap((p) => {
        const player = players.find((m) => m.seat === p.seat);
        return p.guess && player ? [{ at: p.guess, player }] : [];
      })
      // Your own pin goes on last, so it sits on top.
      .sort((a, b) => Number(a.player.isYou) - Number(b.player.isYou));
  }
  return result.guess ? [{ at: result.guess, player: null }] : [];
}

/** Fits the whole campus in view. Skipped while the map's box is too small to hold it. */
function frameCampus(map: MapLibreMap) {
  const box = map.getContainer();
  if (box.clientWidth < 120 || box.clientHeight < 120) return;
  map.fitBounds(CAMPUS_BBOX, { padding: 16, duration: 0 });
}

/**
 * The campus map. One instance lives for the whole game and is told what to
 * show through `view`; it is never torn down between rounds, because starting a
 * map is slow.
 */
export default function GameMap({ view, onPin, inset }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerClass = useRef<typeof Marker | null>(null);
  const guessMarker = useRef<Marker | null>(null);
  const extraMarkers = useRef<Marker[]>([]);
  const animation = useRef(0);
  /** True while the camera is where we put it. False once the player pans or zooms. */
  const framed = useRef(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Map event handlers are registered once, so they read the latest props through a ref.
  // The same goes for `inset`: a panel changing height should not replay the reveal.
  const live = useRef({ view, onPin, inset });
  useEffect(() => {
    live.current = { view, onPin, inset };
  }, [view, onPin, inset]);
  /** Camera padding: the space the panels cover, plus a margin so pins are not drawn against an edge. */
  const padding = (edge: number, side: number) => {
    const pad = live.current.inset ?? {};
    const box = container.current;
    const width = box?.clientWidth ?? 0;
    const height = box?.clientHeight ?? 0;
    // A phone has no room for desktop margins.
    if (width && width < 520) [edge, side] = [Math.min(edge, 28), Math.min(side, 44)];
    let top = (pad.top ?? 0) + edge;
    let bottom = (pad.bottom ?? 0) + edge;
    // The map cannot zoom out past the campus, so two far-apart pins need a strip of a certain
    // height or it gives up framing them. On a small phone that means letting the padding give:
    // a pin partly under a panel beats a camera that never moved.
    const spare = height - 140;
    if (height && top + bottom > spare) {
      const squeeze = Math.max(0, spare) / (top + bottom);
      top *= squeeze;
      bottom *= squeeze;
    }
    return { top, bottom, left: (pad.left ?? 0) + side, right: (pad.right ?? 0) + side };
  };
  /** The inset the camera was last framed with, so a change to it re-frames once and only once. */
  const framedInset = useRef("");
  const insetKey = `${inset?.top ?? 0}/${inset?.bottom ?? 0}/${inset?.left ?? 0}/${inset?.right ?? 0}`;

  // ---- Start the map once -------------------------------------------------------------
  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;
    let map: MapLibreMap | undefined;
    let observer: ResizeObserver | undefined;
    // The map's style and tiles come from another server. If they have not arrived after a
    // while, say so and offer a reload instead of "Loading the map…" for ever.
    const slow = window.setTimeout(() => !cancelled && setFailed(true), 20_000);

    loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        markerClass.current = maplibre.Marker;
        map = new maplibre.Map({
          container: container.current,
          style: MAP_STYLE_URL,
          bounds: CAMPUS_BBOX,
          fitBoundsOptions: { padding: 16 },
          // The map is framed to campus. There is room to pan a little, not to wander off.
          maxBounds: paddedBbox(1500),
          maxZoom: 19.5,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          attributionControl: { compact: true },
        });
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");
        mapRef.current = map;
        // Lets the browser test in development turn a place into a point on screen.
        if (process.env.NODE_ENV === "development") (window as unknown as { __bruinguessrMap?: MapLibreMap }).__bruinguessrMap = map;

        map.on("load", () => {
          if (cancelled || !map) return;
          map.addSource("campus", { type: "geojson", data: CAMPUS_GEOJSON });
          map.addSource("lines", { type: "geojson", data: EMPTY });
          map.addLayer({ id: "campus-line", type: "line", source: "campus", paint: { "line-color": BLUE, "line-width": 2.5, "line-opacity": 0.55 } });
          map.addLayer({
            id: "lines-casing",
            type: "line",
            source: "lines",
            layout: { "line-cap": "round" },
            paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
          });
          map.addLayer({
            id: "lines",
            type: "line",
            source: "lines",
            // Versus lines carry their player's colour.
            paint: { "line-color": ["coalesce", ["get", "color"], NIGHT], "line-width": 3, "line-dasharray": [1.6, 1.4] },
          });
          window.clearTimeout(slow);
          setFailed(false);
          setReady(true);
        });

        // The map style names a few icons its sprite sheet does not have. Give it a
        // blank for each so the console is not filled with warnings about them.
        map.on("styleimagemissing", (ev) => {
          if (map && !map.hasImage(ev.id)) map.addImage(ev.id, { width: 1, height: 1, data: new Uint8Array(4) });
        });

        map.on("movestart", (ev) => {
          if ((ev as { originalEvent?: unknown }).originalEvent) framed.current = false;
        });

        map.on("click", (ev) => {
          const { view: current, onPin: place } = live.current;
          if (current.kind === "guess" && current.canPlace) place({ lat: ev.lngLat.lat, lng: ev.lngLat.lng });
        });

        // The map changes size when the dock grows on hover and when the reveal takes over the screen.
        // While guessing, the campus stays framed as the box changes, until the player moves the map.
        observer = new ResizeObserver(() => {
          if (!map) return;
          map.resize();
          if (live.current.view.kind === "guess" && framed.current) frameCampus(map);
        });
        observer.observe(container.current);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      window.clearTimeout(slow);
      observer?.disconnect();
      cancelAnimationFrame(animation.current);
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  // ---- Show what `view` asks for ------------------------------------------------------
  const kind = view.kind;
  const pin = view.kind === "guess" ? view.pin : null;
  const canPlace = view.kind === "guess" && view.canPlace;
  const result = view.kind === "reveal" ? view.result : null;
  const results = view.kind === "summary" ? view.results : null;
  const focus = view.kind === "summary" ? view.focus : null;
  const players = view.kind === "reveal" || view.kind === "summary" ? (view.players ?? null) : null;
  /** Versus: the player's own colour and letter, for the pin they are placing. */
  const me = view.kind === "guess" ? (view.player ?? null) : null;

  // A new view starts from a clean map.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    return () => {
      cancelAnimationFrame(animation.current);
      for (const marker of extraMarkers.current) marker.remove();
      extraMarkers.current = [];
      guessMarker.current?.remove();
      guessMarker.current = null;
      (map.getSource("lines") as GeoJSONSource | undefined)?.setData(EMPTY);
    };
  }, [ready, kind, result, results, players]);

  // Guessing: frame the campus when the round starts, then keep the pin where the player put it.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || kind !== "guess") return;
    map.resize();
    framed.current = true;
    frameCampus(map);
  }, [ready, kind]);

  useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerClass.current;
    if (!ready || !map || !MarkerClass || kind !== "guess") return;
    if (!pin) {
      guessMarker.current?.remove();
      guessMarker.current = null;
      return;
    }
    if (!guessMarker.current) {
      const marker = new MarkerClass({ element: me ? playerPinElement(me) : guessPinElement(), anchor: "bottom", draggable: canPlace });
      marker.on("dragend", () => {
        const at = marker.getLngLat();
        const { view: current, onPin: place } = live.current;
        if (current.kind === "guess" && current.canPlace) place({ lat: at.lat, lng: at.lng });
      });
      guessMarker.current = marker.setLngLat(toLngLat(pin)).addTo(map);
    } else {
      guessMarker.current.setLngLat(toLngLat(pin));
    }
    guessMarker.current.setDraggable(canPlace);
    guessMarker.current.getElement().dataset.draggable = String(canPlace);
  }, [ready, kind, pin, canPlace, me]);

  // Reveal: the pins, a line drawn out from each to the answer, then the flag.
  useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerClass.current;
    if (!ready || !map || !MarkerClass || !result) return;
    map.resize();
    const pad = padding(60, 60);
    framedInset.current = insetKey;
    const quick = reducedMotion();
    const source = map.getSource("lines") as GeoJSONSource;
    const flag = () => {
      extraMarkers.current.push(new MarkerClass({ element: answerPinElement(), anchor: "bottom-left", offset: [-7, 4] }).setLngLat(toLngLat(result.answer)).addTo(map));
    };

    const pins = pinsOf(result, players);
    if (!pins.length) {
      flag();
      map.flyTo({ center: toLngLat(result.answer), zoom: 16.5, padding: pad, duration: quick ? 0 : 900 });
      return;
    }

    for (const pin of pins) {
      const element = pin.player ? playerPinElement(pin.player) : guessPinElement();
      extraMarkers.current.push(new MarkerClass({ element, anchor: "bottom" }).setLngLat(toLngLat(pin.at)).addTo(map));
    }
    map.fitBounds(boundsOf([result.answer, ...pins.map((pin) => pin.at)]), { padding: pad, maxZoom: 18, duration: quick ? 0 : 800 });

    const lines = (share: number) =>
      lineCollection(pins.map((pin) => lineFeature(pin.at, result.answer, share, pin.player ? seatColor(pin.player.seat) : NIGHT)));
    if (quick) {
      source.setData(lines(1));
      flag();
      return;
    }
    const startedAt = performance.now() + 350;
    const step = (now: number) => {
      const share = Math.min(1, Math.max(0, (now - startedAt) / 650));
      source.setData(lines(1 - (1 - share) ** 3));
      if (share < 1) animation.current = requestAnimationFrame(step);
      else flag();
    };
    animation.current = requestAnimationFrame(step);
    // insetKey is read once here; the effect below follows it without replaying the reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, result, players]);

  // The panel over the reveal was measured, or the phone was turned: move the camera so the
  // pins stay clear of it. Only the camera moves; the pins and lines are left as they are.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !result || framedInset.current === insetKey) return;
    framedInset.current = insetKey;
    const pad = padding(60, 60);
    const duration = reducedMotion() ? 0 : 300;
    const pins = pinsOf(result, players);
    if (pins.length) map.fitBounds(boundsOf([result.answer, ...pins.map((pin) => pin.at)]), { padding: pad, maxZoom: 18, duration });
    else map.easeTo({ center: toLngLat(result.answer), padding: pad, duration });
  }, [ready, result, players, insetKey]);

  // Summary: every round's pair, numbered.
  useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerClass.current;
    if (!ready || !map || !MarkerClass || !results) return;
    map.resize();
    for (const r of results) {
      extraMarkers.current.push(new MarkerClass({ element: answerPinElement(r.round), anchor: "center" }).setLngLat(toLngLat(r.answer)).addTo(map));
      if (r.guess) extraMarkers.current.push(new MarkerClass({ element: guessPinElement(r.round), anchor: "center" }).setLngLat(toLngLat(r.guess)).addTo(map));
    }
    (map.getSource("lines") as GeoJSONSource).setData(lineCollection(results.flatMap((r) => (r.guess ? [lineFeature(r.guess, r.answer)] : []))));
  }, [ready, results]);

  // Summary of a versus game: looking at one round adds the other players' pins for it.
  useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerClass.current;
    const round = focus === null ? null : results?.find((r) => r.round === focus);
    if (!ready || !map || !MarkerClass || !results || !round || !players) return;
    const others = pinsOf(round, players).filter((pin) => pin.player && !pin.player.isYou);
    if (!others.length) return;
    const source = map.getSource("lines") as GeoJSONSource;
    const own = results.flatMap((r) => (r.guess ? [lineFeature(r.guess, r.answer)] : []));
    const markers = others.map((pin) => new MarkerClass({ element: playerPinElement(pin.player!), anchor: "bottom" }).setLngLat(toLngLat(pin.at)).addTo(map));
    source.setData(lineCollection([...own, ...others.map((pin) => lineFeature(pin.at, round.answer, 1, seatColor(pin.player!.seat)))]));
    return () => {
      for (const marker of markers) marker.remove();
      (map.getSource("lines") as GeoJSONSource | undefined)?.setData(lineCollection(own));
    };
  }, [ready, results, focus, players]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !results) return;
    const shown = focus === null ? results : results.filter((r) => r.round === focus);
    const points = shown.flatMap((r) => [
      r.answer,
      ...(r.guess ? [r.guess] : []),
      // A round in focus also frames everyone else's pin.
      ...(focus === null ? [] : pinsOf(r, players).map((pin) => pin.at)),
    ]);
    if (!points.length) return;
    map.fitBounds(boundsOf(points), { padding: padding(50, 50), maxZoom: 17.5, duration: reducedMotion() ? 0 : 600 });
  }, [ready, results, focus, players, insetKey]);

  return (
    <div className="game-map relative h-full w-full bg-[#dfe7ee]" data-placing={canPlace} data-kind={kind}>
      {/* MapLibre sets position: relative on its container, so the wrapper carries the size. */}
      <div ref={container} className="h-full w-full" />
      {!ready && !failed && (
        <p className="absolute inset-0 grid place-items-center text-sm font-semibold text-[#3b566f]">Loading the map…</p>
      )}
      {failed && !ready && (
        <div className="absolute inset-0 grid place-content-center justify-items-center gap-3 p-4 text-center">
          <p className="text-sm font-semibold text-[#8a1c13]">The map could not load. Check your connection.</p>
          <button type="button" className="btn btn-blue !text-lg" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
    </div>
  );
}
