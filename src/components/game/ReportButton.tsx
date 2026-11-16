"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/game/api";
import { REPORT_REASONS, type ReportReason } from "@/lib/game/types";

type Props = { gameId: string; round: number; alreadyReported: boolean };

type Status = "idle" | "sending" | "done" | "cap" | "failed";

/** "Report photo" on the reveal screen: pick what is wrong, and it is sent for review. */
export default function ReportButton({ gameId, round, alreadyReported }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(alreadyReported ? "done" : "idle");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (ev: Event) => {
      if (ev instanceof KeyboardEvent ? ev.key === "Escape" : !root.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const send = async (reason: ReportReason) => {
    setOpen(false);
    setStatus("sending");
    try {
      await api.report(gameId, round, reason);
      setStatus("done");
    } catch (err) {
      setStatus(err instanceof ApiError && err.code === "daily_cap" ? "cap" : "failed");
    }
  };

  if (status === "done") return <p className="text-sm font-semibold text-sky">Reported. Thanks, we will take a look.</p>;
  if (status === "cap") return <p className="text-sm font-semibold text-sky">You have reached today&apos;s limit for reports.</p>;

  return (
    <div ref={root} className="relative">
      <button type="button" className="btn-quiet" aria-expanded={open} disabled={status === "sending"} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
          <path d="M3 1.500v13M3 2.500h9l-2.200 3 2.200 3H3" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {status === "sending" ? "Sending…" : status === "failed" ? "Could not send. Try again" : "Report photo"}
      </button>
      {open && (
        <div role="menu" className="panel absolute bottom-full right-0 z-10 mb-2 w-72 animate-pop !rounded-2xl p-2">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold text-sky">What is wrong with this photo?</p>
          {REPORT_REASONS.map((reason) => (
            <button key={reason.id} type="button" role="menuitem" className="block w-full cursor-pointer rounded-lg px-2 py-2 text-left text-sm font-semibold hover:bg-navy-line" onClick={() => send(reason.id)}>
              {reason.label}
            </button>
          ))}
          <button type="button" role="menuitem" className="block w-full cursor-pointer rounded-lg px-2 py-2 text-left text-sm font-semibold hover:bg-navy-line" onClick={() => send("other")}>
            Something else
          </button>
        </div>
      )}
    </div>
  );
}
