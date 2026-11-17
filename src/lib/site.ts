import type { Metadata } from "next";

export const SITE_NAME = "BruinGuessr";
export const SITE_TITLE = "BruinGuessr: the UCLA campus guessing game";
export const SITE_DESCRIPTION =
  "A photo from somewhere on UCLA's campus, 30 seconds, one pin on the map. Play solo or race your friends.";

/**
 * The address the site is published at, used for the links inside link
 * previews (which must be complete addresses). On Vercel it comes from the
 * project's production domain, so there is nothing to configure;
 * `NEXT_PUBLIC_SITE_URL` overrides it if the site moves to its own domain.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

type PageInfo = {
  /** The browser tab title, without the site name (the layout adds it). */
  title: string;
  /** The headline of the link preview. Defaults to the title plus the site name. */
  shareTitle?: string;
  description: string;
  /** This page's own path, for the preview's link. */
  path: string;
  /** False for pages that belong to one player or one room. */
  index?: boolean;
};

/**
 * Title, description and link preview for one page. A page that sets
 * `openGraph` replaces the layout's whole block, so everything a preview needs
 * is repeated here. The share image comes from the nearest `opengraph-image`.
 */
export function pageMetadata({ title, shareTitle, description, path, index = true }: PageInfo): Metadata {
  const headline = shareTitle ?? `${title} · ${SITE_NAME}`;
  return {
    title,
    description,
    robots: index ? undefined : { index: false },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", title: headline, description, url: path },
    twitter: { card: "summary_large_image", title: headline, description },
  };
}
