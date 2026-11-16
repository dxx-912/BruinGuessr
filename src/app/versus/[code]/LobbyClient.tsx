"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { SeatBadge } from "@/components/versus/SeatBadge";
import Wordmark, { PinMark } from "@/components/Wordmark";
import { api, ApiError } from "@/lib/game/api";
import { useRoomPing } from "@/lib/versus/realtime";
import type { RoomState } from "@/lib/versus/types";

/** Why this player cannot be in the room. */
type Problem = "not_found" | "room_locked" | "room_full" | "failed";

const PROBLEMS: Record<Problem, { title: string; body: string }> = {
  not_found: { title: "Room not found", body: "That code does not match an open room. Check it with whoever sent it, or host a game of your own." },
  room_locked: { title: "This game already started", body: "A room locks once its game begins. Ask for a rematch when they finish, or host a game of your own." },
  room_full: { title: "This room is full", body: "A room holds five players. Host a game of your own and share the code." },
  failed: { title: "Could not reach the room", body: "Check your connection and try again." },
};

/** How often the lobby asks the server where the room stands, on top of the "something changed" pings. */
const POLL_MS = 2000;

const noSubscription = () => () => {};
/** This site's own address, wherever it is running: the room link is built from it. */
const useOrigin = () => useSyncExternalStore(noSubscription, () => window.location.origin, () => "");
const useCanShare = () => useSyncExternalStore(noSubscription, () => typeof navigator.share === "function", () => false);

