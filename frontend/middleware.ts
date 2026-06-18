import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// The middleware runs on the edge, so it uses the adapter-free base config.
// It reads the JWT session and applies the `authorized` route gate.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // run on everything except Next internals, the auth API, and static assets
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|logo.png|.*\\.png$).*)"],
};
