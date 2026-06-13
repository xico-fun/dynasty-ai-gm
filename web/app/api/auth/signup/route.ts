import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { pool } from "@/lib/db"

export async function POST(req: NextRequest) {
  const { email, username, password } = await req.json()

  if (!email || !username || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 })
  }

  const existing = await pool.query(
    "SELECT id FROM users WHERE email = $1 OR username = $2",
    [email, username]
  )
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "Email or username already taken." }, { status: 409 })
  }

  const password_hash = await bcrypt.hash(password, 12)

  await pool.query(
    "INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3)",
    [email, username, password_hash]
  )

  return NextResponse.json({ ok: true }, { status: 201 })
}
