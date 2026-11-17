import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SignInForm from "@/components/SignInForm";
import { safeNextPath } from "@/lib/server/auth";
import { currentPlayer } from "@/lib/server/profile";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Log in",
  description: "Log in or sign up for BruinGuessr with your Google account.",
  path: "/login",
  index: false,
});

/**
 * The one sign-in page. "Log in" and "Sign up" both come here; the wording
 * follows which was pressed (`?mode=signup`). Google is the only way in, and
 * it is the same button either way: a new Google account becomes a new player.
 */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <section className="mx-auto grid w-full max-w-lg flex-1 content-center px-4 py-10 sm:px-6">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-[20px] bg-navy" />}>
        <Login searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

const REASONS: Record<string, string> = {
  versus: "Versus needs an account, so your friends know who they're up against.",
  profile: "Log in to see your profile.",
  settings: "Log in to change your settings.",
};

async function Login({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const [player, query] = await Promise.all([currentPlayer(), searchParams]);
  const next = safeNextPath(typeof query.next === "string" ? query.next : "/");
  if (player) redirect(player.username ? next : `/welcome?next=${encodeURIComponent(next)}`);

  const signup = query.mode === "signup";
  const failed = query.error === "failed";
  const reason = typeof query.reason === "string" ? REASONS[query.reason] : undefined;
  const other = new URLSearchParams({ ...(signup ? {} : { mode: "signup" }), ...(next !== "/" ? { next } : {}) }).toString();

  return (
    <div className="panel animate-rise !rounded-[20px] p-6 sm:p-8">
      <h1 className="display text-5xl sm:text-6xl">{signup ? <>Sign <span className="text-ucla-gold">up</span></> : <>Log <span className="text-ucla-gold">in</span></>}</h1>
      <p className="mt-3 text-lg text-sky">
        {signup
          ? "Make an account to save your scores, climb the leaderboard and play versus with friends. Free."
          : "Welcome back. Your scores and games are waiting."}
      </p>
      {reason && !failed && <p className="mt-3 font-semibold">{reason}</p>}
      {failed && (
        <p role="alert" className="mt-3 font-semibold text-alarm">
          {signup ? "Sign up" : "Log in"} did not go through. Please try again.
        </p>
      )}

      <div className="mt-6">
        <SignInForm next={next} label="Continue with Google" className="btn btn-white w-full !py-4 !text-2xl" />
      </div>

      <p className="mt-6 text-sky">
        {signup ? "Already have an account? " : "New here? "}
        <Link href={`/login${other ? `?${other}` : ""}`} className="font-semibold text-paper underline decoration-sky decoration-2 underline-offset-4 hover:decoration-ucla-gold">
          {signup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </div>
  );
}
