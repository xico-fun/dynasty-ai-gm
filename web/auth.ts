import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import PostgresAdapter from "@auth/pg-adapter"
import bcrypt from "bcryptjs"
import { pool } from "@/lib/db"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PostgresAdapter(pool),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const result = await pool.query(
          "SELECT id, email, username, password_hash FROM users WHERE email = $1",
          [credentials.email]
        )
        const user = result.rows[0]
        if (!user?.password_hash) return null

        const valid = await bcrypt.compare(credentials.password as string, user.password_hash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.username }
      },
    }),
  ],
  // 30-day persistent session by default ("keep me signed in"). When a user
  // unchecks that at login, the session cookie is converted to a browser-only
  // cookie via /api/auth/remember.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (token?.id) (session.user as { id?: string }).id = token.id as string
      return session
    },
  },
})
