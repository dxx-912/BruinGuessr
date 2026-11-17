"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import GameMap, { type MapPlayer, type MapView } from "@/components/game/GameMap";
import PhotoViewer from "@/components/game/PhotoViewer";
import RevealPanel from "@/components/game/RevealPanel";
import RoundTracker from "@/components/game/RoundTracker";
import SummaryPanel from "@/components/game/SummaryPanel";
import Timer from "@/components/game/Timer";
import PlayerStrip from "@/components/versus/PlayerStrip";
import { SeatBadge } from "@/components/versus/SeatBadge";
import VersusRevealPanel from "@/components/versus/VersusRevealPanel";
import LoadingMark from "@/components/LoadingMark";
import Wordmark, { PinMark } from "@/components/Wordmark";
import { api, ApiError, mergeState, serverClock } from "@/lib/game/api";
import { sound } from "@/lib/game/sound";
import { phaseOf, type GameState, type LatLng } from "@/lib/game/types";
import { useRoomPing } from "@/lib/versus/realtime";
import { initialOf } from "@/lib/versus/types";

/**
 * Where a round stands on this screen:
 *   intro    the "Round 3" card is up and the photo is loading behind it
 *   play     the clock is running and the map takes pins
 *   locking  the player pressed Guess and the server is scoring it
 *   locked   versus only: the guess is in, and the round is waiting for the other players
 *   timeup   the clock hit zero; waiting for the server to score the round
 */
type Stage = "intro" | "play" | "locking" | "locked" | "timeup";

/** How often a versus game asks the server where things stand, on top of the "something changed" pings. */
const POLL_MS = { playing: 2500, finished: 4000 };

function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
}

/** The height of a panel as it is on screen, so the map can keep its pins clear of it. */
function useMeasuredHeight(): [(el: HTMLElement | null) => void, number | null] {
  const [height, setHeight] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) {
      setHeight(null);
      return;
    }
    observer.current = new ResizeObserver(() => setHeight(Math.round(el.getBoundingClientRect().height)));
    observer.current.observe(el);
  }, []);
  return [ref, height];
}

/** How many times a round's photo is asked for before the screen says it could not load. */
const PHOTO_ATTEMPTS = 3;

