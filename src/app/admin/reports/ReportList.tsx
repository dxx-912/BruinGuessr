"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ReportRow = {
  id: string;
  lat: number;
  lng: number;
  hidden: boolean;
  status: string;
  reportCount: number;
  latest: string | null;
  reasons: string[];
};

export default function ReportList({ rows }: { rows: ReportRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const decide = async (id: string, action: "keep" | "remove") => {
    if (busy) return;
    setBusy(id);
    setError(false);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  if (!rows.length) {
    return (
      <div className="grid place-items-center p-12 text-center">
        <div>
          <p className="heading text-3xl">Nothing reported</p>
          <p className="mt-2 text-sky">Photos players report show up here. Three reports hide a photo until you decide.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-[12px] bg-alarm px-3 py-2 text-sm font-semibold text-night">That did not save. Try again.</p>}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="grid gap-4 rounded-[12px] border-2 border-navy-line bg-navy p-3 sm:grid-cols-[16rem_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/admin/images/${r.id}/photo`} alt="Reported photo" loading="lazy" className="aspect-[4/3] w-full rounded-md bg-night object-cover" />
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.hidden ? "bg-alarm text-night" : "bg-paper text-night"}`}>{r.status}</span>
                <span className="ml-2 text-sky">
                  {r.reportCount} report{r.reportCount === 1 ? "" : "s"}
                  {r.latest ? ` · latest ${new Date(r.latest).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </span>
              </p>
              <ul className="text-sm">
                {r.reasons.length ? r.reasons.map((x) => <li key={x}>{x}</li>) : <li className="text-sky">No reasons on file.</li>}
              </ul>
              <a className="text-sm text-sky underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}>
                Where it is (map)
              </a>
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <button type="button" className="btn btn-gold" disabled={busy === r.id} onClick={() => void decide(r.id, "keep")}>
                  Keep (clear reports)
                </button>
                <button type="button" className="btn-quiet" disabled={busy === r.id || r.status === "Removed"} onClick={() => void decide(r.id, "remove")}>
                  Remove for good
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
