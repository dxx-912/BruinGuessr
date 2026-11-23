"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REMOVAL_REASON_MAX } from "@/lib/leaderboard";

/** Admin only (the page never renders it for anyone else, and the API checks again). */
export default function LeaderboardRemovalPanel({ username, removal }: { username: string; removal: { reason: string } | null }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const send = async (body: { action: "remove"; reason: string } | { action: "restore" }) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/admin/leaderboard/${encodeURIComponent(username)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      setReason("");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel mt-3 p-4">
      <p className="heading text-2xl">Admin: leaderboard</p>
      {removal ? (
        <>
          <p className="mt-1 text-sm text-sky">Removed. {username} sees: &ldquo;{removal.reason}&rdquo;</p>
          <button type="button" className="btn btn-gold mt-3" disabled={busy} onClick={() => void send({ action: "restore" })}>
            Put back on the leaderboard
          </button>
        </>
      ) : (
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) void send({ action: "remove", reason: reason.trim() });
          }}
        >
          <label htmlFor="removal-reason" className="text-sm font-semibold text-sky">
            Why? {username} will see this when they sign in.
          </label>
          <textarea
            id="removal-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REMOVAL_REASON_MAX}
            rows={2}
            required
            className="mt-1 w-full rounded-[12px] border-2 border-navy-line bg-night px-3 py-2"
          />
          <button type="submit" className="btn-quiet mt-2" disabled={busy || !reason.trim()}>
            Remove from leaderboard
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-[12px] bg-alarm px-3 py-2 text-sm font-semibold text-night">
          That did not save. Try again.
        </p>
      )}
    </div>
  );
}
