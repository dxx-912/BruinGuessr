import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PhotoReview from "./PhotoReview";

export const metadata: Metadata = { title: "Photo review (dev)" };

/**
 * Review tool for the photo pool: approve or reject photos and drag pins to fix
 * locations before anything goes live. Development only, because it shows every
 * photo's location.
 */
export default function PhotosPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PhotoReview />;
}
