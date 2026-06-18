import type { NextAuthConfig } from "next-auth";

// Edge-safe base config shared by the Node runtime (auth.ts) and the middleware.
// It must NOT import the Postgres adapter, `pg`, or bcrypt (those are Node-only).
// The `authorized` callback is the route gate the middleware runs on every request.

// Routes that require a signed-in user. Everything else (the marketing site,
// /login, /signup, /api/auth/*) stays public.
const PROTECTED = ["/app", "/run", "/posture", "/roster", "/stage", "/findings", "/conductor", "/tape"];

export const authConfig = {
  pages: { signIn: "/login" },
  providers: [], // real providers are added in auth.ts (Node runtime)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const needsAuth = PROTECTED.some(
        (p) => nextUrl.pathname === p || nextUrl.pathname.startsWith(p + "/"),
      );
      if (needsAuth) return isLoggedIn; // false → redirect to /login
      return true;
    },
  },
} satisfies NextAuthConfig;
