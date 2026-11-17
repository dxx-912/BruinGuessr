"use client";

import { useState, useSyncExternalStore } from "react";
import { inAppBrowser } from "@/lib/in-app-browser";

const noSubscription = () => () => {};

/**
 * Shown above the sign-in button when the page is open inside an app's own
 * browser (Instagram, TikTok…), where Google sign in is refused. Says how to
 * get to a real browser, and offers the link to paste there.
 */
export default function InAppBrowserNote() {
  const app = useSyncExternalStore(noSubscription, () => inAppBrowser(navigator.userAgent), () => null);
  const [copied, setCopied] = useState(false);
  if (!app) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Nothing to fall back to; the menu route in the note still works.
    }
  };

  return (
    <div role="note" className="mb-4 max-w-lg rounded-[14px] border-2 border-ucla-gold bg-navy px-4 py-3 text-left">
      <p className="font-semibold text-paper">Open this page in Safari or Chrome to sign in.</p>
      <p className="mt-1 text-sm text-sky">
        Google does not allow sign in from inside {app === "this app" ? "this app" : `${app}'s browser`}. Tap the menu (••• or ⋮) and choose &ldquo;Open in browser&rdquo;, or copy the link and paste it there.
      </p>
      <button type="button" className="btn-quiet mt-3 min-h-11" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
