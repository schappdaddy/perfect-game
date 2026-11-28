'use client'
// Sign-in gate: the app only loads after you sign in with your Supabase account.
// Needed before row-level security is turned on, because the database will then
// only answer signed-in users.
import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return null
  if (session) return <>{children}</>

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  const box: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #ccc', borderRadius: 8, fontSize: 15, marginBottom: 10, boxSizing: 'border-box' }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <form onSubmit={signIn} style={{ width: 320, padding: 28, border: '1px solid #e5e5e5', borderRadius: 12 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 18px' }}>DeckTech</h1>
        <input style={box} type="email" placeholder="Email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
        <input style={box} type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <div style={{ color: '#b00020', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <button type="submit" disabled={busy} style={{ ...box, marginBottom: 0, background: '#111', color: '#fff', cursor: 'pointer' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
