import Link from "next/link";
import { LegalPage, LegalSection, legalLink } from "@/components/LegalPage";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Terms",
  description: "The rules for playing BruinGuessr.",
  path: "/terms",
});

const LINKEDIN = "https://www.linkedin.com/in/dxing01/";

/** The terms of use. Plain and short, like the game. */
export default function TermsPage() {
  return (
    <LegalPage
      title="Ter"
      gold="ms"
      updated="November 18, 2026"
      intro={
        <p>
          BruinGuessr is a free game made by a student. It is not affiliated with, endorsed by or run by UCLA. By playing, you agree to these terms.
        </p>
      }
    >
      <LegalSection title="Your account">
        <ul>
          <li>Sign in with your own Google account, and keep it secure. You are responsible for what is done with your BruinGuessr account.</li>
          <li>
            Pick a username that is not offensive, hateful or pretending to be someone else. We may change or remove a username that breaks this rule.
          </li>
          <li>
            You can delete your account at any time from{" "}
            <Link href="/settings" className={legalLink}>
              Settings
            </Link>
            .
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Play fair">
        <p>The leaderboard only means something if everyone plays the same game. Do not:</p>
        <ul>
          <li>use scripts, bots or other tools to place pins or play for you;</li>
          <li>try to find where a photo was taken by any means other than recognising it (for example by reading the site&rsquo;s traffic or searching for the image);</li>
          <li>collect or copy the game&rsquo;s photos, or try to work out their locations in bulk;</li>
          <li>exploit bugs, overload the site or get around its limits;</li>
          <li>harass other players in versus rooms or through usernames.</li>
        </ul>
        <p>
          We may remove scores, hide players from the leaderboard or close accounts that break these rules. If you find a bug that lets people cheat,
          please report it instead of using it.
        </p>
      </LegalSection>

      <LegalSection title="Photos and map">
        <p>
          The photos belong to the people who took them and are used under their licenses. The map uses OpenStreetMap data. Who took what, and under which
          license, is on the{" "}
          <Link href="/credits" className={legalLink}>
            Credits
          </Link>{" "}
          page. If a photo is wrong, unclear or should not be in the game, use &ldquo;Report photo&rdquo; after guessing it.
        </p>
      </LegalSection>

      <LegalSection title="Photos you contribute">
        <ul>
          <li>Send only photos you took yourself, on campus, at that moment, with your phone&rsquo;s real location. Do not fake where a photo was taken.</li>
          <li>
            Shoot places, not people. Do not photograph anyone as the subject, inside private rooms, or anything that shows private information. Our
            reviewers blur faces they find before a photo goes live, but it is up to you not to send them.
          </li>
          <li>
            By ticking the box you license the photo under{" "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer license" className={legalLink}>
              CC BY-SA 4.0
            </a>
            , credited by your BruinGuessr username. The credit follows your username if you change it. Deleting your account takes your photos out of
            the game.
          </li>
          <li>
            A reviewer checks every photo and may reject it, move its pin, blur parts of it, or remove it later.
          </li>
          <li>Your own photos never come up in your games, or in any versus game you play in.</li>
        </ul>
      </LegalSection>

      <LegalSection title="No guarantees">
        <p>
          The game is provided as it is, for fun, with no warranty of any kind. It may have bugs, be unavailable, change, or have its leaderboard reset,
          and it may shut down. To the fullest extent the law allows, BruinGuessr and its maker are not liable for any loss from using it.
        </p>
      </LegalSection>

      <LegalSection title="Privacy">
        <p>
          What we keep about you, and how to delete it, is on the{" "}
          <Link href="/privacy" className={legalLink}>
            Privacy
          </Link>{" "}
          page.
        </p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>If these terms change, this page will show the new date at the top. Playing after a change means you accept the new terms.</p>
        <p>
          Questions: contact{" "}
          <a href={LINKEDIN} target="_blank" rel="noopener noreferrer" className={legalLink}>
            Daniel Xing on LinkedIn
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
