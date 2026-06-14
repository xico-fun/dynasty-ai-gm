import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { pool } from "@/lib/db"

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex")
}

/**
 * Start a password reset. Always responds success (never reveals whether an
 * email exists). If the account exists, we store a hashed, expiring token and
 * email a reset link.
 */
export async function POST(req: NextRequest) {
  const { email } = await req.json()
  const clean = String(email ?? "").trim().toLowerCase()

  // Generic response regardless of outcome, to avoid account enumeration.
  const ok = NextResponse.json({ ok: true })
  if (!clean) return ok

  const userRes = await pool.query("SELECT id FROM users WHERE email = $1", [clean])
  if (userRes.rows.length === 0) return ok

  // One active token per email: clear any previous ones.
  await pool.query("DELETE FROM verification_tokens WHERE identifier = $1", [clean])

  const raw = crypto.randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + TOKEN_TTL_MS)
  await pool.query(
    "INSERT INTO verification_tokens (identifier, token, expires) VALUES ($1, $2, $3)",
    [clean, hashToken(raw), expires]
  )

  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const link = `${base}/reset-password?token=${raw}&email=${encodeURIComponent(clean)}`

  await sendResetEmail(clean, link)
  return ok
}

async function sendResetEmail(to: string, link: string) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? "Dynasty AI GM <onboarding@resend.dev>"

  // No email provider configured (local dev) — log the link so it's still usable.
  if (!apiKey) {
    console.log(`[forgot-password] reset link for ${to}: ${link}`)
    return
  }

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "Reset your Dynasty AI GM password",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#16a34a">Reset your password</h2>
            <p>We received a request to reset your Dynasty AI GM password. This link expires in 1 hour.</p>
            <p><a href="${link}" style="display:inline-block;background:#22c55e;color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>
            <p style="color:#64748b;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
          </div>`,
      }),
    })
  } catch (e) {
    console.error("[forgot-password] email send failed:", e)
  }
}
