import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HeroC from "@/components/home/hero/HeroC";

export const metadata: Metadata = { title: "Hero C (dev)" };

/** Play page hero, variant C, inside the real site layout. Development only; compared on /dev/hero. */
export default function HeroVariantCPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <HeroC />;
}
