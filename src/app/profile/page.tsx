'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import AvatarBuilder from '@/components/Avatar/AvatarBuilder'
import { updateUserAvatar, updateUserDisplayName } from '@/lib/firestore'
import type { AvatarConfig } from '@/lib/types'

export default function ProfilePage() {
  const router = useRouter()
  const { user, userProfile, loading: authLoading } = useAuth()

  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState('')

  const [avatarSaving, setAvatarSaving] = useState(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [user, authLoading, router])

  // Populate display name from profile
  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName ?? '')
    }
  }, [userProfile])

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
    setAvatarSaving(true)
    updateUserAvatar(user.uid, newAvatar)
      .catch((err) => console.error('Error saving avatar:', err))
      .finally(() => setAvatarSaving(false))
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f13]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-sm">BB</span>
          </div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user || !userProfile) return null

  return (
    <div className="min-h-screen bg-[#0f0f13]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0f0f13]/90 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800"
            aria-label="Back"
          >
            ←
          </button>
          <h1 className="text-white font-bold text-base">Edit Profile</h1>
          {avatarSaving && (
            <span className="ml-auto text-gray-500 text-xs">Saving avatar...</span>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Display Name Section */}
        <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <h2 className="text-white font-semibold text-sm mb-3">Display Name</h2>

          <form onSubmit={handleSaveName} className="flex flex-col gap-3">
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
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />

            {nameError && (
              <p className="text-red-400 text-xs">{nameError}</p>
            )}

            <button
              type="submit"
              disabled={savingName || displayName.trim() === userProfile.displayName}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                nameSaved
                  ? 'bg-green-600 text-white'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/20'
              }`}
            >
              {savingName ? 'Saving...' : nameSaved ? '✓ Saved!' : 'Save Name'}
            </button>
          </form>
        </section>

        {/* Avatar Builder Section */}
        <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <h2 className="text-white font-semibold text-sm mb-4">Customize Avatar</h2>
          <AvatarBuilder
            value={userProfile.avatar}
            onChange={handleAvatarChange}
          />
        </section>

        {/* Account info */}
        <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <h2 className="text-white font-semibold text-sm mb-3">Account</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Email</span>
              <span className="text-gray-300 text-sm truncate max-w-[200px]">
                {userProfile.email}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Member since</span>
              <span className="text-gray-300 text-sm">
                {userProfile.createdAt
                  ? new Date(userProfile.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
