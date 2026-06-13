import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Let all API routes through — they enforce their own auth and return
  // JSON (e.g. 401) rather than redirecting, which a fetch() expects.
  if (pathname.startsWith("/api")) return NextResponse.next()

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
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
