"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/game/api";

/** Starts a solo game and goes to it. */
export default function PlayButton() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    setProblem(null);
    try {
      const game = await api.newGame();
      router.push(`/game/${game.id}`);
    } catch (err) {
      setStarting(false);
      if (err instanceof ApiError && err.code === "unauthorized") router.replace("/?signin=required");
      else setProblem(err instanceof ApiError && err.code === "network" ? "No connection. Check your internet and try again." : "The game could not start. Try again in a moment.");
    }
  };

  return (
    <div>
      <button type="button" className="btn btn-gold w-full !px-8 !py-4 !text-3xl sm:w-auto" onClick={start} disabled={starting}>
        {starting ? "Starting…" : "Play solo"}
      </button>
      {problem && (
        <p role="alert" className="mt-3 font-semibold text-alarm">
          {problem}
        </p>
      )}
    </div>
  );
}
