"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ArrowIcon } from "@/components/art/icons";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@/lib/versus/types";

/**
 * A room code field and a Join button that goes straight to the room. The
 * room page does the rest: it asks a signed-out visitor to sign in first and
 * says "Room not found" for a code that is not live.
 * - `side`: the side bar's box (navy, gold letters).
 * - `tile`: inside the blue Versus tile (night field, paper button).
 */
export default function JoinCodeForm({ variant, label }: { variant: "side" | "tile"; label: string }) {
  const router = useRouter();
  const id = useId();
  const [typed, setTyped] = useState("");
  const code = normalizeRoomCode(typed);
  const wrong = typed.length === ROOM_CODE_LENGTH && !code;

  const join = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (code) router.push(`/versus/${code}`);
  };

  const side = variant === "side";
  return (
    <form onSubmit={join} className="relative">
      <label htmlFor={id} className={side ? "heading block text-lg" : "block text-sm font-semibold text-paper"}>
        {label}
      </label>
      <div className={`flex gap-2 ${side ? "mt-2" : "mt-1.5"}`}>
        <input
          id={id}
          value={typed}
          onChange={(ev) => setTyped(ev.target.value.replace(/[^A-Za-z]/g, "").slice(0, ROOM_CODE_LENGTH).toUpperCase())}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH}
          placeholder="CODE"
          aria-invalid={wrong}
          aria-describedby={wrong ? `${id}-wrong` : undefined}
          className={`display numeric min-w-0 flex-1 rounded-[12px] border-2 bg-night text-center tracking-[0.18em] text-ucla-gold placeholder:text-[#3d6286] focus:border-ucla-gold focus:outline-none ${
            side ? "h-11 border-navy-line text-2xl" : "h-12 border-night/40 text-[1.7rem] shadow-[inset_0_2px_6px_rgb(0_0_0/0.35)]"
          }`}
        />
        <button
          type="submit"
          disabled={!code}
          aria-label="Join room"
          className={`grid shrink-0 place-items-center rounded-full transition-[transform,opacity] hover:translate-x-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-x-0 ${
            side ? "h-11 w-11 bg-ucla-gold text-night" : "h-12 w-12 bg-paper text-ucla-blue"
          }`}
        >
          <ArrowIcon className="h-5 w-5" />
        </button>
      </div>
      {wrong && (
        <p id={`${id}-wrong`} role="alert" className={`mt-1.5 text-sm font-semibold ${side ? "text-alarm" : "text-paper"}`}>
          Room codes have no vowels.
        </p>
      )}
    </form>
  );
}
