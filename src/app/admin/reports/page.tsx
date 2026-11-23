import type { Metadata } from "next";
import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import { adminOr404 } from "@/lib/server/admin";
import { REPORT_REASONS, reportedPhotos } from "@/lib/server/reports";
import ReportList from "./ReportList";

export const metadata: Metadata = { title: "Reported photos", robots: { index: false, follow: false } };
export const instant = false;

export default async function ReportsPage() {
  const admin = await adminOr404();
  const photos = await reportedPhotos();
  const rows = photos.map((p) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    hidden: p.hidden,
    status: !p.hidden ? "In rotation" : p.hiddenReason === "removed after review" ? "Removed" : p.hiddenReason === "reported by players" ? "Hidden (reported)" : `Hidden (${p.hiddenReason ?? "other"})`,
    reportCount: p.reportCount,
    latest: p.latest,
    reasons: p.reasons.map((r) => `${r.n} × ${REPORT_REASONS[r.reason] ?? r.reason}`),
  }));
  return (
    <div className="flex min-h-dvh flex-col bg-night text-paper">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-navy-line bg-navy px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky">BruinGuessr · admin</p>
          <h1 className="heading text-2xl">
            Reported photos <span className="numeric text-sky">· {rows.length}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-sky">
          <span>Signed in as {admin.username ?? "admin"}</span>
          <Link href="/" className="btn-quiet">Site</Link>
        </div>
      </header>
      <AdminTabs active="reports" />
      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        <ReportList rows={rows} />
      </main>
    </div>
  );
}
