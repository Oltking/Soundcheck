"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/glyphs";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (!res || res.error) {
      setErr("Wrong email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="auth-card">
      <div className="auth-head">
        <h1>Welcome back</h1>
        <p>Sign in to your band and pick up where you left off.</p>
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </label>
        {err && <div className="auth-err">{err}</div>}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "Signing in…" : <>Sign in <Icon name="handoff" /></>}
        </button>
      </form>

      <p className="auth-alt">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </div>
  );
}
