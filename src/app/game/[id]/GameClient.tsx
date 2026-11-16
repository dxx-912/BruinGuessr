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

export default function GameClient({ gameId }: { gameId: string }) {
  const router = useRouter();
  const desktop = useMedia("(min-width: 768px)");
  const wide = useMedia("(min-width: 1024px)");

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
    // savedPin and savedLock are read once when the round opens; later saves must not restart the round.
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
    // A versus reveal also holds the scoreboard, one row per player.
    if (playerCount) return wide ? { top: 60, bottom: 180 + 34 * playerCount } : { top: 50, bottom: 300 + 34 * playerCount };
    return desktop ? { top: 60, bottom: 230 } : { top: 50, bottom: 330 };
  }, [revealOnMap, desktop, wide, playerCount]);

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
    ? "absolute inset-x-0 top-0 h-[40%] md:inset-y-0 md:left-0 md:right-[28rem] md:h-auto"
    : reveal
      ? "absolute inset-0"
      : `absolute inset-x-0 bottom-0 flex h-1/2 flex-col gap-2 bg-night p-2 md:inset-auto md:bottom-4 md:right-4 md:bg-transparent md:p-0 md:transition-[width,height] md:duration-150 ${
          mapOpen ? "md:h-[min(64vh,640px)] md:w-[min(58vw,860px)]" : "md:h-[300px] md:w-[400px]"
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
  const homeMark = (
    <>
      {/* On a phone the timer needs the middle of the bar, so only the pin shows. */}
      <PinMark className="ml-0.5 h-7 w-auto sm:hidden" />
      <span className="hidden sm:inline">
        <Wordmark className="text-2xl" />
      </span>
    </>
  );

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
              {guessLabel}
            </button>
          )}
        </div>
      )}

      {/* Top bar */}
      {!summary && (
        <header className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2">
          <div className="panel pointer-events-auto flex items-center gap-1 !rounded-2xl py-1.5 pl-3 pr-1.5">
            {isVersus ? (
              // Leaving a versus game tells the room, so nobody waits for this player.
              <button type="button" className="cursor-pointer" onClick={leave} aria-label="Leave the game and go home" title="Leave the game">
                {homeMark}
              </button>
            ) : (
              <Link href="/" aria-label="Leave the game and go home" title="Leave the game">
                {homeMark}
              </Link>
            )}
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
          <Timer key={round.number} startsAt={round.startsAt} deadlineAt={round.deadlineAt} running={stage === "play" || stage === "intro" || stage === "locked"} />
        </div>
      )}

      {/* Versus: who is playing, and who has guessed */}
      {guessing && versus && (
        <div className="pointer-events-none absolute left-3 top-[4.4rem] z-30">
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
            <p className="display animate-pulse text-3xl text-sky">Setting up your game…</p>
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
