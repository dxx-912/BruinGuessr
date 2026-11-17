"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { CrownIcon, SwordsIcon } from "@/components/art/icons";
import { api, ApiError } from "@/lib/game/api";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@/lib/versus/types";

/** Host a room, or join one with its code. */
export default function VersusHome({ rejoinCode }: { rejoinCode: string | null }) {
  const router = useRouter();
  const [hosting, setHosting] = useState(false);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  // Next.js keeps this page's state while the player is in the room. Coming back with the
  // Back button, the button must be ready again, not still saying "Making your room…".
  useLayoutEffect(() => () => setHosting(false), []);

  const host = async () => {
    setHosting(true);
    setProblem(null);
    try {
      const room = await api.createRoom();
      router.push(`/versus/${room.code}`);
    } catch (err) {
      setHosting(false);
      if (err instanceof ApiError && err.code === "unauthorized") router.replace(`/login?reason=versus&next=${encodeURIComponent("/versus")}`);
      else if (err instanceof ApiError && err.code === "no_username") router.push(`/welcome?next=${encodeURIComponent("/versus")}`);
      else setProblem(err instanceof ApiError && err.code === "network" ? "No connection. Check your internet and try again." : "The room could not be made. Try again in a moment.");
    }
  };

  const code = normalizeRoomCode(typed);
  const join = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (code) router.push(`/versus/${code}`);
  };

  return (
    <div className="mt-8">
      {rejoinCode && (
        <div className="panel mb-5 flex animate-rise flex-wrap items-center justify-between gap-3 !border-ucla-gold p-4">
          <p className="font-semibold">
            Your game in room <span className="display text-2xl tracking-wider text-ucla-gold">{rejoinCode}</span> is still going.
          </p>
          <Link href={`/versus/${rejoinCode}`} className="btn btn-gold">
            Rejoin
          </Link>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <section className="panel flex flex-col p-6">
          <h2 className="heading flex items-center gap-3 text-4xl">
            <span className="chip bg-ucla-gold !text-night">
              <CrownIcon />
            </span>
            Host a game
          </h2>
          <p className="mt-3 flex-1 text-sky">You get a room code and a link to share. Start once at least one friend is in.</p>
          <button type="button" className="btn btn-gold mt-5 w-full !py-4 !text-3xl" onClick={host} disabled={hosting}>
            {hosting ? "Making your room…" : "Create a room"}
          </button>
        </section>

        <form className="panel flex flex-col p-6" onSubmit={join}>
          <h2 className="heading flex items-center gap-3 text-4xl">
            <span className="chip bg-ucla-blue">
              <SwordsIcon />
            </span>
            Join a game
          </h2>
          <label htmlFor="room-code" className="mt-3 flex-1 text-sky">
            Got a code from a friend? Type its {ROOM_CODE_LENGTH} letters.
          </label>
          <div className="mt-5 flex items-start gap-3">
            <input
              id="room-code"
              value={typed}
              onChange={(ev) => setTyped(ev.target.value.replace(/[^A-Za-z]/g, "").slice(0, ROOM_CODE_LENGTH).toUpperCase())}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="CODE"
              aria-invalid={typed.length === ROOM_CODE_LENGTH && !code}
              className="display numeric h-[3.6rem] min-w-0 flex-1 rounded-[14px] border-2 border-navy-line bg-night px-4 text-center text-4xl tracking-[0.2em] text-ucla-gold placeholder:text-navy-line focus:border-ucla-gold focus:outline-none"
            />
            <button type="submit" className="btn btn-blue !py-4 !text-3xl" disabled={!code}>
              Join
            </button>
          </div>
          {typed.length === ROOM_CODE_LENGTH && !code && (
            <p role="alert" className="mt-3 text-sm font-semibold text-alarm">
              Room codes have no vowels. Check the code and try again.
            </p>
          )}
        </form>
      </div>

      {problem && (
        <p role="alert" className="mt-4 font-semibold text-alarm">
          {problem}
        </p>
      )}
    </div>
  );
}
