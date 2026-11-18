import { CampusBackdrop } from "@/components/art/CampusScene";

/**
 * The shared frame for the Privacy and Terms pages: the dimmed campus
 * backdrop, a display title with its second half in gold, the date it took
 * effect, then one panel holding the sections.
 */
export function LegalPage({ title, gold, updated, intro, children }: { title: string; gold: string; updated: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <CampusBackdrop />
      <h1 className="display text-[clamp(3rem,10vw,5.5rem)]">
        {title}
        <span className="text-ucla-gold">{gold}</span>
      </h1>
      <p className="mt-2 text-sm font-semibold text-sky">Last updated {updated}</p>
      <div className="mt-4 max-w-2xl text-lg text-sky">{intro}</div>
      <div className="panel mt-8 space-y-8 px-5 py-6 sm:px-8 sm:py-8">{children}</div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="heading text-3xl">{title}</h2>
      <div className="mt-2 space-y-3 leading-relaxed text-[#c4d9f0] [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-paper [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

export const legalLink = "font-semibold text-paper underline decoration-sky/60 decoration-2 underline-offset-4 hover:decoration-ucla-gold";
