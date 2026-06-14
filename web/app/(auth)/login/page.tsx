"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    if (res?.error) {
      setLoading(false)
      setError("Invalid email or password.")
      return
    }

    // Apply the session-persistence choice before navigating.
    await fetch("/api/auth/remember", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remember: keepSignedIn }),
    }).catch(() => {})

    setLoading(false)
    router.push("/")
  }

  return (
    <div className="card-glass rounded-2xl w-full max-w-sm p-8 animate-fade-up">
      {/* Logo / brand */}
      <div className="mb-8 text-center">
        <div
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4"
          style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}
        >
          <span style={{ fontSize: "1.2rem" }}>🏈</span>
        </div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          Dynasty AI GM
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Sign in to your account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="label-section" style={{ color: "var(--muted)" }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "var(--foreground)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(34,197,94,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="label-section" style={{ color: "var(--muted)" }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "var(--foreground)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(34,197,94,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
          />
        </div>

        {error && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ color: "var(--danger)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-between -mt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "var(--muted)" }}>
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="cursor-pointer"
              style={{ accentColor: "var(--accent)" }}
            />
            Keep me signed in
          </label>
          <Link href="/forgot-password" className="text-xs" style={{ color: "var(--muted)" }}>
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg py-2.5 text-sm font-medium transition-all mt-1"
          style={{
            background: loading ? "rgba(34,197,94,0.3)" : "rgba(34,197,94,0.85)",
            color: "#000",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-6 text-center text-xs" style={{ color: "var(--muted)" }}>
        Don&apos;t have an account?{" "}
        <Link href="/signup" style={{ color: "var(--accent)" }}>
          Create one
        </Link>
      </div>
    </div>
  )
}