export default function LobbyClient({ code }: { code: string | null }) {
  const router = useRouter();
  const origin = useOrigin();
  const canShare = useCanShare();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [problem, setProblem] = useState<Problem | null>(code ? null : "not_found");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"start" | "leave" | null>(null);
  const [copied, setCopied] = useState(false);
  const gone = useRef(false);

  const fail = useCallback(
    (err: unknown) => {
      const reason = err instanceof ApiError ? err.code : "server_error";
      const here = `/versus/${code}`;
      if (reason === "unauthorized") router.replace(`/?signin=required&next=${encodeURIComponent(here)}`);
      else if (reason === "no_username") router.replace(`/welcome?next=${encodeURIComponent(here)}`);
      else if (reason === "not_found" || reason === "room_locked" || reason === "room_full") setProblem(reason);
      else setNotice(reason === "network" ? "Connection problem. Check your internet." : "Something went wrong. Trying again…");
    },
    [code, router],
  );

  /** Takes a room state from the server. Answers that arrive out of order are dropped. */
  const apply = useCallback(
    (next: RoomState) => {
      setRoom((current) => (current && next.serverNow < current.serverNow ? current : next));
      setNotice(null);
      // The host pressed Start: everyone goes to the game together. This happens here, on
      // the server's answer, and never from what the page remembers: Next.js keeps this
      // page's state after the player moves on, and a remembered "game in progress" would
      // send them back to a game that is long over.
      if (next.status === "playing" && next.gameId && !gone.current) {
        gone.current = true;
        router.replace(`/game/${next.gameId}`);
      }
    },
    [router],
  );

  // Join on arrival. The same call brings a player back after a disconnect, and into the lobby for a rematch.
  const join = useCallback(async () => {
    if (!code || gone.current) return;
    try {
      apply(await api.joinRoom(code));
    } catch (err) {
      if (!gone.current) fail(err);
    }
  }, [code, apply, fail]);

  const refresh = useCallback(async () => {
    if (!code || gone.current) return;
    try {
      apply(await api.room(code));
    } catch (err) {
      if (gone.current) return;
      // Away from the lobby too long and the seat is given up. Take one again.
      if (err instanceof ApiError && err.code === "not_in_room") await join();
      else fail(err);
    }
  }, [code, apply, fail, join]);

  useEffect(() => {
    if (!code || problem) return;
    let stopped = false;
    let timer = 0;
    // Join first, then keep asking.
    const tick = async (first: boolean) => {
      await (first ? join() : refresh());
      if (!stopped) timer = window.setTimeout(() => tick(false), POLL_MS);
    };
    timer = window.setTimeout(() => tick(true), 0);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [code, problem, join, refresh]);

  useRoomPing(problem ? null : room?.channel, refresh);

  // When the player comes back to this page (for a rematch, or with the Back button), what
  // it remembers is out of date. Forget it on the way out and join afresh on the way back in.
  useLayoutEffect(() => {
    return () => {
      gone.current = false;
      setRoom(null);
      setBusy(null);
      setNotice(null);
      setProblem(code ? null : "not_found");
    };
  }, [code]);

  const gameId = room?.status === "playing" ? room.gameId : null;

  const start = async () => {
    if (!code) return;
    setBusy("start");
    try {
      apply(await api.startRoom(code));
    } catch (err) {
      setBusy(null);
      if (err instanceof ApiError && (err.code === "not_host" || err.code === "need_players" || err.code === "not_in_room")) void refresh();
      else fail(err);
    }
  };

  const leave = async () => {
    setBusy("leave");
    gone.current = true;
    if (code && room) await api.leaveRoom(code).catch(() => {});
    router.push("/versus");
  };

  const link = code && origin ? `${origin}/versus/${code}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice("Could not copy. Select the link and copy it by hand.");
    }
  };
  const share = () => void navigator.share({ title: "BruinGuessr versus", text: `Join my BruinGuessr room: ${code}`, url: link }).catch(() => {});

  if (problem) {
    return (
      <Shell>
        <div className="panel m-auto max-w-md animate-pop p-7 text-center">
          <h1 className="display text-4xl">{PROBLEMS[problem].title}</h1>
          <p className="mt-3 text-sky">{PROBLEMS[problem].body}</p>
          <div className="mt-6 flex justify-center gap-3">
            {problem === "failed" ? (
              <button type="button" className="btn btn-gold" onClick={() => window.location.reload()}>
                Try again
              </button>
            ) : (
              <Link href="/versus" className="btn btn-gold">
                Host or join
              </Link>
            )}
            <Link href="/" className="btn btn-blue">
              Home
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  if (!room || !code || gameId) {
    return (
      <Shell>
        <p className="display m-auto animate-pulse text-3xl text-sky">{gameId ? "Starting the game…" : "Joining the room…"}</p>
        {notice && <Notice text={notice} />}
      </Shell>
    );
  }

  const host = room.members.find((m) => m.isHost);
  const ready = room.members.filter((m) => m.ready);
  const rematch = room.gamesPlayed > 0;
  const seats = Array.from({ length: room.maxPlayers }, (_, i) => room.members.find((m) => m.seat === i + 1) ?? null);
  const short = Math.max(0, room.minPlayers - ready.length);

  return (
    <Shell>
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-5">
        <span className="flex items-center gap-2">
          <PinMark className="h-8 w-auto" />
          <Wordmark className="text-3xl" />
        </span>
        <button type="button" className="btn-quiet" onClick={leave} disabled={busy !== null}>
          {busy === "leave" ? "Leaving…" : "Leave room"}
        </button>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-5 pb-10 pt-8">
        <p className="font-semibold text-sky">{rematch ? "Rematch lobby" : "Versus lobby"}</p>
        <h1 className="display mt-1 text-5xl sm:text-6xl">Room code</h1>
        <p aria-label={`Room code ${code.split("").join(" ")}`} className="mt-4 flex gap-2 sm:gap-3">
          {code.split("").map((letter, i) => (
            <span key={i} aria-hidden className="display grid h-20 w-full max-w-24 place-items-center rounded-[14px] border-2 border-navy-line bg-navy text-6xl text-ucla-gold shadow-[0_5px_0_#04101d] sm:h-28 sm:text-8xl">
              {letter}
            </span>
          ))}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 basis-56 truncate rounded-[14px] border-2 border-navy-line bg-navy px-4 py-3 font-semibold text-sky" title={link}>
            {link.replace(/^https?:\/\//, "") || "…"}
          </p>
          <button type="button" className="btn btn-blue" onClick={copy} disabled={!link}>
            {copied ? "Copied" : "Copy link"}
          </button>
          {canShare && (
            <button type="button" className="btn btn-blue" onClick={share} disabled={!link}>
              Share
            </button>
          )}
        </div>

        <h2 className="display mt-9 text-3xl">
          Players{" "}
          <span className="numeric text-sky">
            {room.members.length}/{room.maxPlayers}
          </span>
        </h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {seats.map((member, i) =>
            member ? (
              <li key={member.seat} className={`flex animate-pop items-center gap-3 rounded-2xl border-2 border-navy-line bg-navy px-3 py-2.5 ${member.away || !member.ready ? "opacity-60" : ""}`}>
                <SeatBadge seat={member.seat} name={member.username} className="h-10 w-10 text-2xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold leading-tight">
                    {member.username}
                    {member.isYou && <span className="ml-1 font-medium text-sky">(you)</span>}
                  </span>
                  {(member.away || !member.ready) && <span className="block text-sm text-sky">{member.away ? "Away" : "Still looking at the results"}</span>}
                </span>
                {member.isHost && <span className="display rounded-full bg-ucla-gold px-2.5 py-0.5 text-base text-night">Host</span>}
              </li>
            ) : (
              <li key={`open-${i}`} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-navy-line px-3 py-2.5 text-sky">
                <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-dashed border-navy-line" aria-hidden>
                  {i + 1}
                </span>
                Open seat
              </li>
            ),
          )}
        </ol>

        {/* On a phone the seats can push this below the screen, so it stays pinned to the bottom. */}
        <div className="sticky bottom-0 -mx-5 mt-6 bg-night px-5 pb-3 pt-3 sm:static sm:mx-0 sm:mt-8 sm:bg-transparent sm:p-0">
          {room.isHost ? (
            <>
              <button type="button" className="btn btn-gold w-full !py-4 !text-3xl" onClick={start} disabled={!room.canStart || busy !== null}>
                {busy === "start" ? "Starting…" : "Start game"}
              </button>
              <p className="mt-3 text-center font-semibold text-sky">
                {short > 0
                  ? `You need ${short} more ${short === 1 ? "player" : "players"}. Share the code or the link.`
                  : `${ready.length} players are in. Start whenever everyone is here.`}
              </p>
            </>
          ) : (
            <p className="rounded-[14px] border-2 border-navy-line bg-navy px-4 py-4 text-center text-lg font-semibold">
              Waiting for <span className="text-ucla-gold">{host?.username ?? "the host"}</span> to start the game…
            </p>
          )}
        </div>
      </section>
      {notice && <Notice text={notice} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="relative flex flex-1 flex-col bg-night text-paper">{children}</main>;
}

function Notice({ text }: { text: string }) {
  return (
    <p role="alert" className="fixed left-1/2 top-4 z-50 -translate-x-1/2 animate-pop rounded-xl border-2 border-night bg-alarm px-4 py-2 text-center font-semibold text-night">
      {text}
    </p>
  );
}
