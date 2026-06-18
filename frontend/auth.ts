import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import PostgresAdapter from "@auth/pg-adapter";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { authConfig } from "./auth.config";

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
      if (!u || !u.password) return null;
      const ok = await bcrypt.compare(password, u.password);
      if (!ok) return null;
      return { id: String(u.id), name: u.name, email: u.email, image: u.image };
    },
  }),
];

// Full Auth.js config (Node runtime). Sessions are JWT (required by the
// Credentials provider); the Postgres `users` table is the source of truth that
// email/password sign-in reads, and where sign-up writes.
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
