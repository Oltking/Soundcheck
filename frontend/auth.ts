import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import PostgresAdapter from "@auth/pg-adapter";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { authConfig } from "./auth.config";

// Google is only registered once its credentials exist, so the app still boots
// (email/password only) before they're configured.
const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: { email: {}, password: {} },
    authorize: async (creds) => {
      const email = String(creds?.email || "").trim().toLowerCase();
      const password = String(creds?.password || "");
      if (!email || !password) return null;
      const { rows } = await pool.query(
        "SELECT id, name, email, password, image FROM users WHERE email = $1",
        [email],
      );
      const u = rows[0];
      if (!u || !u.password) return null; // no such user, or an OAuth-only account
      const ok = await bcrypt.compare(password, u.password);
      if (!ok) return null;
      return { id: String(u.id), name: u.name, email: u.email, image: u.image };
    },
  }),
];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.unshift(Google({ allowDangerousEmailAccountLinking: true }));
}

// Full Auth.js config (Node runtime). Sessions are JWT (required by the
// Credentials provider); the Postgres adapter persists Google sign-ins and is
// the source of truth for the users table that email/password sign-in reads.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PostgresAdapter(pool),
  session: { strategy: "jwt" },
  trustHost: true,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token?.id && session.user) session.user.id = String(token.id);
      return session;
    },
  },
});
