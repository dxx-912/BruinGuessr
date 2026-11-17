import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, Geist_Mono } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, siteUrl } from "@/lib/site";
import "./globals.css";

const barlow = Barlow({ variable: "--font-barlow", subsets: ["latin"], weight: ["500", "600"] });

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["700", "800"],
  style: ["italic"],
});

// Only the development review pages use the mono face.
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // What a link to the site looks like in a group chat. The picture is src/app/opengraph-image.tsx.
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", title: SITE_TITLE, description: SITE_DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  appleWebApp: { title: SITE_NAME },
  // Scores like 21,345 are not phone numbers.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#06182b",
  // Lets the page reach under a phone's notch and home bar; globals.css keeps content clear of both.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
