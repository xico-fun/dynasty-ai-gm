"use client"

import { useState } from "react"
import Link from "next/link"

const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "var(--foreground)",
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    setSent(true)
  }

  return (
    <div className="card-glass rounded-2xl w-full max-w-sm p-8 animate-fade-up">
      <div className="mb-6 text-center">
        <h1 className="text-lg font-semibold">Reset your password</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {sent
            ? "Check your inbox for a reset link."
            : "Enter your email and we'll send you a reset link."}
        </p>
      </div>

      {sent ? (
        <div
          className="rounded-lg px-3 py-3 text-sm text-center"
          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}
        >
          If an account exists for <strong>{email}</strong>, a reset link is on its way.
          The link expires in 1 hour.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="label-section">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "rgba(34,197,94,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-medium transition-all"
            style={{
              background: loading ? "rgba(34,197,94,0.3)" : "rgba(34,197,94,0.85)",
              color: "#000",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <div className="mt-6 text-center text-xs" style={{ color: "var(--muted)" }}>
        <Link href="/login" style={{ color: "var(--accent)" }}>
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
