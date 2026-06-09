'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuth } from '@/contexts/AuthContext'
import AvatarBuilder from '@/components/Avatar/AvatarBuilder'
import { updateUserAvatar, updateUserDisplayName } from '@/lib/firestore'
import type { AvatarConfig } from '@/lib/types'

const CloudScene = dynamic(() => import('@/components/World/CloudScene'), { ssr: false })

export default function ProfilePage() {
  const router = useRouter()
  const { user, userProfile, loading: authLoading, signOut } = useAuth()

  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState('')

  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarDraft, setAvatarDraft] = useState<AvatarConfig | null>(null)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [user, authLoading, router])

  // Populate fields from profile on first load
  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName ?? '')
      if (!avatarDraft) setAvatarDraft(userProfile.avatar)
    }
  }, [userProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    const trimmed = displayName.trim()
    if (!trimmed) {
      setNameError('Display name cannot be empty.')
      return
    }
    if (trimmed.length > 30) {
      setNameError('Display name must be 30 characters or less.')
      return
    }
    setNameError('')
    setSavingName(true)
    try {
      await updateUserDisplayName(user.uid, trimmed)
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : 'Failed to save name.')
    } finally {
      setSavingName(false)
    }
  }

  function handleAvatarChange(newAvatar: AvatarConfig) {
    if (!user) return
    setAvatarDraft(newAvatar)
    setAvatarSaving(true)
    updateUserAvatar(user.uid, newAvatar)
      .catch((err) => console.error('Error saving avatar:', err))
      .finally(() => setAvatarSaving(false))
  }

  async function handleSignOut() {
    await signOut()
    router.push('/')
  }

  if (authLoading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3476c8' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: '#efefef',
              animation: 'pulse 1.5s infinite',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: '#111', fontWeight: 700, fontSize: 12 }}>BB</span>
          </div>
          <p style={{ color: 'white', fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user || !userProfile) return null

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <CloudScene />
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 10, minHeight: '100vh', padding: '20px 20px 40px' }}>

        {/* Header */}
        <div
          style={{
            background: 'rgba(239,239,239,0.85)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderRadius: 16,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            onClick={() => router.push('/dashboard')}
            aria-label="Back"
            style={{
              color: '#111',
              background: 'none',
              border: 'none',
              fontSize: 20,
              fontWeight: 700,
              cursor: 'pointer',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ←
          </button>
          <h1 style={{ color: '#111', fontWeight: 800, fontSize: 18, margin: 0, flex: 1 }}>Edit Profile</h1>
          {avatarSaving && (
            <span style={{ color: '#999', fontSize: 12 }}>Saving avatar...</span>
          )}
        </div>

        {/* Display Name Section */}
        <div
          style={{
            background: '#efefef',
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <h2 style={{ color: '#111', fontWeight: 700, fontSize: 14, marginBottom: 12, marginTop: 0 }}>Display Name</h2>

          <form onSubmit={handleSaveName} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                setNameError('')
                setNameSaved(false)
              }}
              placeholder="Your display name"
              maxLength={30}
              style={{
                background: '#d4d4d4',
                borderRadius: 9999,
                border: 'none',
                outline: 'none',
                padding: '14px 24px',
                fontSize: 16,
                color: '#111',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />

            {nameError && (
              <p style={{ color: '#e53e3e', fontSize: 13, margin: 0 }}>{nameError}</p>
            )}

            {nameSaved && (
              <p style={{ color: '#42b842', fontSize: 13, margin: 0 }}>Saved!</p>
            )}

            <button
              type="submit"
              disabled={savingName || displayName.trim() === userProfile.displayName}
              style={{
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
                cursor: savingName || displayName.trim() === userProfile.displayName ? 'not-allowed' : 'pointer',
                opacity: savingName || displayName.trim() === userProfile.displayName ? 0.5 : 1,
              }}
            >
              {savingName ? 'Saving...' : 'Save Name'}
            </button>
          </form>
        </div>

        {/* Avatar Builder Section */}
        <div
          style={{
            background: '#efefef',
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <h2 style={{ color: '#111', fontWeight: 700, fontSize: 14, marginBottom: 12, marginTop: 0 }}>Customize Avatar</h2>
          <AvatarBuilder
            value={avatarDraft ?? userProfile.avatar}
            onChange={handleAvatarChange}
          />
        </div>

        {/* Account info */}
        <div
          style={{
            background: '#efefef',
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <h2 style={{ color: '#111', fontWeight: 700, fontSize: 14, marginBottom: 12, marginTop: 0 }}>Account</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#555', fontSize: 14 }}>Email</span>
              <span style={{ color: '#111', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                {userProfile.email}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#555', fontSize: 14 }}>Member since</span>
              <span style={{ color: '#111', fontSize: 14 }}>
                {userProfile.createdAt
                  ? new Date(userProfile.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Sign Out */}
        <div
          style={{
            background: '#efefef',
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <button
            onClick={handleSignOut}
            style={{
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
            }}
          >
            Sign Out
          </button>
        </div>

      </div>

      <style>{`
        input::placeholder { color: #999; }
      `}</style>
    </div>
  )
}
