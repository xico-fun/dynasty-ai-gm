import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { pool } from "@/lib/db"

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex")
}

/**
 * Complete a password reset: validate the (hashed) token, check expiry, update
 * the password, and consume the token.
 */
export async function POST(req: NextRequest) {
  const { email, token, password } = await req.json()
  const clean = String(email ?? "").trim().toLowerCase()

  if (!clean || !token || !password) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 })
  }
  if (String(password).length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    )
  }

  const tokenHash = hashToken(String(token))
  const row = await pool.query(
    `SELECT expires FROM verification_tokens
      WHERE identifier = $1 AND token = $2`,
    [clean, tokenHash]
  )
  if (row.rows.length === 0) {
    return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 })
  }
  if (new Date(row.rows[0].expires) < new Date()) {
    await pool.query(
      "DELETE FROM verification_tokens WHERE identifier = $1 AND token = $2",
      [clean, tokenHash]
    )
    return NextResponse.json({ error: "This reset link has expired." }, { status: 400 })
  }

  const password_hash = await bcrypt.hash(String(password), 12)
  await pool.query(
    "UPDATE users SET password_hash = $1, updated_at = now() WHERE email = $2",
    [password_hash, clean]
  )
  // Consume the token so it can't be reused.
  await pool.query("DELETE FROM verification_tokens WHERE identifier = $1", [clean])

  return NextResponse.json({ ok: true })
}
