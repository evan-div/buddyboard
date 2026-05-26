'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import GroupCard from '@/components/GroupCard'
import AvatarDisplay from '@/components/Avatar/AvatarDisplay'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import { getUserGroups, createGroup, joinGroup, getGroupMembers } from '@/lib/firestore'
import type { Group, GroupMember } from '@/lib/types'

// ─── Skeleton ────────────────────────────────────────────────────────────────

function GroupCardSkeleton() {
  return (
    <div className="w-full bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 animate-pulse">
      <div className="h-2 bg-gray-700" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-700 rounded w-3/4" />
        <div className="h-3 bg-gray-800 rounded w-full" />
        <div className="flex items-center justify-between mt-4">
          <div className="h-3 bg-gray-800 rounded w-24" />
          <div className="h-4 bg-gray-800 rounded w-16" />
        </div>
      </div>
    </div>
  )
}

// ─── Create Group Modal ────────────────────────────────────────────────────────

type CreateGroupModalProps = {
  onClose: () => void
  onCreated: (groupId: string) => void
  userUid: string
}

function CreateGroupModal({ onClose, onCreated, userUid }: CreateGroupModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Group name is required.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const groupId = await createGroup(userUid, name.trim(), description.trim())
      onCreated(groupId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create group.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Create a Group</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1.5 font-medium">
              Group Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Study Squad"
              maxLength={50}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1.5 font-medium">
              Description <span className="text-gray-600 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this group about?"
              maxLength={200}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
          >
            {loading ? 'Creating...' : 'Create Group'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Join Group Modal ─────────────────────────────────────────────────────────

type JoinGroupModalProps = {
  onClose: () => void
  onJoined: (groupId: string) => void
  user: { uid: string; displayName: string; avatar: import('@/lib/types').AvatarConfig; email: string; createdAt: Date; groups: string[] }
}

function JoinGroupModal({ onClose, onJoined, user }: JoinGroupModalProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim().length !== 6) {
      setError('Please enter a valid 6-character invite code.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const groupId = await joinGroup(code.trim(), user)
      onJoined(groupId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join group.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Join a Group</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1.5 font-medium">
              Invite Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="ABC123"
              maxLength={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors uppercase tracking-widest text-center text-lg font-mono"
            />
            <p className="text-gray-600 text-xs mt-1.5 text-center">
              Ask a friend for their group invite code
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || code.trim().length !== 6}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
          >
            {loading ? 'Joining...' : 'Join Group'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const { user, userProfile, loading: authLoading, signOut } = useAuth()

  const [groups, setGroups] = useState<Group[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, GroupMember | null>>({})
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [user, authLoading, router])

  // Load groups
  useEffect(() => {
    if (!user) return

    async function loadGroups() {
      setLoadingGroups(true)
      try {
        const userGroups = await getUserGroups(user!.uid)
        setGroups(userGroups)

        // Fetch current user's member data for each group (for points display)
        const entries = await Promise.all(
          userGroups.map(async (g) => {
            try {
              const members = await getGroupMembers(g.id)
              const myMember = members.find((m) => m.uid === user!.uid) ?? null
              return [g.id, myMember] as [string, GroupMember | null]
            } catch {
              return [g.id, null] as [string, GroupMember | null]
            }
          })
        )
        setMemberMap(Object.fromEntries(entries))
      } catch (err) {
        console.error('Error loading groups:', err)
      } finally {
        setLoadingGroups(false)
      }
    }

    loadGroups()
  }, [user])

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      router.push('/')
    } catch {
      setSigningOut(false)
    }
  }

  function handleGroupCreated(groupId: string) {
    setShowCreate(false)
    router.push(`/group/${groupId}`)
  }

  function handleGroupJoined(groupId: string) {
    setShowJoin(false)
    router.push(`/group/${groupId}`)
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
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          {/* Left: avatar + name */}
          <button
            onClick={() => router.push('/profile')}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <AvatarDisplay
              config={userProfile.avatar ?? DEFAULT_AVATAR}
              size={40}
            />
            <div className="text-left">
              <p className="text-white font-semibold text-sm leading-tight">
                {userProfile.displayName}
              </p>
              <p className="text-gray-500 text-xs">Edit profile</p>
            </div>
          </button>

          {/* Right: sign out */}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-gray-400 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-all disabled:opacity-50"
          >
            {signingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Page title + action buttons */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">My Groups</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {groups.length} {groups.length === 1 ? 'group' : 'groups'}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowJoin(true)}
              className="px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium transition-all"
            >
              Join
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20"
            >
              + Create
            </button>
          </div>
        </div>

        {/* Groups grid */}
        {loadingGroups ? (
          <div className="grid grid-cols-1 gap-3">
            {[1, 2, 3].map((i) => (
              <GroupCardSkeleton key={i} />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🎯</div>
            <h3 className="text-white font-bold text-lg mb-2">No groups yet</h3>
            <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
              Create one or join a friend&apos;s group to start rewarding each other!
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowJoin(true)}
                className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium transition-all"
              >
                Join Group
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20"
              >
                Create Group
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                member={memberMap[group.id]}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={handleGroupCreated}
          userUid={user.uid}
        />
      )}

      {showJoin && userProfile && (
        <JoinGroupModal
          onClose={() => setShowJoin(false)}
          onJoined={handleGroupJoined}
          user={userProfile}
        />
      )}
    </div>
  )
}
