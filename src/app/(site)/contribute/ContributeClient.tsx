"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CameraIcon, CheckIcon, CompassIcon, PinIcon } from "@/components/art/icons";
import { cameraHeading, compassPoint } from "@/lib/contribute/compass";
import { findFaces, loadFaceDetector } from "@/lib/contribute/detector";
import { suggestedBoxes, type Box } from "@/lib/contribute/faces";
import {
  CONTRIBUTION_LICENSE,
  CONTRIBUTION_LICENSE_URL,
  MAX_ACCURACY_M,
  MAX_UPLOAD_BYTES,
  PIN_CHECK_ACCURACY_M,
  UPLOAD_JPEG_QUALITY,
  fixState,
  scaledSize,
  type FixState,
} from "@/lib/contribute/rules";
import type { MyContribution, Quota } from "@/lib/contribute/types";
import { formatDay } from "@/lib/profile";

type Fix = { lat: number; lng: number; accuracy: number; at: number };

type Shot = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  captureWidth: number;
  captureHeight: number;
  /** Where the detector found faces (fractions of the photo): suggestions for the reviewer, not blurred here. */
  boxes: Box[];
  fix: Fix;
  capturedAt: number;
  heading: number | null;
};

type Problem =
  | "insecure"
  | "location_denied"
  | "location_unavailable"
  | "camera_denied"
  | "no_camera"
  | "front_camera"
  | "detector";

type Stage =
  | { kind: "intro" }
  | { kind: "starting" }
  | { kind: "camera" }
  | { kind: "processing"; progress: number }
  | { kind: "preview"; shot: Shot }
  | { kind: "sending"; shot: Shot }
  | { kind: "sent" }
  | { kind: "error"; problem: Problem };

const PROBLEMS: Record<Problem, { title: string; text: string }> = {
  insecure: { title: "Camera not available", text: "This browser won't open the camera on this page. Open bruinguessr.com/contribute in Safari or Chrome." },
  location_denied: {
    title: "Location is off",
    text: "Each photo needs the spot it was taken. Allow location for this site in your browser's settings, then try again.",
  },
  location_unavailable: { title: "No location yet", text: "Your phone couldn't find where you are. Step outside, away from tall buildings, and try again." },
  camera_denied: { title: "Camera is off", text: "Allow camera access for this site in your browser's settings, then try again." },
  no_camera: { title: "No camera found", text: "Open this page on a phone with a rear camera." },
  front_camera: { title: "Only a front camera", text: "This device's camera faces you. Open this page on a phone with a rear camera." },
  detector: {
    title: "Face check didn't load",
    text: "We look for faces so the reviewer can blur them, and that check couldn't load. Check your connection and try again.",
  },
};

const SUBMIT_PROBLEMS: Record<string, string> = {
  too_inaccurate: `Your location wasn't accurate enough (it has to be within ${MAX_ACCURACY_M} m). Step into the open and try again.`,
  outside_campus: "That spot is outside the campus boundary. Photos have to be taken on campus.",
  stale_position: "Your location was too old when you took the photo. Wait for a fresh fix and try again.",
  clock: "Your phone's clock looks wrong. Check the date and time in its settings.",
  file_type: "This photo couldn't be read. Take it again.",
  file_size: "This photo is too large to send. Take it again.",
  dimensions: "This photo's size doesn't work for the game. Take it again.",
  blurry: "The photo came out blurry. Hold still and try again.",
  daily_limit: "You've sent as many photos as you can in 24 hours. Come back tomorrow.",
  waiting_limit: "You have as many photos waiting as you can. Once some are reviewed you can send more.",
  license: "Tick the license box to send the photo.",
  people_answer: "Answer whether there are people in the photo.",
  server_error: "Something went wrong on our side. Try again in a moment.",
};

