import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HeroB from "@/components/home/hero/HeroB";

export const metadata: Metadata = { title: "Hero B (dev)" };

/** Play page hero, variant B, inside the real site layout. Development only; compared on /dev/hero. */
export default function HeroVariantBPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <HeroB />;
}
