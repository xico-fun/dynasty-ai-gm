import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

// In production (HTTPS) Auth.js v5 stores the session in a __Secure- prefixed
// cookie, and encrypts it with a salt equal to the cookie name. getToken must
// be told both the cookie name and salt or it can't find/decrypt the session.
const isProd = process.env.NODE_ENV === "production"
const SESSION_COOKIE = isProd
  ? "__Secure-authjs.session-token"
  : "authjs.session-token"

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Let all API routes through — they enforce their own auth and return
  // JSON (e.g. 401) rather than redirecting, which a fetch() expects.
  if (pathname.startsWith("/api")) return NextResponse.next()

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: isProd,
    cookieName: SESSION_COOKIE,
    salt: SESSION_COOKIE,
  })

  const isLoggedIn = !!token
  const isAuthPage = pathname === "/login" || pathname === "/signup"

  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
