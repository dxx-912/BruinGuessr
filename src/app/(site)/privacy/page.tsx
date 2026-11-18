import Link from "next/link";
import { LegalPage, LegalSection, legalLink } from "@/components/LegalPage";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Privacy",
  description: "What BruinGuessr stores about you, who can see it, and how to delete it.",
  path: "/privacy",
});

const LINKEDIN = "https://www.linkedin.com/in/dxing01/";

/**
 * The privacy policy. Written from what the code and database actually do
 * (src/lib/server/guest.ts, the migrations in supabase/migrations); update it
 * whenever what is collected or kept changes.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Priv"
      gold="acy"
      updated="November 17, 2026"
      intro={
        <p>
          BruinGuessr is a free student project, not affiliated with UCLA. It keeps as little about you as it can to run the game. There are no ads, no
          analytics and no tracking, and nothing is sold or shared for marketing.
        </p>
      }
    >
      <LegalSection title="If you sign in">
        <p>Sign in is with Google only. When you sign in, Google tells us:</p>
        <ul>
          <li>your email address,</li>
          <li>your name and profile photo,</li>
          <li>an ID for your Google account.</li>
        </ul>
        <p>
          We never see your Google password. Your email is shown only to you, on your Settings page. Your Google photo is shown only to you, in the menu
          at the top right; your public profile shows the first letter of your username instead.
        </p>
      </LegalSection>

      <LegalSection title="What the game keeps">
        <ul>
          <li>
            <strong>Your username</strong>, which you choose, and when you joined.
          </li>
          <li>
            <strong>Your games</strong>: where you dropped each pin, how far it was from the answer, your points, and when you played. For versus games,
            the room you played in and who else was in it.
          </li>
          <li>
            <strong>Photo reports</strong> you file, so that one person cannot hide a photo by reporting it many times.
          </li>
        </ul>
        <p>
          <strong>What is public:</strong> your username, your profile (join date, best game, games played, average score, bullseyes, versus results and
          your recent games&rsquo; distances and points), and your place on the leaderboard. Players in a versus room see your username and your pins
          for that game.
        </p>
      </LegalSection>

      <LegalSection title="If you play as a guest">
        <p>
          Solo play works without an account. Your browser gets a random guest code in a cookie (<code>bg_guest</code>, for 7 days) so the game knows
          your games are yours. We store only a scrambled form of the code, never the code itself.
        </p>
        <p>
          To stop one person from creating endless guest games, we also keep a scrambled form of your network address (IP address). It cannot be turned
          back into the address. The records of when guest games started are deleted after a day.
        </p>
        <p>
          Guest games never appear on the leaderboard and are never attached to an account. A guest and its games are deleted after 7 days without a
          visit, and signing in forgets the guest straight away.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and your browser">
        <ul>
          <li>Sign-in cookies, which keep you signed in. They are needed for the site to work.</li>
          <li>The guest cookie above, only if you play as a guest.</li>
          <li>Your sound on/off choice, saved in your browser and never sent to us.</li>
        </ul>
        <p>There are no advertising or analytics cookies.</p>
      </LegalSection>

      <LegalSection title="Services the site runs on">
        <ul>
          <li>
            <strong>Supabase</strong> stores the database, the photos and the sign-in accounts.
          </li>
          <li>
            <strong>Vercel</strong> hosts the site. Like any web host, it handles your network address when your browser asks for a page.
          </li>
          <li>
            <strong>Google</strong> handles sign in.
          </li>
          <li>
            <strong>OpenFreeMap</strong> serves the map. Your browser loads map pieces straight from its servers.
          </li>
        </ul>
        <p>Each handles data under its own privacy policy. We share nothing with them beyond what running the site needs.</p>
      </LegalSection>

      <LegalSection title="Deleting your account">
        <p>
          Go to{" "}
          <Link href="/settings" className={legalLink}>
            Settings
          </Link>{" "}
          and choose Delete account. It removes your profile, username, solo games, photo reports and leaderboard entry at once. Versus games stay for the
          other players in them, with you removed. If you are signed in on another device, that device may show you as signed in for up to an hour, but
          it can no longer reach your account.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>BruinGuessr is meant for university students and is not directed at children under 13.</p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>If this policy changes, this page will show the new date at the top.</p>
        <p>
          Questions, or a request about your data: contact{" "}
          <a href={LINKEDIN} target="_blank" rel="noopener noreferrer" className={legalLink}>
            Daniel Xing on LinkedIn
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
