import InAppBrowserNote from "./InAppBrowserNote";

/** The Google mark, as Google's sign-in button guidelines draw it. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-5 w-5 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.840H9v3.480h4.840a4.140 4.140 0 01-1.800 2.720v2.260h2.920c1.700-1.570 2.680-3.880 2.680-6.620z" />
      <path fill="#34A853" d="M9 18c2.430 0 4.470-.800 5.960-2.180l-2.920-2.260c-.800.540-1.840.860-3.040.860-2.340 0-4.330-1.580-5.040-3.710H.960v2.330A9 9 0 009 18z" />
      <path fill="#FBBC05" d="M3.960 10.710A5.410 5.410 0 013.680 9c0-.590.100-1.170.280-1.710V4.960H.960A9 9 0 000 9c0 1.450.350 2.830.960 4.040l3-2.330z" />
      <path fill="#EA4335" d="M9 3.580c1.320 0 2.510.450 3.440 1.350l2.580-2.590C13.460.890 11.430 0 9 0A9 9 0 00.960 4.960l3 2.330C4.670 5.160 6.660 3.580 9 3.580z" />
    </svg>
  );
}

type Props = {
  /** Where to land after signing in: a path on this site. */
  next: string;
  label: string;
  className?: string;
};

/**
 * The "Sign in with Google" button. It is a plain form, so it works before any
 * script has loaded. Google is the only way to sign in.
 */
export default function SignInForm({ next, label, className = "btn btn-white w-full !px-6 !py-4 !text-2xl sm:w-auto" }: Props) {
  return (
    <>
      <InAppBrowserNote />
      <form method="post" action="/auth/sign-in">
        <input type="hidden" name="next" value={next} />
        <button type="submit" className={className}>
          <GoogleMark />
          {label}
        </button>
      </form>
    </>
  );
}