export default function GameClient({ gameId }: { gameId: string }) {
  const router = useRouter();
  const desktop = useMedia("(min-width: 768px)");
  const wide = useMedia("(min-width: 1024px)");
  /** A mouse can point at the map to enlarge it. A finger gets a button for that instead. */
  const canHover = useMedia("(hover: hover) and (pointer: fine)");

  const [state, setState] = useState<GameState | null>(null);
  const [fatal, setFatal] = useState<"not_found" | "failed" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [pin, setPin] = useState<LatLng | null>(null);
  /** Round number → in-memory copy of its photo. The only copy the reveal and summary can use. */
  const [photos, setPhotos] = useState<Record<number, string>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** The round whose photo could not be downloaded, and how many times the player asked again. */
  const [photoFailed, setPhotoFailed] = useState<number | null>(null);
  const [photoRetry, setPhotoRetry] = useState(0);
  const [panelRef, panelHeight] = useMeasuredHeight();

  const pinSaves = useRef<Promise<unknown>>(Promise.resolve());
  const photoUrls = useRef<string[]>([]);
  const collapseTimer = useRef(0);
  const refreshing = useRef<Promise<GameState | null> | null>(null);
  const leaving = useRef(false);

  const phase = state ? phaseOf(state) : "loading";
  const round = state?.round ?? null;
  const roundNumber = round?.number ?? null;
  const versus = state?.versus ?? null;
  const isVersus = state?.mode === "versus";

  /** Takes a state from the server. Answers that arrive out of order never move the screen backwards. */
  const apply = useCallback((next: GameState) => setState((current) => mergeState(current, next)), []);

  // ---- Talking to the server ----------------------------------------------------------
  const handleError = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? err.code : "server_error";
      if (code === "unauthorized") router.replace(`/?signin=required&next=${encodeURIComponent(`/game/${gameId}`)}`);
      else if (code === "not_found") setFatal("not_found");
      else setNotice(code === "network" ? "Connection problem. Check your internet." : "Something went wrong. Try again.");
    },
    [gameId, router],
  );

  // One request at a time: asking again while an answer is on its way waits for that answer.
  const refresh = useCallback((): Promise<GameState | null> => {
    if (leaving.current) return Promise.resolve(null);
    refreshing.current ??= api
      .state(gameId)
      .then((next) => {
        apply(next);
        setNotice(null);
        return next;
      })
      .catch((err) => {
        if (!leaving.current) handleError(err);
        return null;
      })
      .finally(() => {
        refreshing.current = null;
      });
    return refreshing.current;
  }, [gameId, apply, handleError]);

  // Load the game. A game that is already over opens on its summary.
  useEffect(() => {
    let cancelled = false;
    api
      .state(gameId)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded.status === "completed") setShowSummary(true);
        apply(loaded);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.code === "unauthorized" || err.code === "not_found")) handleError(err);
        else setFatal("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, apply, handleError]);

  // Read the saved sound setting once the page is live in the browser.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMuted(sound.isMuted()));
    return () => cancelAnimationFrame(id);
  }, []);

  // Leaving the game page: free the photo copies. Next.js keeps this page's state in case
  // the player comes back to it (the Back button, or a rematch that returns here), so also
  // clear what would be wrong by then: freed photos, and buttons left saying "Starting…".
  useLayoutEffect(() => {
    const urls = photoUrls.current;
    return () => {
      urls.splice(0).forEach((url) => URL.revokeObjectURL(url));
      setPhotos({});
      setBusy(false);
      setLightbox(null);
      setConfirmLeave(false);
      leaving.current = false;
    };
  }, []);

  const startNextRound = useCallback(async () => {
    setBusy(true);
    try {
      apply(await api.startRound(gameId));
      setNotice(null);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }, [gameId, apply, handleError]);

  // A fresh game has no round open yet: open the first one as soon as the page is up.
  const openedFirst = useRef(false);
  useEffect(() => {
    if (phase !== "ready" || openedFirst.current) return;
    openedFirst.current = true;
    const id = requestAnimationFrame(() => void startNextRound());
    return () => cancelAnimationFrame(id);
  }, [phase, startNextRound]);

  // ---- One round ----------------------------------------------------------------------
  const startsAt = round?.startsAt ?? 0;
  const deadlineAt = round?.deadlineAt ?? 0;
  const graceMs = round?.graceMs ?? 0;
  const savedPin = round?.pin ?? null;
  const savedLock = round?.locked ?? false;

  // A round opened (or the page was reloaded during one): fetch its photo and run its clock.
  useEffect(() => {
    if (roundNumber === null) return;
    let cancelled = false;
    const timers: number[] = [];
    const after = (ms: number, run: () => void) => timers.push(window.setTimeout(run, Math.max(0, ms)));

    const now = serverClock.now();
    after(0, () => {
      setPin(savedPin);
      setMapOpen(false);
      setLightbox(null);
      setStage(now < startsAt ? "intro" : savedLock ? "locked" : "play");
    });
    if (now < startsAt) {
      after(startsAt - now, () => {
        setStage("play");
        sound.roundStart();
      });
    }
    after(deadlineAt - now, () => {
      setStage((current) => {
        if (current === "locking" || current === "locked") return current;
        sound.timeUp();
        return "timeup";
      });
    });
    // The server keeps accepting the last pin for a moment after zero. Once that
    // moment has passed, ask it for the result; it scores the round on that request.
    after(deadlineAt + graceMs + 200 - now, async () => {
      await pinSaves.current;
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        const next = await refresh();
        if (next && next.round?.number !== roundNumber) return;
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    });

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
    // savedPin and savedLock are read once when the round opens; later saves must not restart the round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, roundNumber, startsAt, deadlineAt, graceMs, refresh]);

  // The round's photo. A dropped connection gets a few quiet retries; after that the screen
  // says so and offers "Try again". The clock decides when the round is over either way.
  useEffect(() => {
    if (roundNumber === null) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 1; attempt <= PHOTO_ATTEMPTS && !cancelled; attempt++) {
        try {
          const blob = await api.photo(gameId, roundNumber);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          photoUrls.current.push(url);
          setPhotos((current) => ({ ...current, [roundNumber]: url }));
          setPhotoFailed((current) => (current === roundNumber ? null : current));
          return;
        } catch (err) {
          // The round has ended: its photo address is closed for good, so asking again is pointless.
          if (err instanceof ApiError && err.code === "round_closed") return;
          if (attempt < PHOTO_ATTEMPTS) await new Promise((resolve) => window.setTimeout(resolve, 700 * attempt));
        }
      }
      if (!cancelled) setPhotoFailed(roundNumber);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, roundNumber, photoRetry]);

  const placePin = useCallback(
    (next: LatLng) => {
      if (roundNumber === null || stage !== "play") return;
      setPin(next);
      sound.pin();
      // Saved straight away, one after another, so the latest pin is on the server when the clock hits zero.
      pinSaves.current = pinSaves.current.then(() =>
        api.pin(gameId, roundNumber, next).catch((err) => {
          if (err instanceof ApiError && (err.code === "too_late" || err.code === "round_closed")) void refresh();
        }),
      );
    },
    [gameId, roundNumber, stage, refresh],
  );

  const guess = useCallback(async () => {
    if (roundNumber === null || stage !== "play" || !pin) return;
    setStage("locking");
    sound.lock();
    await pinSaves.current;
    try {
      const next = await api.guess(gameId, roundNumber, pin);
      apply(next);
      setNotice(null);
      // Versus: the guess is in, but the round stays open until the others have guessed.
      if (next.round?.number === roundNumber) setStage((current) => (current === "locking" ? (next.round?.locked ? "locked" : "play") : current));
    } catch (err) {
      handleError(err);
      setStage((current) => (current === "locking" ? "play" : current));
    }
  }, [gameId, roundNumber, stage, pin, apply, handleError]);

  const next = useCallback(() => {
    if (!state || busy) return;
    if (state.status === "completed") setShowSummary(true);
    else void startNextRound();
  }, [state, busy, startNextRound]);

  // ---- Versus: other players change the game too --------------------------------------
  // The room pings when someone guesses or a round opens. If an answer is already on its
  // way it may predate the change, so ask once more after it.
  const onPing = useCallback(() => {
    const inFlight = refreshing.current;
    if (inFlight) void inFlight.then(() => refresh());
    else void refresh();
  }, [refresh]);
  useRoomPing(isVersus ? versus?.channel : null, onPing);

  // Ask on a timer as well. It is what tells the server this player is still here, and it
  // keeps the game moving if a ping is lost.
  const rematchState = versus?.rematch.state ?? null;
  const pollMs = !isVersus || fatal ? null : state?.status === "active" ? POLL_MS.playing : state?.status === "completed" && rematchState === "open" ? POLL_MS.finished : null;
  useEffect(() => {
    if (pollMs === null) return;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      await refresh();
      if (!stopped) timer = window.setTimeout(tick, pollMs);
    };
    timer = window.setTimeout(tick, pollMs);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [pollMs, refresh]);

  // Between rounds the next one opens by itself, for everyone at the same moment. The
  // server decides when; every player's browser asks at that time and the first to ask opens it.
  const nextRoundAt = versus?.nextRoundAt ?? null;
  useEffect(() => {
    if (nextRoundAt === null) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        try {
          const opened = await api.startRound(gameId);
          if (cancelled) return;
          apply(opened);
          if (opened.round || opened.status !== "active") return;
        } catch {
          // The regular check keeps trying.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 600));
      }
    }, Math.max(0, nextRoundAt + 150 - serverClock.now()));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [nextRoundAt, gameId, apply]);

  /** Leaves the room for good (the seat is kept until the game ends, so the room link still works) and goes home. */
  const roomCode = versus?.code ?? null;
  const leave = useCallback(async () => {
    leaving.current = true;
    if (roomCode) await api.leaveRoom(roomCode).catch(() => {});
    router.push("/");
  }, [roomCode, router]);

  /** The mark at top left. Mid-game it asks first: on a phone it is easy to touch by accident. */
  const active = state?.status === "active";
  const goHome = useCallback(() => {
    if (isVersus) void leave();
    else router.push("/");
  }, [isVersus, leave, router]);
  const askToLeave = useCallback(() => {
    if (active) setConfirmLeave(true);
    else goHome();
  }, [active, goHome]);
  useEffect(() => {
    if (!confirmLeave) return;
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && setConfirmLeave(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmLeave]);

  const rematch = useCallback(() => {
    setBusy(true);
    // The room page joins the lobby, or explains why it can't.
    router.push(roomCode && rematchState === "open" ? `/versus/${roomCode}` : "/versus");
  }, [roomCode, rematchState, router]);

  const playAgain = useCallback(async () => {
    setBusy(true);
    try {
      const created = await api.newGame();
      router.push(`/game/${created.id}`);
    } catch (err) {
      handleError(err);
      setBusy(false);
    }
  }, [router, handleError]);

  // Space or Enter: guess while playing.
  useEffect(() => {
    if (phase !== "guessing" || stage !== "play" || !pin || confirmLeave) return;
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if ((ev.key === " " || ev.key === "Enter") && !target?.closest("button, a, input")) {
        ev.preventDefault();
        void guess();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, stage, pin, guess, confirmLeave]);

  // ---- What to draw -------------------------------------------------------------------
  const reveal = state && !round && !showSummary && state.currentRound > 0 ? (state.results.find((r) => r.round === state.currentRound) ?? null) : null;
  const summary = state !== null && showSummary && state.status === "completed";
  const guessing = phase === "guessing" && round !== null;

  // The players as the map draws them. Kept the same object while nobody's seat or name
  // changes, because the map replays a reveal whenever what it is given changes.
  const playersKey = versus ? versus.players.map((p) => `${p.seat}:${p.isYou ? 1 : 0}:${initialOf(p.username)}`).join(",") : "";
  const mapPlayers = useMemo<MapPlayer[] | null>(
    () =>
      playersKey
        ? playersKey.split(",").map((entry) => {
            const [seat, isYou, label] = entry.split(":");
            return { seat: Number(seat), isYou: isYou === "1", label };
          })
        : null,
    [playersKey],
  );
  const mapMe = useMemo(() => mapPlayers?.find((p) => p.isYou) ?? null, [mapPlayers]);
  // Likewise the round on show: reporting its photo changes the result, not the pins.
  const revealKey = reveal ? JSON.stringify([reveal.round, reveal.guess, reveal.answer, reveal.players]) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- revealKey stands for everything the map draws
  const revealOnMap = useMemo(() => reveal, [revealKey]);
  const results = state?.results;

  const mapView = useMemo<MapView>(() => {
    if (summary && results) return { kind: "summary", results, focus, players: mapPlayers };
    if (revealOnMap) return { kind: "reveal", result: revealOnMap, players: mapPlayers };
    return { kind: "guess", pin, canPlace: guessing && stage === "play", player: mapMe };
  }, [summary, results, focus, revealOnMap, pin, guessing, stage, mapPlayers, mapMe]);

  const playerCount = versus?.players.length ?? 0;
  const mapInset = useMemo(() => {
    if (!revealOnMap) return undefined;
    // On a phone the top bar is as tall as a pin, so the camera stays further below it.
    const top = desktop ? 60 : 96;
    // The panel sits 12 px above the bottom edge. Until it has been measured, a close guess:
    // a versus reveal also holds the scoreboard, one row per player.
    const guess = playerCount ? (wide ? 180 + 34 * playerCount : 250 + 30 * playerCount) : desktop ? 230 : 270;
    return { top, bottom: panelHeight === null ? guess : panelHeight + 20 };
  }, [revealOnMap, desktop, wide, playerCount, panelHeight]);

  if (fatal || phase === "abandoned") {
    const abandoned = phase === "abandoned";
    return (
      <Shell>
        <div className="panel m-auto max-w-md animate-pop p-7 text-center">
          <h1 className="display text-4xl">{abandoned ? "This game is over" : fatal === "not_found" ? "Game not found" : "Could not load the game"}</h1>
          <p className="mt-3 text-sky">
            {abandoned
              ? isVersus
                ? "Everyone left before the last round. Only finished games count."
                : "You started another game, which ended this one. Only finished games count."
              : fatal === "not_found"
                ? "This link does not match a game on your account."
                : "Check your connection and try again."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {fatal === "failed" ? (
              <button type="button" className="btn btn-gold" onClick={() => window.location.reload()}>
                Try again
              </button>
            ) : (
              <button type="button" className="btn btn-gold" onClick={isVersus ? rematch : playAgain} disabled={busy}>
                {busy ? "Starting…" : isVersus ? "New room" : "New game"}
              </button>
            )}
            <Link href="/" className="btn btn-blue">
              Home
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  // The map dock: a small panel during a round (large when pointed at), the whole screen afterwards.
  const dock = summary
    ? "absolute inset-x-0 top-0 h-[36%] md:inset-y-0 md:left-0 md:right-[28rem] md:h-auto"
    : reveal
      ? "absolute inset-0"
      : // On a phone the map is the lower part of the screen, and its corner button gives it most of the screen.
        `absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-night p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-[height] duration-200 md:inset-auto md:bottom-4 md:right-4 md:bg-transparent md:p-0 md:transition-[width,height] md:duration-150 ${
          mapOpen ? "h-[74%] md:h-[min(64vh,640px)] md:w-[min(58vw,860px)]" : "h-[54%] md:h-[min(300px,60vh)] md:w-[400px]"
        }`;
  const photoUrl = roundNumber !== null ? photos[roundNumber] : undefined;
  const canGuess = stage === "play" && pin !== null;
  const waitingFor = versus ? versus.players.filter((p) => !p.locked && !p.away).length : 0;
  const guessLabel =
    stage === "locking"
      ? "Locking in…"
      : stage === "locked"
        ? waitingFor > 0
          ? `Locked in. Waiting for ${waitingFor} ${waitingFor === 1 ? "player" : "players"}`
          : "Locked in…"
        : stage === "timeup"
          ? "Time's up"
          : pin
            ? "Guess"
            : "Place your pin on the map";
  const photoIsDown = roundNumber !== null && photoFailed === roundNumber && !photoUrl;

  return (
    <Shell>
      {/* The photo. Under everything else; only mounted while it is the thing to look at. */}
      {guessing && (
        <div className={`absolute inset-x-0 top-0 transition-[height] duration-200 md:inset-0 md:h-auto ${mapOpen ? "h-[26%]" : "h-[46%]"}`}>
          <PhotoViewer
            key={roundNumber}
            src={photoUrl ?? null}
            alt={`Round ${roundNumber}: a photo taken somewhere on campus`}
            failed={photoIsDown}
            onRetry={() => {
              setPhotoFailed(null);
              setPhotoRetry((n) => n + 1);
            }}
          />
        </div>
      )}

      {/* The map. One instance for the whole game; only its box changes. */}
      {state && (
        <div
          className={`z-20 ${dock}`}
          // With a mouse, pointing at the map enlarges it. A touch screen also reports these
          // events on every tap, which would resize the map under the finger, so it is left out.
          onMouseEnter={() => {
            if (!canHover) return;
            window.clearTimeout(collapseTimer.current);
            if (guessing) setMapOpen(true);
          }}
          // The pointer may already be resting here when a round starts, so moving it counts too.
          onMouseMove={() => {
            if (canHover && guessing && !mapOpen) {
              window.clearTimeout(collapseTimer.current);
              setMapOpen(true);
            }
          }}
          onMouseLeave={() => {
            if (canHover) collapseTimer.current = window.setTimeout(() => setMapOpen(false), 450);
          }}
        >
          <div className={`relative min-h-0 flex-1 overflow-hidden ${guessing || phase === "ready" ? "rounded-2xl border-2 border-navy-line shadow-[0_10px_28px_rgb(2_10_20/0.5)]" : "h-full"}`}>
            <GameMap view={mapView} onPin={placePin} inset={mapInset} />
            {guessing && !canHover && (
              <button
                type="button"
                aria-pressed={mapOpen}
                aria-label={mapOpen ? "Make the map smaller" : "Make the map bigger"}
                className="absolute right-2 top-2 z-10 grid h-11 w-11 cursor-pointer place-items-center rounded-xl border-2 border-navy-line bg-navy text-paper shadow-[0_2px_0_rgb(2_10_20/0.35)]"
                onClick={() => setMapOpen((open) => !open)}
              >
                <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.400" strokeLinecap="round" strokeLinejoin="round">
                  {mapOpen ? <path d="M5 3.500l5 4.500 5-4.500M5 16.500l5-4.500 5 4.500" /> : <path d="M5 8l5-4.500L15 8M5 12l5 4.500 5-4.500" />}
                </svg>
              </button>
            )}
          </div>
          {guessing && (
            <button type="button" className="btn btn-gold w-full max-md:!py-3.5" disabled={!canGuess} onClick={guess}>
              {guessLabel}
            </button>
          )}
        </div>
      )}

      {/* Top bar */}
      {!summary && (
        <header className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2">
          <div className="panel pointer-events-auto flex items-center !rounded-2xl p-1 sm:gap-1 sm:py-1.5 sm:pl-3 sm:pr-1.5">
            {/* Leaving a versus game tells the room, so nobody waits for this player. Mid-game, either mode asks first. */}
            <button
              type="button"
              className="grid h-11 min-w-11 cursor-pointer place-items-center rounded-xl hover:bg-navy-line max-[359px]:min-w-9 sm:h-auto sm:min-w-0 sm:hover:bg-transparent"
              onClick={askToLeave}
              aria-label="Leave the game and go home"
              title="Leave the game"
            >
              {/* On a phone the timer needs the middle of the bar, so only the pin shows. */}
              <PinMark className="h-7 w-auto sm:hidden" />
              <span className="hidden sm:inline">
                <Wordmark className="text-2xl" />
              </span>
            </button>
            <button
              type="button"
              aria-pressed={muted}
              aria-label={muted ? "Turn sound on" : "Turn sound off"}
              title={muted ? "Sound is off" : "Sound is on"}
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-sky hover:bg-navy-line hover:text-paper max-[359px]:w-9 sm:ml-1 sm:h-8 sm:w-8 sm:rounded-lg"
              onClick={() => {
                sound.setMuted(!muted);
                setMuted(!muted);
              }}
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
                <path d="M3 7.500h3l4-3.500v12l-4-3.500H3z" fill="currentColor" />
                {muted ? (
                  <path d="M13 7.500l4.500 5M17.500 7.500l-4.500 5" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" />
                ) : (
                  <path d="M13 7a4 4 0 010 6M15 4.500a7 7 0 010 11" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
          {state && (
            <div className="pointer-events-auto">
              <RoundTracker roundCount={state.roundCount} currentRound={state.currentRound} results={state.results} totalScore={state.totalScore} />
            </div>
          )}
        </header>
      )}

      {guessing && round && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
          <Timer key={round.number} startsAt={round.startsAt} deadlineAt={round.deadlineAt} running={stage === "play" || stage === "intro" || stage === "locked"} />
        </div>
      )}

      {/* Versus: who is playing, and who has guessed */}
      {guessing && versus && (
        <div className="pointer-events-none absolute left-3 top-[4.75rem] z-30 sm:top-[4.4rem]">
          <PlayerStrip players={versus.players} />
        </div>
      )}

      {/* "Round 3" card while the photo loads and before the clock starts */}
      {(phase === "loading" || phase === "ready" || (guessing && stage === "intro")) && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-night">
          {state && state.currentRound > 0 ? (
            <div key={state.currentRound} className="animate-pop text-center">
              <p className="display text-3xl text-sky">Round</p>
              <p className="display text-[11rem] leading-[0.8] text-ucla-gold">{state.currentRound}</p>
              <p className="display mt-3 text-2xl text-sky">of {state.roundCount}</p>
              <p className="mt-6 font-semibold text-paper">Where on campus was this photo taken?</p>
              {versus && (
                <ul aria-label="Players" className="mt-5 flex justify-center gap-2">
                  {versus.players.map((p) => (
                    <li key={p.seat} title={p.username}>
                      <SeatBadge seat={p.seat} name={p.username} className="h-9 w-9 text-xl" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <LoadingMark label="Setting up your game…" />
          )}
        </div>
      )}

      {guessing && stage === "timeup" && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-night/60">
          <p className="display animate-stamp rounded-2xl border-4 border-night bg-alarm px-8 py-3 text-6xl text-night shadow-[0_6px_0_#06182B]">Time&apos;s up</p>
        </div>
      )}

      {reveal && state && versus && (
        <VersusRevealPanel
          key={reveal.round}
          gameId={gameId}
          result={reveal}
          roundCount={state.roundCount}
          versus={versus}
          finished={state.status === "completed"}
          photoUrl={photos[reveal.round]}
          onOpenPhoto={() => setLightbox(reveal.round)}
          onNext={next}
          busy={busy}
          panelRef={panelRef}
        />
      )}

      {reveal && state && !versus && (
        <RevealPanel
          key={reveal.round}
          gameId={gameId}
          result={reveal}
          roundCount={state.roundCount}
          photoUrl={photos[reveal.round]}
          onOpenPhoto={() => setLightbox(reveal.round)}
          onNext={next}
          busy={busy}
          panelRef={panelRef}
        />
      )}

      {summary && state && (
        <SummaryPanel
          state={state}
          photos={photos}
          focus={focus}
          onFocus={setFocus}
          onOpenPhoto={setLightbox}
          onPlayAgain={isVersus ? rematch : playAgain}
          onHome={isVersus ? leave : undefined}
          busy={busy}
        />
      )}

      {notice && (
        <p role="alert" className="absolute left-1/2 top-24 z-50 -translate-x-1/2 animate-pop rounded-xl border-2 border-night bg-alarm px-4 py-2 text-center font-semibold text-night">
          {notice}
        </p>
      )}

      {lightbox !== null && photos[lightbox] && <Lightbox src={photos[lightbox]} onClose={() => setLightbox(null)} />}

      {confirmLeave && (
        <div className="absolute inset-0 z-50 grid animate-fade place-items-center bg-night/75 p-4" onClick={() => setConfirmLeave(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-body" className="panel w-full max-w-sm animate-pop p-6 text-center" onClick={(ev) => ev.stopPropagation()}>
            <h2 id="leave-title" className="display text-4xl">
              Leave this game?
            </h2>
            <p id="leave-body" className="mt-2 text-sky">
              {isVersus
                ? "Your seat is kept. Come back through the room link and you only get 0 for the rounds you missed."
                : "The clock keeps running, and a game you do not finish does not count."}
            </p>
            <div className="mt-5 flex gap-3">
              <button type="button" className="btn btn-gold flex-1" onClick={() => setConfirmLeave(false)} autoFocus>
                Keep playing
              </button>
              <button type="button" className="btn btn-blue" onClick={goHome}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A phone on its side is too short for the photo, the map and the button together. */}
      <div className="turn-upright absolute inset-0 z-[60] place-content-center justify-items-center gap-3 bg-night p-6 text-center">
        <svg viewBox="0 0 48 48" className="h-14 w-14 text-ucla-gold" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="15" y="6" width="18" height="36" rx="4" />
          <path d="M22 36h4" />
        </svg>
        <p className="display text-4xl">Turn your phone upright</p>
        <p className="max-w-xs text-sky">BruinGuessr plays in portrait on a phone. The clock keeps running.</p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // `data-game` switches off page scrolling and pull-to-refresh while the game is up (globals.css).
  return (
    <main data-game className="fixed inset-0 flex overflow-hidden bg-night text-paper">
      {children}
    </main>
  );
}

/** The round's photo, large, over everything. Click anywhere or press Escape to close. */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <button type="button" aria-label="Close the photo" className="fixed inset-0 z-50 animate-fade cursor-zoom-out bg-night/90 p-4 md:p-10" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory blob */}
      <img src={src} alt="The photo from this round" className="h-full w-full object-contain" />
    </button>
  );
}
