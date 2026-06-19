import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

// Email/password sign-up. Collects ONLY email, password, and a nickname (stored
// as the user's name). The password is bcrypt-hashed; we never store it raw.
export async function POST(req: Request) {
  let body: { email?: string; password?: string; nickname?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const nickname = String(body.nickname || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (nickname.length < 2 || nickname.length > 40)
    return NextResponse.json({ error: "Pick a nickname (2-40 characters)." }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  try {
    const exists = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (exists.rowCount)
      return NextResponse.json({ error: "That email already has an account." }, { status: 409 });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3)",
      [nickname, email, hash],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("signup failed", e);
    return NextResponse.json(
      { error: "Could not create the account. Is the database reachable?" },
      { status: 500 },
    );
  }
}
