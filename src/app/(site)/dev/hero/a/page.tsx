import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HeroA from "@/components/home/hero/HeroA";

export const metadata: Metadata = { title: "Hero A (dev)" };

/** Play page hero, variant A, inside the real site layout. Development only; compared on /dev/hero. */
export default function HeroVariantAPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <HeroA />;
}