// ---------------------------------------------------------------------------
// Device: a phone or tablet (touch) can shoot; a computer is sent to a phone.
// ---------------------------------------------------------------------------
const subscribeNothing = () => () => {};
function useDevice(): "unknown" | "touch" | "desktop" {
  return useSyncExternalStore(
    subscribeNothing,
    () => (window.matchMedia("(pointer: coarse)").matches ? "touch" : "desktop"),
    () => "unknown",
  );
}

/** Answers from the server for the "Your photos" list. */
function useMine() {
  const [data, setData] = useState<{ items: MyContribution[]; quota: Quota } | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/contributions", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as { items: MyContribution[]; quota: Quota });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    // Runs once on arrival; the list then refreshes after each photo is sent.
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return { data, failed, reload: load };
}

export default function ContributeClient({ username }: { username: string }) {
  const router = useRouter();
  const device = useDevice();
  const [stage, setStage] = useState<Stage>({ kind: "intro" });
  const [fix, setFix] = useState<Fix | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [heading, setHeading] = useState<{ value: number; at: number } | null>(null);
  const [compass, setCompass] = useState<"off" | "ask" | "on" | "none">("off");
  const [people, setPeople] = useState<boolean | null>(null);
  const [licensed, setLicensed] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const mine = useMine();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const watchRef = useRef<number | null>(null);
  const fixRef = useRef<Fix | null>(null);
  const headingRef = useRef<{ value: number; at: number } | null>(null);

  // ---- Clean up: camera, location and compass stop when the page goes. ----
  const stopAll = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
  }, []);
  useEffect(() => stopAll, [stopAll]);

  // ---- The clock that ages the position fix, once a second while shooting. ----
  const live = stage.kind === "camera" || stage.kind === "starting";
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  const onPosition = useCallback((p: GeolocationPosition) => {
    const next: Fix = {
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracy: p.coords.accuracy,
      // A browser may hand back a cached reading; its own timestamp says how old it is.
      at: Math.min(p.timestamp || Date.now(), Date.now()),
    };
    if (fixRef.current && fixRef.current.at > next.at) return;
    fixRef.current = next;
    setFix(next);
  }, []);

  // A phone standing still may stop sending positions; ask for a fresh one when the last is getting old.
  useEffect(() => {
    if (!live || !navigator.geolocation) return;
    const last = fixRef.current;
    if (last && now - last.at < 4000) return;
    navigator.geolocation.getCurrentPosition(
      (p) => onPosition(p),
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
    );
  }, [live, now, onPosition]);


  // ---- Compass ----
  const listenCompass = useCallback(() => {
    let heard = false;
    const save = (value: number | null) => {
      if (value === null || !Number.isFinite(value)) return;
      heard = true;
      const h = { value: ((value % 360) + 360) % 360, at: Date.now() };
      headingRef.current = h;
      setHeading(h);
      setCompass("on");
    };
    // iPhone: webkitCompassHeading is already a compass heading (magnetic north).
    const ios = (e: DeviceOrientationEvent) => {
      const value = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof value === "number") save(value);
    };
    // Android: an absolute orientation, turned into where the back camera points.
    const absolute = (e: DeviceOrientationEvent) => {
      if (e.absolute || e.type === "deviceorientationabsolute") save(cameraHeading(e.alpha, e.beta, e.gamma));
    };
    window.addEventListener("deviceorientation", ios);
    window.addEventListener("deviceorientationabsolute", absolute as EventListener);
    setTimeout(() => {
      // Where the browser has a permission step, the "Turn on compass" button stays instead.
      if (!heard) setCompass((c) => (c === "on" || c === "ask" ? c : "none"));
    }, 4000);
    return () => {
      window.removeEventListener("deviceorientation", ios);
      window.removeEventListener("deviceorientationabsolute", absolute as EventListener);
    };
  }, []);

  const compassCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => compassCleanup.current?.(), []);

  const askCompass = async () => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> };
    try {
      const answer = await DOE.requestPermission?.();
      if (answer !== "granted") {
        setCompass("none");
        return;
      }
    } catch {
      setCompass("none");
      return;
    }
    compassCleanup.current?.();
    compassCleanup.current = listenCompass();
  };

  // ---- Start: location first, then the rear camera inside the page. ----
  const start = async () => {
    setSendError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !navigator.geolocation) {
      setStage({ kind: "error", problem: "insecure" });
      return;
    }
    setStage({ kind: "starting" });
    // Start loading the face check now, so it is ready by the first shot.
    void loadFaceDetector().catch(() => {});

    const located = await new Promise<"ok" | Problem>((resolve) => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      let settled = false;
      watchRef.current = navigator.geolocation.watchPosition(
        (p) => {
          onPosition(p);
          if (!settled) {
            settled = true;
            resolve("ok");
          }
        },
        (err) => {
          if (!settled) {
            settled = true;
            resolve(err.code === err.PERMISSION_DENIED ? "location_denied" : "location_unavailable");
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
      );
    });
    if (located !== "ok") {
      stopAll();
      setStage({ kind: "error", problem: located });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 4032 }, height: { ideal: 3024 } },
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track?.getSettings().facingMode === "user") {
        stopAll();
        setStage({ kind: "error", problem: "front_camera" });
        return;
      }
      // Ask for the most the camera can give, where the browser says what that is.
      const caps = track?.getCapabilities?.();
      const set = track?.getSettings();
      if (caps?.width?.max && caps.height?.max && set && (caps.width.max > (set.width ?? 0) || caps.height.max > (set.height ?? 0))) {
        await track.applyConstraints({ width: { ideal: caps.width.max }, height: { ideal: caps.height.max } }).catch(() => {});
      }
    } catch (err) {
      stopAll();
      const name = err instanceof DOMException ? err.name : "";
      setStage({ kind: "error", problem: name === "NotAllowedError" || name === "SecurityError" ? "camera_denied" : "no_camera" });
      return;
    }

    // The compass: listen straight away (most Android phones just send it). Where the
    // browser has a permission step (iPhone, and some others), a "Turn on compass"
    // button shows until a reading arrives.
    const DOE = typeof DeviceOrientationEvent === "undefined" ? undefined : (DeviceOrientationEvent as unknown as { requestPermission?: unknown });
    if (!DOE) setCompass("none");
    else {
      setCompass(typeof DOE.requestPermission === "function" ? "ask" : "off");
      compassCleanup.current?.();
      compassCleanup.current = listenCompass();
    }
    setStage({ kind: "camera" });
  };

  // Attach the stream whenever the camera view is on screen.
  useEffect(() => {
    const video = videoRef.current;
    if (stage.kind !== "camera" || !video || !streamRef.current) return;
    if (video.srcObject !== streamRef.current) video.srcObject = streamRef.current;
    void video.play().catch(() => {});
  }, [stage.kind]);

  const state: FixState = fixState(fix, now);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);

  // ---- The shutter ----
  const shoot = async () => {
    const video = videoRef.current;
    const at = Date.now();
    const shotFix = fixRef.current;
    if (!video || !shotFix || fixState(shotFix, at) !== "ok" || !video.videoWidth) return;
    const captureWidth = video.videoWidth;
    const captureHeight = video.videoHeight;
    const h = headingRef.current && at - headingRef.current.at < 3000 ? headingRef.current.value : null;
    const { width, height } = scaledSize(captureWidth, captureHeight);
    const picture = document.createElement("canvas");
    picture.width = width;
    picture.height = height;
    const ctx = picture.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, 0, 0, width, height);

    setStage({ kind: "processing", progress: 0 });
    // Faces are found here but not blurred: they go with the photo as suggestions,
    // and the reviewer decides what is blurred before it goes live.
    let boxes: Box[] = [];
    try {
      const found = await findFaces(picture, (progress) => setStage({ kind: "processing", progress }));
      boxes = suggestedBoxes(found, width, height);
    } catch {
      setStage({ kind: "error", problem: "detector" });
      return;
    }
    let blob = await toJpeg(picture, UPLOAD_JPEG_QUALITY);
    if (blob && blob.size > MAX_UPLOAD_BYTES) blob = await toJpeg(picture, 0.8);
    if (!blob) {
      setSendError(SUBMIT_PROBLEMS.file_type);
      setStage({ kind: "camera" });
      return;
    }
    setPeople(null);
    setLicensed(false);
    setSendError(null);
    setStage({
      kind: "preview",
      shot: { blob, url: URL.createObjectURL(blob), width, height, captureWidth, captureHeight, boxes, fix: shotFix, capturedAt: at, heading: h },
    });
  };

  const retake = () => {
    if (stage.kind === "preview") URL.revokeObjectURL(stage.shot.url);
    setSendError(null);
    setStage(streamRef.current ? { kind: "camera" } : { kind: "intro" });
  };

  const send = async () => {
    if (stage.kind !== "preview" || people === null || !licensed) return;
    const { shot } = stage;
    setStage({ kind: "sending", shot });
    setSendError(null);
    const form = new FormData();
    form.append("photo", shot.blob, "photo.jpg");
    form.append(
      "meta",
      JSON.stringify({
        lat: shot.fix.lat,
        lng: shot.fix.lng,
        accuracy: shot.fix.accuracy,
        positionAt: Math.round(shot.fix.at),
        capturedAt: shot.capturedAt,
        heading: shot.heading,
        captureWidth: shot.captureWidth,
        captureHeight: shot.captureHeight,
        people,
        boxes: shot.boxes,
        license: true,
      }),
    );
    try {
      const res = await fetch("/api/contributions", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; problem?: string };
      if (res.status === 401 || body.problem === "account_required" || body.problem === "no_username") {
        router.push("/login?reason=contribute&next=%2Fcontribute");
        return;
      }
      if (!res.ok || !body.ok) {
        setSendError(SUBMIT_PROBLEMS[body.problem ?? ""] ?? SUBMIT_PROBLEMS.server_error);
        setStage({ kind: "preview", shot });
        return;
      }
      URL.revokeObjectURL(shot.url);
      setStage({ kind: "sent" });
      void mine.reload();
    } catch {
      setSendError("Couldn't reach BruinGuessr. Check your connection and try again.");
      setStage({ kind: "preview", shot });
    }
  };

  const quota = mine.data?.quota;
  const full = quota ? quota.last24h >= quota.dailyLimit || quota.waiting >= quota.waitingLimit : false;

  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden" aria-labelledby="contribute-title">
        {stage.kind === "intro" && (
          <div className="p-5 sm:p-7">
            <h1 id="contribute-title" className="flex items-center gap-3">
              <span className="chip bg-green">
                <CameraIcon />
              </span>
              <span className="display text-[clamp(2.4rem,9vw,3.6rem)]">
                Add a <span className="text-ucla-gold">photo</span>
              </span>
            </h1>
            <p className="mt-3 text-lg text-sky">
              Open photo collections barely cover the Hill, the northwest and the edges of campus. Take a photo there and it can end up in everyone&rsquo;s
              games, credited to you.
            </p>
            <ul className="mt-4 space-y-2 text-sky">
              <Step n={1}>We read your location, then open the camera here in the page.</Step>
              <Step n={2}>Point at something recognisable: a building, a corner, a view. Shoot places, not people.</Step>
              <Step n={3}>We mark any faces we find. A person checks every photo and blurs faces before it goes live.</Step>
            </ul>
            {device === "desktop" ? (
              <div className="row mt-6 p-4">
                <p className="heading text-2xl">Open this page on your phone</p>
                <p className="mt-1 text-sky">
                  Photos are taken with your phone&rsquo;s rear camera, on campus. Go to <span className="font-semibold text-paper">bruinguessr.com/contribute</span> on
                  your phone.
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <button type="button" className="btn btn-gold w-full sm:w-auto" onClick={start} disabled={device === "unknown" || full}>
                  <PinIcon className="h-6 w-6" /> Start
                </button>
                {full && <p className="mt-3 font-semibold text-hurt">{quotaLine(quota!)}</p>}
                <p className="mt-3 text-sm text-sky">Your browser will ask to use your location, then your camera.</p>
              </div>
            )}
          </div>
        )}

        {stage.kind === "starting" && (
          <div className="grid min-h-72 place-items-center p-8 text-center">
            <div>
              <p id="contribute-title" className="heading text-3xl">
                Finding you…
              </p>
              <p className="mt-2 text-sky">Allow location, then the camera, when your browser asks.</p>
            </div>
          </div>
        )}

        {stage.kind === "camera" && (
          <div className="p-3 sm:p-4">
            <h1 id="contribute-title" className="sr-only">
              Take a photo
            </h1>
            <div
              className="relative mx-auto w-full overflow-hidden rounded-[16px] bg-black"
              style={{ aspectRatio: videoSize ? `${videoSize.w} / ${videoSize.h}` : "3 / 4", maxHeight: "62dvh" }}
            >
              <video
                ref={videoRef}
                className="h-full w-full object-contain"
                playsInline
                muted
                autoPlay
                onLoadedMetadata={(e) => setVideoSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
              />
              <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-2">
                <GpsChip fix={fix} state={state} />
                {compass === "on" && heading ? (
                  <span className="rounded-full bg-night/80 px-3 py-1.5 text-sm font-semibold text-paper backdrop-blur-sm">
                    <CompassIcon className="mr-1 inline h-4 w-4 align-[-3px]" />
                    {compassPoint(heading.value)} {Math.round(heading.value)}°
                  </span>
                ) : null}
              </div>
              <p className="absolute inset-x-2 bottom-2 rounded-[10px] bg-night/80 px-3 py-2 text-center text-sm font-semibold text-paper backdrop-blur-sm">
                Wait for people to pass. Shoot places, not people.
              </p>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className={`font-semibold ${state === "ok" ? "text-leaf" : state === "outside" ? "text-alarm" : "text-hurt"}`} aria-live="polite">
                  {fixMessage(state, fix)}
                </p>
                {compass === "ask" && (
                  <button type="button" onClick={askCompass} className="btn-quiet mt-2">
                    <CompassIcon className="h-4 w-4" /> Turn on compass
                  </button>
                )}
                {compass === "none" && <p className="mt-1 text-sky">No compass reading. That&rsquo;s fine.</p>}
              </div>
              <button
                type="button"
                onClick={shoot}
                disabled={state !== "ok"}
                aria-label="Take the photo"
                className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-[5px] border-paper bg-ucla-gold shadow-[0_5px_0_var(--color-gold-deep)] transition-transform active:translate-y-[3px] disabled:border-navy-line disabled:bg-[#284560] disabled:shadow-none"
              >
                <CameraIcon className="h-8 w-8 text-night" />
              </button>
            </div>
            {sendError && (
              <p role="alert" className="mt-3 font-semibold text-alarm">
                {sendError}
              </p>
            )}
          </div>
        )}

        {stage.kind === "processing" && (
          <div className="grid min-h-72 place-items-center p-8 text-center">
            <div className="w-full max-w-sm">
              <p id="contribute-title" className="heading text-3xl">
                Checking for faces…
              </p>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-night ring-1 ring-navy-line">
                <div className="h-full bg-ucla-gold transition-[width]" style={{ width: `${Math.round(stage.progress * 100)}%` }} />
              </div>
              <p className="mt-3 text-sm text-sky">Anything that looks like a face is marked for the reviewer, who blurs it before the photo goes live.</p>
            </div>
          </div>
        )}

        {(stage.kind === "preview" || stage.kind === "sending") && (
          <div className="p-3 sm:p-4">
            <h1 id="contribute-title" className="heading px-1 text-3xl">
              Your photo
            </h1>
            <div className="relative mx-auto mt-3 w-fit max-w-full overflow-hidden rounded-[14px] bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob, nothing to optimise */}
              <img
                src={stage.shot.url}
                alt={stage.shot.boxes.length > 0 ? "The photo you just took, with the faces we found outlined" : "The photo you just took"}
                className="block max-h-[52dvh] w-auto max-w-full object-contain"
              />
              {stage.shot.boxes.map((b, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="absolute rounded-[3px] border-2 border-ucla-gold"
                  style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
                />
              ))}
            </div>
            <p className="mt-2 px-1 text-sm text-sky">
              {stage.shot.boxes.length > 0
                ? `We marked ${stage.shot.boxes.length} possible face${stage.shot.boxes.length === 1 ? "" : "s"}. `
                : "We didn't find any faces. "}
              Until it is accepted, only you and our reviewers can see it. Reviewers blur faces, including any we missed, before it goes live.
            </p>

            <fieldset className="row mt-4 p-4">
              <legend className="sr-only">People</legend>
              <p className="font-semibold">Are there people in this photo?</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[true, false].map((answer) => (
                  <button
                    key={String(answer)}
                    type="button"
                    aria-pressed={people === answer}
                    onClick={() => setPeople(answer)}
                    className={`rounded-[12px] border-2 px-4 py-3 text-lg font-semibold transition-colors ${
                      people === answer ? "border-ucla-gold bg-ucla-gold text-night" : "border-navy-line text-paper hover:border-sky"
                    }`}
                  >
                    {answer ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="row mt-3 flex cursor-pointer items-start gap-3 p-4">
              <input type="checkbox" checked={licensed} onChange={(e) => setLicensed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-ucla-gold" />
              <span className="text-sm">
                <span className="font-semibold text-paper">I took this photo, and I license it under </span>
                <a href={CONTRIBUTION_LICENSE_URL} target="_blank" rel="noreferrer license" className="font-semibold text-ucla-gold underline underline-offset-2">
                  {CONTRIBUTION_LICENSE}
                </a>
                <span className="text-sky">, credited to my username ({username}). The credit follows if I change my name.</span>
              </span>
            </label>

            {sendError && (
              <p role="alert" className="mt-3 px-1 font-semibold text-alarm">
                {sendError}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-gold" onClick={send} disabled={stage.kind === "sending" || people === null || !licensed}>
                {stage.kind === "sending" ? "Sending…" : "Submit"}
              </button>
              <button type="button" className="btn-quiet" onClick={retake} disabled={stage.kind === "sending"}>
                Retake
              </button>
            </div>
            <p className="mt-3 px-1 text-xs text-sky">
              Camera {stage.shot.captureWidth} × {stage.shot.captureHeight} · sent at {stage.shot.width} × {stage.shot.height} · location ±
              {Math.round(stage.shot.fix.accuracy)} m
            </p>
          </div>
        )}

        {stage.kind === "sent" && (
          <div className="p-6 text-center sm:p-8">
            <span className="chip mx-auto bg-green">
              <CheckIcon />
            </span>
            <p id="contribute-title" className="heading mt-3 text-3xl">
              Sent. Thank you!
            </p>
            <p className="mt-2 text-sky">It&rsquo;s waiting for review. You&rsquo;ll see it go live in Your photos below.</p>
            <button type="button" className="btn btn-gold mt-5" onClick={() => setStage(streamRef.current ? { kind: "camera" } : { kind: "intro" })} disabled={full}>
              Take another
            </button>
            {full && quota && <p className="mt-3 font-semibold text-hurt">{quotaLine(quota)}</p>}
          </div>
        )}

        {stage.kind === "error" && (
          <div className="p-6 sm:p-8">
            <p id="contribute-title" className="heading text-3xl text-hurt">
              {PROBLEMS[stage.problem].title}
            </p>
            <p className="mt-2 text-sky">{PROBLEMS[stage.problem].text}</p>
            <button type="button" className="btn btn-gold mt-5" onClick={start}>
              Try again
            </button>
          </div>
        )}
      </section>

      <YourPhotos data={mine.data} failed={mine.failed} />
    </div>
  );
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function fixMessage(state: FixState, fix: Fix | null): string {
  switch (state) {
    case "none":
      return "Finding your location…";
    case "stale":
      return "Waiting for a fresh location…";
    case "inaccurate":
      return `Location is ±${Math.round(fix?.accuracy ?? 0)} m. Needs ${MAX_ACCURACY_M} m or better: step into the open.`;
    case "outside":
      return "You're outside the campus boundary.";
    case "ok":
      return (fix?.accuracy ?? 0) > PIN_CHECK_ACCURACY_M ? "Ready. (Rough location: a reviewer will check the pin.)" : "Ready.";
  }
}

function quotaLine(q: Quota): string {
  if (q.waiting >= q.waitingLimit) return `You have ${q.waiting} photos waiting for review. Once some are reviewed you can send more.`;
  return `You've sent ${q.last24h} photos in the last 24 hours, the most for now. Come back tomorrow.`;
}

function GpsChip({ fix, state }: { fix: Fix | null; state: FixState }) {
  const tone = state === "ok" ? (fix && fix.accuracy > PIN_CHECK_ACCURACY_M ? "bg-ucla-gold text-night" : "bg-leaf text-night") : "bg-alarm text-night";
  return (
    <span className={`numeric rounded-full px-3 py-1.5 text-sm font-bold ${tone}`}>
      <PinIcon className="mr-1 inline h-4 w-4 align-[-3px]" />
      {fix ? `±${Math.round(fix.accuracy)} m` : "No GPS"}
      {state === "outside" ? " · off campus" : state === "stale" ? " · old" : ""}
    </span>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="numeric grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ucla-blue text-sm font-bold text-paper">{n}</span>
      <span>{children}</span>
    </li>
  );
}

const STATUS = {
  waiting: { label: "Waiting", className: "bg-ucla-gold text-night" },
  live: { label: "Live", className: "bg-leaf text-night" },
  rejected: { label: "Not accepted", className: "bg-brick-light text-night" },
  removed: { label: "Removed", className: "bg-out text-night" },
} as const;

/** The player's own submissions. Only they see this list. */
function YourPhotos({ data, failed }: { data: { items: MyContribution[]; quota: Quota } | null; failed: boolean }) {
  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="your-photos">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-navy-line pb-3">
        <h2 id="your-photos" className="heading text-2xl">
          Your photos
        </h2>
        {data && (
          <p className="numeric text-sm text-sky">
            {data.quota.last24h} of {data.quota.dailyLimit} today · {data.quota.waiting} waiting
          </p>
        )}
      </div>
      {failed && !data && <p className="mt-3 text-sky">Your photos couldn&rsquo;t load. Refresh to try again.</p>}
      {!failed && !data && <div className="mt-3 h-20 animate-pulse rounded-[14px] bg-night/60" />}
      {data && data.items.length === 0 && <p className="mt-3 text-sky">Nothing yet. Photos you send show up here, and only you can see this list.</p>}
      {data && data.items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {data.items.map((item) => (
            <li key={item.id} className="row flex items-center gap-3 p-2.5">
              {item.status === "waiting" || item.status === "live" ? (
                // eslint-disable-next-line @next/next/no-img-element -- a private, per-player image; next/image would cache it
                <img src={`/api/contributions/${item.id}/thumb`} alt="" className="h-14 w-14 shrink-0 rounded-[10px] bg-night object-cover" loading="lazy" />
              ) : (
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[10px] bg-night text-out">
                  <CameraIcon className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${STATUS[item.status].className}`}>{STATUS[item.status].label}</span>
                <p className="mt-1 text-sm text-sky">
                  Sent {formatDay(item.receivedAt)}
                  {item.status === "rejected" && item.reason ? <> · {item.reason}</> : null}
                  {item.status === "removed" ? <> · taken out of the game</> : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
