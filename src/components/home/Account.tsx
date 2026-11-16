import { currentUser } from "@/lib/server/auth";
import PlayButton from "./PlayButton";

/** The Google mark, as Google's sign-in button guidelines draw it. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.840H9v3.480h4.840a4.140 4.140 0 01-1.800 2.720v2.260h2.920c1.700-1.570 2.680-3.880 2.680-6.620z" />
      <path fill="#34A853" d="M9 18c2.430 0 4.470-.800 5.960-2.180l-2.920-2.260c-.800.540-1.840.860-3.040.860-2.340 0-4.330-1.580-5.040-3.710H.960v2.330A9 9 0 009 18z" />
      <path fill="#FBBC05" d="M3.960 10.710A5.410 5.410 0 013.680 9c0-.590.100-1.170.280-1.710V4.960H.960A9 9 0 000 9c0 1.450.350 2.830.960 4.040l3-2.330z" />
      <path fill="#EA4335" d="M9 3.580c1.320 0 2.510.450 3.440 1.350l2.580-2.590C13.460.890 11.430 0 9 0A9 9 0 00.960 4.960l3 2.330C4.670 5.160 6.660 3.580 9 3.580z" />
    </svg>
  );
}

function SignInForm({ next, label, className }: { next: string; label: string; className: string }) {
  return (
    <form method="post" action="/auth/sign-in">
      <input type="hidden" name="next" value={next} />
      <button type="submit" className={className}>
        <GoogleMark />
        {label}
      </button>
    </form>
  );
}

type Search = Promise<Record<string, string | string[] | undefined>>;

/** The main button on the home page: "Play solo" when signed in, Google sign in when not. */
export async function PlayArea({ searchParams }: { searchParams: Search }) {
  const [user, query] = await Promise.all([currentUser(), searchParams]);
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
      <SignInForm next={next} label="Sign in with Google to play" className="btn btn-white w-full !px-6 !py-4 !text-2xl sm:w-auto" />
      <p role={query.signin === "failed" ? "alert" : undefined} className={`mt-3 text-sm font-semibold ${query.signin === "failed" ? "text-alarm" : "text-sky"}`}>
        {note ?? "Free. All you need is a Google account."}
      </p>
    </div>
  );
}

/** Top right of the home page: who is signed in, and the way out. */
export async function AccountChip() {
  const user = await currentUser();
  if (!user) return null;
  const firstName = user.name?.split(/\s+/)[0] ?? "Player";
  return (
    <div className="panel flex items-center gap-2 !rounded-full py-1 pl-1 pr-1.5">
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small avatar served by Google
        <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
      ) : (
        <span className="display grid h-8 w-8 place-items-center rounded-full bg-ucla-blue text-lg">{firstName[0]}</span>
      )}
      <span className="max-w-32 truncate text-sm font-semibold">{firstName}</span>
      <form method="post" action="/auth/sign-out">
        <button type="submit" className="cursor-pointer rounded-full px-2.5 py-1 text-sm font-semibold text-sky hover:bg-navy-line hover:text-paper">
          Sign out
        </button>
      </form>
    </div>
  );
}
