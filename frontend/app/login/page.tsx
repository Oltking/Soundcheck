import "../auth.css";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const safe = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/app";
  return (
    <main className="auth-page">
      <Link href="/" className="auth-brand" aria-label="Soundcheck home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={30} height={30} />
        <span className="wm">sound<b>check</b></span>
      </Link>
      <LoginForm callbackUrl={safe} />
    </main>
  );
}
