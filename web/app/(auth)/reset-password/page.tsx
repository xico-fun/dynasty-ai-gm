"use client"

import { Suspense, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"

const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "var(--foreground)",
}

export default function ResetPasswordPage() {
  // useSearchParams() requires a Suspense boundary for static prerendering.
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
  const params = useSearchParams()
  const router = useRouter()
  const email = params.get("email") ?? ""
  const token = params.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setLoading(true)
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, password }),
    })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? "Couldn't reset password.")
      return
    }
    setDone(true)
    setTimeout(() => router.push("/login"), 1800)
  }

  const invalidLink = !email || !token

  return (
    <div className="card-glass rounded-2xl w-full max-w-sm p-8 animate-fade-up">
      <div className="mb-6 text-center">
        <h1 className="text-lg font-semibold">Set a new password</h1>
        {!invalidLink && !done && (
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            For {email}
          </p>
        )}
      </div>

      {invalidLink ? (
        <div
          className="rounded-lg px-3 py-3 text-sm text-center"
          style={{ color: "var(--danger)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          This reset link is invalid or incomplete. Request a new one.
        </div>
      ) : done ? (
        <div
          className="rounded-lg px-3 py-3 text-sm text-center"
          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}
        >
          Password updated! Redirecting you to sign in…
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="label-section">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "rgba(34,197,94,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="label-section">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "rgba(34,197,94,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>

          {error && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ color: "var(--danger)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </p>
          )}

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
            {loading ? "Updating…" : "Update password"}
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
