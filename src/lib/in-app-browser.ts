/**
 * Links tapped inside some apps open in the app's own built-in browser instead
 * of Safari or Chrome. Google refuses to sign anyone in from those ("Error 403:
 * disallowed_useragent"), so a player arriving from an Instagram link would hit
 * a dead end. This spots those browsers so the sign-in button can say what to do.
 *
 * Apps that hand links to the phone's real browser (Messages, WhatsApp, Discord,
 * Slack) are not listed and are not affected.
 */
const APPS: [pattern: RegExp, name: string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/, "Facebook"],
  [/musical_ly|BytedanceWebview|TikTok/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn"],
  [/MicroMessenger/i, "WeChat"],
  [/\bLine\//, "LINE"],
];

/**
 * The app whose built-in browser this is, "this app" for an unnamed one on
 * Android, or null for a normal browser.
 */
export function inAppBrowser(userAgent: string): string | null {
  for (const [pattern, name] of APPS) if (pattern.test(userAgent)) return name;
  // Android marks every embedded browser with "; wv)".
  if (/Android/.test(userAgent) && /; wv\)/.test(userAgent)) return "this app";
  return null;
}
