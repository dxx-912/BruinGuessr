import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HeroB2 from "@/components/home/hero/HeroB2";

export const metadata: Metadata = { title: "Hero B2 (dev)" };

/** Play page hero, variant B2, inside the real site layout. Development only; compared on /dev/hero. */
export default function HeroVariantB2Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <HeroB2 />;
}
