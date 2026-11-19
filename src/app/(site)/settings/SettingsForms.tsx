"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { formatDay } from "@/lib/profile";
import { USERNAME_MAX, USERNAME_MESSAGES, usernameFormatProblem, type UsernameProblem } from "@/lib/username";

type ChangeProblem = UsernameProblem | "same_name" | "too_soon";

const MESSAGES: Record<ChangeProblem, string> = {
  ...USERNAME_MESSAGES,
  same_name: "That's already your name.",
  too_soon: "You changed your name recently.",
};

const input = "block w-full rounded-[14px] border-2 bg-night px-4 py-3 text-xl font-semibold text-paper outline-none placeholder:text-navy-line focus:border-sky";

/** Change the username: checked as you type, at most once per 30 days. */
export function ChangeUsername({ current, nextChangeAt }: { current: string; nextChangeAt: number | null }) {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const [name, setName] = useState(current);
  const [check, setCheck] = useState<{ name: string; ok: boolean; problem?: ChangeProblem } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(nextChangeAt);
  const latest = useRef(name);

  const trimmed = name.trim();
  const unchanged = trimmed === current;
  // Changing only the capitals of your own name is allowed, and the "is it free" check would say no.
  const caseOnly = !unchanged && trimmed.toLowerCase() === current.toLowerCase();
  const localProblem: ChangeProblem | null = unchanged ? null : usernameFormatProblem(trimmed);
  // The server says when the next change is allowed; null means now.
  const locked = lockedUntil !== null;

  useEffect(() => {
    latest.current = trimmed;
    if (locked || unchanged || caseOnly || usernameFormatProblem(trimmed)) return;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/username?name=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
        const data = (await response.json()) as { ok?: boolean; problem?: UsernameProblem };
        if (latest.current === trimmed) setCheck({ name: trimmed, ok: data.ok === true, problem: data.problem });
      } catch {
        // The save will check again.
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [trimmed, locked, unchanged, caseOnly]);

  const remote = check?.name === trimmed && !check.ok ? (check.problem ?? null) : null;
  const problem = localProblem ?? remote;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (unchanged || problem || saving || locked) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const response = await fetch("/api/account/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = (await response.json()) as { ok?: boolean; username?: string; problem?: ChangeProblem; nextChangeAt?: number | null };
      if (data.ok && data.username) {
        setSaved(data.username);
        setLockedUntil(data.nextChangeAt ?? null);
        router.refresh();
      } else if (data.problem === "too_soon") {
        setLockedUntil(data.nextChangeAt ?? null);
      } else {
        setCheck({ name: trimmed, ok: false, problem: data.problem ?? "bad_chars" });
      }
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    }
    setSaving(false);
  };

  if (locked) {
    return (
      <div className="mt-3">
        <p className="text-2xl font-semibold">{saved ?? current}</p>
        {saved && <p className="mt-2 font-semibold text-leaf">Saved. You&rsquo;re {saved} now.</p>}
        <p className="mt-2 text-sky">
          You can change your username once every 30 days. Next change: <span className="font-semibold text-paper">{formatDay(lockedUntil!)}</span>.
        </p>
      </div>
    );
  }

  const hint = problem
    ? { text: MESSAGES[problem], bad: true }
    : unchanged
      ? { text: `Same rules as before: 3 to ${USERNAME_MAX} letters, numbers or underscores. You can change it once every 30 days.`, bad: false }
      : { text: caseOnly || check?.name === trimmed ? `${trimmed} is free.` : "Checking…", bad: false, good: caseOnly || check?.name === trimmed };

  return (
    <form onSubmit={submit} className="mt-3" noValidate>
      <label htmlFor={inputId} className="sr-only">
        Username
      </label>
      <div className="flex flex-wrap gap-3">
        <input
          id={inputId}
          value={name}
          onChange={(e) => setName(e.target.value.replace(/\s/g, ""))}
          maxLength={USERNAME_MAX + 4}
          autoComplete="nickname"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={hintId}
          aria-invalid={problem ? true : undefined}
          className={`${input} min-w-0 flex-1 basis-56 ${problem ? "border-alarm" : "border-navy-line"}`}
        />
        <button type="submit" className="btn btn-gold" disabled={unchanged || !!problem || saving}>
          {saving ? "Saving…" : "Change"}
        </button>
      </div>
      <p id={hintId} aria-live="polite" className={`mt-2 min-h-6 text-sm font-semibold ${hint.bad ? "text-alarm" : "good" in hint && hint.good ? "text-leaf" : "text-sky"}`}>
        {hint.text}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-sm font-semibold text-alarm">
          {error}
        </p>
      )}
    </form>
  );
}

/** Delete the account, confirmed by typing the username. */
export function DeleteAccount({ username }: { username: string }) {
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === username.toLowerCase();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!matches || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      if (response.ok) {
        // The session is gone; fetch every page fresh so nothing signed-in stays on screen.
        router.replace("/?deleted=1");
        router.refresh();
        return;
      }
      setError(response.status === 400 ? "That isn't your username." : "The account could not be deleted. Try again in a moment.");
    } catch {
      setError("No connection. Check your internet and try again.");
    }
    setDeleting(false);
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-red mt-4 !text-lg" onClick={() => setOpen(true)}>
        Delete account
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4" noValidate>
      <p className="mb-3 text-sm text-sky">
        This can&rsquo;t be undone. Your games, your leaderboard entry and every photo you contributed (live or waiting) are deleted.
      </p>
      <label htmlFor={inputId} className="font-semibold">
        Type <span className="rounded bg-night px-1.5 py-0.5 font-bold">{username}</span> to confirm
      </label>
      <input
        id={inputId}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        className={`${input} mt-2 border-navy-line`}
      />
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-alarm">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" className="btn btn-red" disabled={!matches || deleting}>
          {deleting ? "Deleting…" : "Delete my account"}
        </button>
        <button
          type="button"
          className="btn-quiet !text-base"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
