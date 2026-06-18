"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/glyphs";
import { GoogleMark } from "@/components/google-mark";

export function SignupForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "Could not create the account.");
        setBusy(false);
        return;
      }
      // account created — sign straight in
      const signed = await signIn("credentials", { email, password, redirect: false });
      setBusy(false);
      if (!signed || signed.error) {
        // created, but auto sign-in failed — send them to login
        router.push("/login");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setErr("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-head">
        <h1>Join the band</h1>
        <p>Just a nickname, an email, and a password — that&apos;s it.</p>
      </div>

      <button className="auth-oauth" onClick={() => signIn("google", { callbackUrl })}>
        <GoogleMark /> Continue with Google
      </button>

      <div className="auth-or"><span>or</span></div>

      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          <span>Nickname</span>
          <input type="text" autoComplete="nickname" required minLength={2} maxLength={40}
            value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="what should we call you?" />
        </label>
        <label>
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="new-password" required minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters" />
        </label>
        {err && <div className="auth-err">{err}</div>}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "Creating…" : <>Create account <Icon name="handoff" /></>}
        </button>
      </form>

      <p className="auth-alt">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
