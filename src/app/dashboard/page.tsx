'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import CloudScene from '@/components/World/CloudScene'
import { getUserGroups, createGroup, joinGroup } from '@/lib/firestore'
import type { Group } from '@/lib/types'

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
  const { user, userProfile, loading: authLoading } = useAuth()

  const [view, setView] = useState<'welcome' | 'groups'>('welcome')
  const [groups, setGroups] = useState<Group[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [groupsFetched, setGroupsFetched] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.push('/')
  }, [user, authLoading, router])

  useEffect(() => {
    if (!transitioning || !pendingGroupId) return
    const timer = setTimeout(() => {
      router.push(`/group/${pendingGroupId}`)
    }, 700)
    return () => clearTimeout(timer)
  }, [transitioning, pendingGroupId, router])

  async function fetchGroups() {
    if (!user || groupsFetched) return
    setLoadingGroups(true)
    try {
      const userGroups = await getUserGroups(user.uid)
      setGroups(userGroups)
      setGroupsFetched(true)
    } catch (err) {
      console.error('Error loading groups:', err)
    } finally {
      setLoadingGroups(false)
    }
  }

  function handleMyGroups() {
    fetchGroups()
    setView('groups')
  }

  function startWipe(groupId: string) {
    setPendingGroupId(groupId)
    setTransitioning(true)
  }

  function handleGroupCreated(groupId: string) {
    setShowCreate(false)
    startWipe(groupId)
  }

  function handleGroupJoined(groupId: string) {
    setShowJoin(false)
    startWipe(groupId)
  }

  if (authLoading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3476c8' }}>
        <div className="w-10 h-10 rounded-full bg-white/30 animate-pulse" />
      </div>
    )
  }

  if (!user || !userProfile) return null

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <CloudScene />

      {/* Centered card */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div className="w-full max-w-[300px] bg-white rounded-2xl shadow-2xl p-7">

          {view === 'welcome' ? (
            <>
              <div className="text-center mb-5">
                <h1 className="text-xl font-extrabold text-gray-900 leading-tight mb-1.5">
                  Welcome to BuddyBoard!
                </h1>
                <p className="text-sm text-gray-500">
                  Hey, {userProfile.displayName}!
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleMyGroups}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all"
                >
                  My Groups
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  className="w-full py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 transition-all"
                >
                  New Group
                </button>
                <button
                  onClick={() => setShowJoin(true)}
                  className="w-full py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 transition-all"
                >
                  Join Group
                </button>
                <button
                  onClick={() => router.push('/profile')}
                  className="w-full py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 transition-all"
                >
                  Settings
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setView('welcome')}
                  className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none p-0.5"
                >
                  ←
                </button>
                <h2 className="text-lg font-bold text-gray-900">My Groups</h2>
              </div>

              {loadingGroups ? (
                <div className="space-y-0.5">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="h-4 bg-gray-200 rounded w-32" />
                      <div className="h-3 bg-gray-100 rounded w-16" />
                    </div>
                  ))}
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-gray-400 text-sm mb-4">No groups yet</p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => setShowJoin(true)}
                      className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-all"
                    >
                      Join
                    </button>
                    <button
                      onClick={() => setShowCreate(true)}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold transition-all"
                    >
                      Create
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {groups.map((group, i) => (
                    <button
                      key={group.id}
                      onClick={() => startWipe(group.id)}
                      className={`w-full text-left flex items-center justify-between py-3 px-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors ${i < groups.length - 1 ? 'border-b border-gray-100' : ''}`}
                    >
                      <span className="font-semibold text-gray-900 text-sm">{group.name}</span>
                      <span className="text-xs text-gray-400">
                        {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* Cloud wipe overlay */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'white',
          opacity: transitioning ? 1 : 0,
          transition: 'opacity 0.6s ease-in',
          pointerEvents: transitioning ? 'auto' : 'none',
        }}
      />

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
