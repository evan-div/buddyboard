'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuth } from '@/contexts/AuthContext'

const CloudScene = dynamic(() => import('@/components/World/CloudScene'), { ssr: false })

type FormMode = 'signin' | 'signup'

const inputStyle: React.CSSProperties = {
  background: '#d4d4d4',
  borderRadius: 9999,
  border: 'none',
  outline: 'none',
  padding: '14px 24px',
  textAlign: 'center',
  fontSize: 16,
  color: '#111',
  width: '100%',
  boxSizing: 'border-box',
}

const greenBtnStyle: React.CSSProperties = {
  background: '#42b842',
  color: 'white',
  borderRadius: 9999,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 2,
  fontSize: 15,
  padding: 14,
  width: '100%',
  border: 'none',
  cursor: 'pointer',
}

const orangeBtnStyle: React.CSSProperties = {
  background: '#f5a32d',
  color: 'white',
  borderRadius: 9999,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 2,
  fontSize: 15,
  padding: 14,
  width: '100%',
  border: 'none',
  cursor: 'pointer',
}

export default function LandingPage() {
  const router = useRouter()
  const { user, loading, signInWithEmail, signUpWithEmail } = useAuth()

  const [mode, setMode] = useState<FormMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  function clearForm() {
    setEmail('')
    setPassword('')
    setDisplayName('')
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
      } else {
        if (!displayName.trim()) {
          setError('Display name is required.')
          setSubmitting(false)
          return
        }
        await signUpWithEmail(email, password, displayName.trim())
      }
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('Invalid email or password.')
      } else if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists.')
      } else if (msg.includes('weak-password')) {
        setError('Password must be at least 6 characters.')
      } else if (msg.includes('invalid-email')) {
        setError('Please enter a valid email address.')
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3476c8' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', animation: 'pulse 1.5s infinite' }} />
      </div>
    )
  }

  if (user) {
    return null
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <CloudScene />
      </div>

      {/* Card */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'calc(100% - 48px)',
          maxWidth: 360,
          zIndex: 10,
          background: '#efefef',
          borderRadius: 28,
          padding: 32,
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
      >
        {/* Title */}
        <h1
          style={{
            color: '#111',
            fontWeight: 900,
            fontSize: 36,
            textAlign: 'center',
            marginBottom: 32,
            marginTop: 8,
          }}
        >
          BuddyBoard
        </h1>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          {mode === 'signup' && (
            <div style={{ marginBottom: 16 }}>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="display name"
                required
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email/username"
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              required
              minLength={6}
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ color: '#e53e3e', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
              {error}
            </p>
          )}

          {mode === 'signin' ? (
            <>
              <button
                type="submit"
                disabled={submitting}
                style={{ ...greenBtnStyle, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Signing in...' : 'LOGIN'}
              </button>

              <div style={{ marginTop: 32, textAlign: 'center' }}>
                <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
                  Don&apos;t have an account?
                </p>
                <button
                  type="button"
                  onClick={() => { setMode('signup'); clearForm() }}
                  style={orangeBtnStyle}
                >
                  SIGN UP
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="submit"
                disabled={submitting}
                style={{ ...greenBtnStyle, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Creating account...' : 'SIGN UP'}
              </button>

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => { setMode('signin'); clearForm() }}
                  style={orangeBtnStyle}
                >
                  GO BACK
                </button>
              </div>
            </>
          )}
        </form>
      </div>

      <style>{`
        input::placeholder { color: #999; }
      `}</style>
    </div>
  )
}
