import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HeroCompare from "./HeroCompare";

export const metadata: Metadata = { title: "Hero variants (dev)" };

/**
 * Three Play page heroes side by side, each in a frame showing the real page at
 * desktop or phone size. Development only. The variants themselves live at
 * /dev/hero/a, /b and /c.
 */
export default function HeroComparePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <HeroCompare />;
}
