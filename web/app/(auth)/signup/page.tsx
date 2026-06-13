"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Something went wrong.")
      setLoading(false)
      return
    }

    // Auto sign-in after signup
    const signInRes = await signIn("credentials", { email, password, redirect: false })
    setLoading(false)

    if (signInRes?.error) {
      setError("Account created but sign-in failed. Try logging in.")
    } else {
      router.push("/onboarding")
    }
  }

  const inputStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "var(--foreground)",
  }

  return (
    <div className="card-glass rounded-2xl w-full max-w-sm p-8 animate-fade-up">
      <div className="mb-8 text-center">
        <div
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4"
          style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}
        >
          <span style={{ fontSize: "1.2rem" }}>🏈</span>
        </div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          Create your account
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Get your AI-powered dynasty GM
        </p>
      </div>

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

        <div className="flex flex-col gap-1.5">
          <label className="label-section">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder="Your display name"
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "rgba(34,197,94,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="label-section">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            minLength={8}
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
          className="w-full rounded-lg py-2.5 text-sm font-medium transition-all mt-1"
          style={{
            background: loading ? "rgba(34,197,94,0.3)" : "rgba(34,197,94,0.85)",
            color: "#000",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="mt-6 text-center text-xs" style={{ color: "var(--muted)" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--accent)" }}>
          Sign in
        </Link>
      </div>
    </div>
  )
}
