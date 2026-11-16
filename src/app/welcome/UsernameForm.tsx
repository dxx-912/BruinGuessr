"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { USERNAME_MAX, USERNAME_MESSAGES, usernameFormatProblem, type UsernameProblem } from "@/lib/username";

type Check = { name: string; status: "checking" | "ok" | "problem" | "error"; problem?: UsernameProblem };

async function askServer(method: "GET" | "POST", name: string): Promise<{ ok: boolean; problem?: UsernameProblem }> {
  const response =
    method === "GET"
      ? await fetch(`/api/username?name=${encodeURIComponent(name)}`, { cache: "no-store" })
      : await fetch("/api/username", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: name }) });
  const data = (await response.json().catch(() => null)) as { ok?: boolean; problem?: UsernameProblem } | null;
  if (!data || (data.ok === undefined && !response.ok)) throw new Error(String(response.status));
  return { ok: data.ok === true, problem: data.problem };
}

/** The username field: checks as you type, then saves once. */
export default function UsernameForm({ suggestion, next }: { suggestion: string; next: string }) {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const [name, setName] = useState(suggestion);
  const [check, setCheck] = useState<Check | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef(name);

  const trimmed = name.trim();
  const localProblem = trimmed ? usernameFormatProblem(trimmed) : null;

  // Ask the server whether the name is free and allowed, a moment after typing stops.
  useEffect(() => {
    latest.current = trimmed;
    if (!trimmed || usernameFormatProblem(trimmed)) return;
    const timer = setTimeout(async () => {
      setCheck({ name: trimmed, status: "checking" });
      try {
        const result = await askServer("GET", trimmed);
        if (latest.current !== trimmed) return;
        setCheck({ name: trimmed, status: result.ok ? "ok" : "problem", problem: result.problem });
      } catch {
        if (latest.current === trimmed) setCheck({ name: trimmed, status: "error" });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const current = check?.name === trimmed ? check : null;
  const problem = localProblem ?? (current?.status === "problem" ? (current.problem ?? null) : null);

  let hint: { text: string; tone: "quiet" | "good" | "bad" };
  if (!trimmed) hint = { text: `3 to ${USERNAME_MAX} letters, numbers or underscores.`, tone: "quiet" };
  else if (problem) hint = { text: USERNAME_MESSAGES[problem], tone: "bad" };
  else if (current?.status === "ok") hint = { text: `${trimmed} is free.`, tone: "good" };
  else if (current?.status === "error") hint = { text: "Couldn't check that name. You can still try it.", tone: "quiet" };
  else hint = { text: "Checking…", tone: "quiet" };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed || localProblem || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await askServer("POST", trimmed);
      if (result.ok || result.problem === "locked") {
        router.replace(next);
        router.refresh();
        return;
      }
      setCheck({ name: trimmed, status: "problem", problem: result.problem ?? "bad_chars" });
    } catch {
      setSaveError("Couldn't save. Check your connection and try again.");
    }
    setSaving(false);
  };

  const toneClass = hint.tone === "bad" ? "text-alarm" : hint.tone === "good" ? "text-ucla-gold" : "text-sky";

  return (
    <form onSubmit={submit} className="mt-6" noValidate>
      <label htmlFor={inputId} className="display text-2xl">
        Username
      </label>
      <input
        id={inputId}
        name="username"
        value={name}
        onChange={(e) => setName(e.target.value.replace(/\s/g, ""))}
        maxLength={USERNAME_MAX + 4}
        autoComplete="nickname"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        aria-describedby={hintId}
        aria-invalid={problem ? true : undefined}
        className={`mt-2 block w-full rounded-[14px] border-2 bg-night px-4 py-3 text-2xl font-semibold text-paper outline-none placeholder:text-navy-line focus:border-sky ${
          problem ? "border-alarm" : "border-navy-line"
        }`}
        placeholder="RoyceHall22"
      />
      <p id={hintId} aria-live="polite" className={`mt-2 min-h-6 text-sm font-semibold ${toneClass}`}>
        {hint.text}
      </p>
      {saveError && (
        <p role="alert" className="mt-1 text-sm font-semibold text-alarm">
          {saveError}
        </p>
      )}
      <button type="submit" className="btn btn-gold mt-4 w-full !py-4 !text-2xl" disabled={!trimmed || !!problem || saving}>
        {saving ? "Saving…" : "Use this name"}
      </button>
    </form>
  );
}
