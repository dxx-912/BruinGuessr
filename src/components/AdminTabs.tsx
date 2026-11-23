import Link from "next/link";

const TABS = [
  { href: "/admin/contributions", label: "Contributions", id: "contributions" },
  { href: "/admin/stats", label: "Stats", id: "stats" },
] as const;

/** The admin dashboard's tabs. */
export default function AdminTabs({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <nav aria-label="Admin" className="flex gap-1 border-b-2 border-navy-line bg-navy px-4">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === active ? "page" : undefined}
          className={`-mb-0.5 border-b-2 px-3 py-2 text-sm font-semibold ${t.id === active ? "border-ucla-gold text-paper" : "border-transparent text-sky hover:text-paper"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
