import Link from "next/link";
import { currentPlayer } from "@/lib/server/profile";
import SignInForm from "@/components/SignInForm";
import PlayButton from "./PlayButton";

type Search = Promise<Record<string, string | string[] | undefined>>;

/** The main button on the home page: "Play solo" when signed in, Google sign in when not. */
export async function PlayArea({ searchParams }: { searchParams: Search }) {
  const [user, query] = await Promise.all([currentPlayer(), searchParams]);
  if (user && !user.username) {
    return (
      <div>
        <Link href="/welcome" className="btn btn-gold w-full !px-8 !py-4 !text-3xl sm:w-auto">
          Pick your username
        </Link>
        <p className="mt-3 text-sm font-semibold text-sky">One quick step before your first game.</p>
      </div>
    );
  }
  if (user) return <PlayButton />;

  const next = typeof query.next === "string" ? query.next : "/";
  const note =
    query.signin === "failed"
      ? "Sign in did not go through. Please try again."
      : query.signin === "required"
        ? "Sign in to play. Your games are saved to your account."
        : null;
  return (
    <div>
      <SignInForm next={next} label="Sign in with Google to play" />
      <p role={query.signin === "failed" ? "alert" : undefined} className={`mt-3 text-sm font-semibold ${query.signin === "failed" ? "text-alarm" : "text-sky"}`}>
        {note ?? "Free. All you need is a Google account."}
      </p>
    </div>
  );
}

/** Top right of the home page: who is signed in, and the way out. */
export async function AccountChip() {
  const user = await currentPlayer();
  if (!user) return null;
  const firstName = user.username ?? user.name?.split(/\s+/)[0] ?? "Player";
  return (
    <div className="panel flex items-center gap-2 !rounded-full py-1 pl-1 pr-1.5">
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small avatar served by Google
        <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
      ) : (
        <span className="display grid h-8 w-8 place-items-center rounded-full bg-ucla-blue text-lg">{firstName[0]}</span>
      )}
      <span className="max-w-20 truncate text-sm font-semibold sm:max-w-32">{firstName}</span>
      <form method="post" action="/auth/sign-out">
        <button type="submit" className="cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-semibold text-sky hover:bg-navy-line hover:text-paper">
          Sign out
        </button>
      </form>
    </div>
  );
}
