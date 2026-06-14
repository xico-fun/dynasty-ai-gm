import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const isProd = process.env.NODE_ENV === "production"
const SESSION_COOKIE = isProd
  ? "__Secure-authjs.session-token"
  : "authjs.session-token"

/**
 * Adjust session persistence based on the "keep me signed in" choice, called
 * right after a successful login.
 *
 * - remember = true  → leave the default 30-day persistent cookie untouched.
 * - remember = false → re-set the same session value WITHOUT maxAge, making it
 *   a browser-session cookie that clears when the browser closes.
 */
export async function POST(req: NextRequest) {
  const { remember } = await req.json()
  if (remember) return NextResponse.json({ ok: true }) // default path, no-op

  const jar = await cookies()
  const existing = jar.get(SESSION_COOKIE)
  if (existing) {
    jar.set(SESSION_COOKIE, existing.value, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      // No maxAge / expires → session cookie (cleared on browser close).
    })
  }
  return NextResponse.json({ ok: true })
}
