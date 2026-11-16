"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import GameMap, { type MapView } from "@/components/game/GameMap";
import PhotoViewer from "@/components/game/PhotoViewer";
import RevealPanel from "@/components/game/RevealPanel";
import RoundTracker from "@/components/game/RoundTracker";
import SummaryPanel from "@/components/game/SummaryPanel";
import Timer from "@/components/game/Timer";
import Wordmark, { PinMark } from "@/components/Wordmark";
import { api, ApiError, serverClock } from "@/lib/game/api";
import { sound } from "@/lib/game/sound";
import { phaseOf, type GameState, type LatLng } from "@/lib/game/types";

/**
 * Where a round stands on this screen:
 *   intro    the "Round 3" card is up and the photo is loading behind it
 *   play     the clock is running and the map takes pins
 *   locking  the player pressed Guess and the server is scoring it
 *   timeup   the clock hit zero; waiting for the server to score the round
 */
type Stage = "intro" | "play" | "locking" | "timeup";

const DESKTOP = "(min-width: 768px)";
const subscribeDesktop = (onChange: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useDesktop = () => useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => true);

export default function GameClient({ gameId }: { gameId: string }) {
  const router = useRouter();
  const desktop = useDesktop();

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

  const pinSaves = useRef<Promise<unknown>>(Promise.resolve());
  const photoUrls = useRef<string[]>([]);
  const collapseTimer = useRef(0);

  const phase = state ? phaseOf(state) : "loading";
  const round = state?.round ?? null;
  const roundNumber = round?.number ?? null;

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

  const refresh = useCallback(async () => {
    try {
      const next = await api.state(gameId);
      setState(next);
      setNotice(null);
      return next;
    } catch (err) {
      handleError(err);
      return null;
    }
  }, [gameId, handleError]);

  // Load the game. A game that is already over opens on its summary.
  useEffect(() => {
    let cancelled = false;
    api
      .state(gameId)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded.status === "completed") setShowSummary(true);
        setState(loaded);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.code === "unauthorized" || err.code === "not_found")) handleError(err);
        else setFatal("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, handleError]);

  // Read the saved sound setting once the page is live in the browser.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMuted(sound.isMuted()));
    return () => cancelAnimationFrame(id);
  }, []);

  // Free the photo copies when leaving the game.
  useEffect(() => {
    const urls = photoUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const startNextRound = useCallback(async () => {
    setBusy(true);
    try {
      setState(await api.startRound(gameId));
      setNotice(null);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }, [gameId, handleError]);

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
      setStage(now < startsAt ? "intro" : "play");
    });
    if (now < startsAt) {
      after(startsAt - now, () => {
        setStage("play");
        sound.roundStart();
      });
    }
    after(deadlineAt - now, () => {
      setStage((current) => {
        if (current === "locking") return current;
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
        if (next && !next.round) return;
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    });

    api
      .photo(gameId, roundNumber)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        photoUrls.current.push(url);
        setPhotos((current) => ({ ...current, [roundNumber]: url }));
      })
      .catch(() => {
        // The round ended before the photo arrived, or the connection dropped. The
        // clock still decides when the round is over, so there is nothing to do here.
      });

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
    // savedPin is read once when the round opens; later saves must not restart the round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, roundNumber, startsAt, deadlineAt, graceMs, refresh]);

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
      setState(await api.guess(gameId, roundNumber, pin));
      setNotice(null);
    } catch (err) {
      handleError(err);
      setStage((current) => (current === "locking" ? "play" : current));
    }
  }, [gameId, roundNumber, stage, pin, handleError]);

  const next = useCallback(() => {
    if (!state || busy) return;
    if (state.status === "completed") setShowSummary(true);
    else void startNextRound();
  }, [state, busy, startNextRound]);

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
    if (phase !== "guessing" || stage !== "play" || !pin) return;
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if ((ev.key === " " || ev.key === "Enter") && !target?.closest("button, a, input")) {
        ev.preventDefault();
        void guess();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, stage, pin, guess]);

  // ---- What to draw -------------------------------------------------------------------
  const reveal = state && !round && !showSummary && state.currentRound > 0 ? (state.results.find((r) => r.round === state.currentRound) ?? null) : null;
  const summary = state !== null && showSummary && state.status === "completed";
  const guessing = phase === "guessing" && round !== null;

  const mapView = useMemo<MapView>(() => {
    if (summary && state) return { kind: "summary", results: state.results, focus };
    if (reveal) return { kind: "reveal", result: reveal };
    return { kind: "guess", pin, canPlace: guessing && stage === "play" };
  }, [summary, state, focus, reveal, pin, guessing, stage]);

  const mapInset = useMemo(() => {
    if (reveal) return desktop ? { top: 60, bottom: 230 } : { top: 50, bottom: 330 };
    return undefined;
  }, [reveal, desktop]);

  if (fatal || phase === "abandoned") {
    const abandoned = phase === "abandoned";
    return (
      <Shell>
        <div className="panel m-auto max-w-md animate-pop p-7 text-center">
          <h1 className="display text-4xl">{abandoned ? "This game is over" : fatal === "not_found" ? "Game not found" : "Could not load the game"}</h1>
          <p className="mt-3 text-sky">
            {abandoned
              ? "You started another game, which ended this one. Only finished games count."
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
              <button type="button" className="btn btn-gold" onClick={playAgain} disabled={busy}>
                {busy ? "Starting…" : "New game"}
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
    ? "absolute inset-x-0 top-0 h-[40%] md:inset-y-0 md:left-0 md:right-[28rem] md:h-auto"
    : reveal
      ? "absolute inset-0"
      : `absolute inset-x-0 bottom-0 flex h-1/2 flex-col gap-2 bg-night p-2 md:inset-auto md:bottom-4 md:right-4 md:bg-transparent md:p-0 md:transition-[width,height] md:duration-150 ${
          mapOpen ? "md:h-[min(64vh,640px)] md:w-[min(58vw,860px)]" : "md:h-[300px] md:w-[400px]"
        }`;
  const photoUrl = roundNumber !== null ? photos[roundNumber] : undefined;
  const canGuess = stage === "play" && pin !== null;

  return (
    <Shell>
      {/* The photo. Under everything else; only mounted while it is the thing to look at. */}
      {guessing && (
        <div className="absolute inset-x-0 top-0 h-1/2 md:inset-0 md:h-auto">
          <PhotoViewer key={roundNumber} src={photoUrl ?? null} alt={`Round ${roundNumber}: a photo taken somewhere on campus`} />
        </div>
      )}

      {/* The map. One instance for the whole game; only its box changes. */}
      {state && (
        <div
          className={`z-20 ${dock}`}
          onMouseEnter={() => {
            window.clearTimeout(collapseTimer.current);
            if (guessing) setMapOpen(true);
          }}
          // The pointer may already be resting here when a round starts, so moving it counts too.
          onMouseMove={() => {
            if (guessing && !mapOpen) {
              window.clearTimeout(collapseTimer.current);
              setMapOpen(true);
            }
          }}
          onMouseLeave={() => {
            collapseTimer.current = window.setTimeout(() => setMapOpen(false), 450);
          }}
        >
          <div className={`min-h-0 flex-1 overflow-hidden ${guessing || phase === "ready" ? "rounded-2xl border-2 border-navy-line shadow-[0_10px_28px_rgb(2_10_20/0.5)]" : "h-full"}`}>
            <GameMap view={mapView} onPin={placePin} inset={mapInset} />
          </div>
          {guessing && (
            <button type="button" className="btn btn-gold w-full" disabled={!canGuess} onClick={guess}>
              {stage === "locking" ? "Locking in…" : stage === "timeup" ? "Time's up" : pin ? "Guess" : "Place your pin on the map"}
            </button>
          )}
        </div>
      )}

      {/* Top bar */}
      {!summary && (
        <header className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2">
          <div className="panel pointer-events-auto flex items-center gap-1 !rounded-2xl py-1.5 pl-3 pr-1.5">
            <Link href="/" aria-label="Leave the game and go home" title="Leave the game">
              {/* On a phone the timer needs the middle of the bar, so only the pin shows. */}
              <PinMark className="ml-0.5 h-7 w-auto sm:hidden" />
              <span className="hidden sm:inline">
                <Wordmark className="text-2xl" />
              </span>
            </Link>
            <button
              type="button"
              aria-pressed={muted}
              aria-label={muted ? "Turn sound on" : "Turn sound off"}
              title={muted ? "Sound is off" : "Sound is on"}
              className="ml-1 grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-sky hover:bg-navy-line hover:text-paper"
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
          <Timer key={round.number} startsAt={round.startsAt} deadlineAt={round.deadlineAt} running={stage === "play" || stage === "intro"} />
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
            </div>
          ) : (
            <p className="display animate-pulse text-3xl text-sky">Setting up your game…</p>
          )}
        </div>
      )}

      {guessing && stage === "timeup" && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-night/60">
          <p className="display animate-stamp rounded-2xl border-4 border-night bg-alarm px-8 py-3 text-6xl text-night shadow-[0_6px_0_#06182B]">Time&apos;s up</p>
        </div>
      )}

      {reveal && state && (
        <RevealPanel
          key={reveal.round}
          gameId={gameId}
          result={reveal}
          roundCount={state.roundCount}
          photoUrl={photos[reveal.round]}
          onOpenPhoto={() => setLightbox(reveal.round)}
          onNext={next}
          busy={busy}
        />
      )}

      {summary && state && (
        <SummaryPanel state={state} photos={photos} focus={focus} onFocus={setFocus} onOpenPhoto={setLightbox} onPlayAgain={playAgain} busy={busy} />
      )}

      {notice && (
        <p role="alert" className="absolute left-1/2 top-24 z-50 -translate-x-1/2 animate-pop rounded-xl border-2 border-night bg-alarm px-4 py-2 text-center font-semibold text-night">
          {notice}
        </p>
      )}

      {lightbox !== null && photos[lightbox] && <Lightbox src={photos[lightbox]} onClose={() => setLightbox(null)} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="fixed inset-0 flex overflow-hidden bg-night text-paper">{children}</main>;
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
