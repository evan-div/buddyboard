'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import CloudScene from '@/components/World/CloudScene'
import CloudWipe from '@/components/World/CloudWipe'
import type { WipePhase } from '@/components/World/CloudWipe'
import dynamic from 'next/dynamic'
import { getUserGroups, joinGroup, getGroup, getGroupMembers } from '@/lib/firestore'
import CreateGroupModal from '@/components/Group/CreateGroupModal'
import type { Group, GroupMember } from '@/lib/types'

const Avatar3D = dynamic(() => import('@/components/Avatar/Avatar3D'), { ssr: false })

// ─── Join Group Modal ─────────────────────────────────────────────────────────

type WelcomeData = { group: Group; members: GroupMember[]; groupId: string }

type JoinGroupModalProps = {
  onClose: () => void
  onJoined: (groupId: string) => void
  user: { uid: string; displayName: string; avatar: import('@/lib/types').AvatarConfig; email: string; createdAt: Date; groups: string[] }
}

function JoinGroupModal({ onClose, onJoined, user }: JoinGroupModalProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [welcome, setWelcome] = useState<WelcomeData | null>(null)

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
      const [group, members] = await Promise.all([
        getGroup(groupId),
        getGroupMembers(groupId),
      ])
      if (group) {
        setWelcome({ group, members, groupId })
      } else {
        onJoined(groupId)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join group.')
    } finally {
      setLoading(false)
    }
  }

  if (welcome) {
    const { group, members } = welcome
    const giveLimit = group.dailyGiveLimit ?? 100
    const takeLimit = group.dailyTakeLimit ?? 20

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)', padding: '28px 24px 20px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 8 }}>
                {group.emoji || '🏠'}
              </div>
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
                {group.name}
              </div>
              {group.description && (
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 6 }}>
                  {group.description}
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: '20px 24px 24px', overflowY: 'auto', maxHeight: 380 }}>
            {/* Daily limits */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>+{giveLimit}</div>
                <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600, marginTop: 2 }}>pts/day to give</div>
              </div>
              <div style={{ flex: 1, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#ea580c' }}>−{takeLimit}</div>
                <div style={{ fontSize: 11, color: '#c2410c', fontWeight: 600, marginTop: 2 }}>pts/day to take</div>
              </div>
            </div>

            {/* Members */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                {members.length} {members.length === 1 ? 'Member' : 'Members'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {members.map((m) => (
                  <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar3D config={m.avatar} size={36} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
                        {m.displayName}
                        {m.uid === user.uid && (
                          <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, marginLeft: 6 }}>You</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>
                        {m.totalPoints} pts
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Great button */}
            <button
              onClick={() => onJoined(welcome.groupId)}
              style={{
                width: '100%',
                padding: '14px',
                background: '#22c55e',
                color: '#fff',
                fontWeight: 800,
                fontSize: 16,
                borderRadius: 14,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(34,197,94,0.35)',
              }}
            >
              Great! 🎉
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#efefef',
          borderRadius: 28,
          padding: 32,
          maxWidth: 360,
          width: '100%',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
      >
        <h2
          style={{
            color: '#111',
            fontWeight: 900,
            fontSize: 28,
            textAlign: 'center',
            marginBottom: 24,
          }}
        >
          Join a Group
        </h2>

        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ABC123"
            maxLength={6}
            style={{
              background: '#d4d4d4',
              borderRadius: 9999,
              border: 'none',
              outline: 'none',
              padding: '14px 24px',
              textAlign: 'center',
              fontSize: 20,
              color: '#111',
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: 'monospace',
              letterSpacing: 4,
              textTransform: 'uppercase',
            }}
          />

          {error && (
            <p style={{ color: '#e53e3e', fontSize: 13, textAlign: 'center', margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || code.trim().length !== 6}
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
              cursor: loading || code.trim().length !== 6 ? 'not-allowed' : 'pointer',
              opacity: loading || code.trim().length !== 6 ? 0.6 : 1,
            }}
          >
            {loading ? 'Joining...' : 'JOIN GROUP'}
          </button>

          <button
            type="button"
            onClick={onClose}
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
            GO BACK
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

const whiteBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)',
  color: '#111',
  borderRadius: 16,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 1,
  fontSize: 17,
  padding: 18,
  width: '100%',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, userProfile, loading: authLoading } = useAuth()

  const [view, setView] = useState<'welcome' | 'groups'>('welcome')
  const [groups, setGroups] = useState<Group[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [wipePhase, setWipePhase] = useState<WipePhase>('idle')
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.push('/')
  }, [user, authLoading, router])

  // Fetch groups each time the groups view is opened
  useEffect(() => {
    if (view !== 'groups' || !user) return
    setLoadingGroups(true)
    setGroupsError(null)

    const timeoutId = setTimeout(() => {
      setLoadingGroups(false)
      setGroupsError('Taking too long — check your connection and try again.')
    }, 8000)

    getUserGroups(user.uid)
      .then(userGroups => {
        clearTimeout(timeoutId)
        setGroups(userGroups)
      })
      .catch(err => {
        clearTimeout(timeoutId)
        console.error('Error loading groups:', err)
        setGroupsError('Failed to load groups. Please try again.')
      })
      .finally(() => {
        clearTimeout(timeoutId)
        setLoadingGroups(false)
      })

    return () => clearTimeout(timeoutId)
  }, [view, user])

  function handleMyGroups() {
    setView('groups')
  }

  function startWipe(groupId: string) {
    setPendingGroupId(groupId)
    setWipePhase('entering')
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

      {/* Centered floating content */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>

        {view === 'welcome' ? (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'calc(100% - 48px)',
              maxWidth: 320,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <h1
              style={{
                color: '#111',
                fontWeight: 900,
                fontSize: 30,
                textAlign: 'center',
                marginBottom: 8,
                width: '100%',
              }}
            >
              Hey, {userProfile.displayName}!
            </h1>

            <button onClick={handleMyGroups} style={whiteBtnStyle}>
              MY GROUPS
            </button>
            <button onClick={() => setShowCreate(true)} style={whiteBtnStyle}>
              NEW GROUP
            </button>
            <button onClick={() => setShowJoin(true)} style={whiteBtnStyle}>
              JOIN GROUP
            </button>
            <button onClick={() => router.push('/profile')} style={whiteBtnStyle}>
              SETTINGS
            </button>
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'calc(100% - 48px)',
              maxWidth: 320,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <h2
              style={{
                color: '#111',
                fontWeight: 900,
                fontSize: 24,
                textAlign: 'center',
                width: '100%',
                marginBottom: 0,
              }}
            >
              My Groups
            </h2>

            {loadingGroups ? (
              <>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgba(255,255,255,0.6)',
                      borderRadius: 16,
                      height: 62,
                      width: '100%',
                    }}
                  />
                ))}
              </>
            ) : groupsError ? (
              <>
                <p style={{ color: '#c0392b', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>
                  {groupsError}
                </p>
                <button
                  onClick={() => { setView('welcome'); setTimeout(() => setView('groups'), 50) }}
                  style={{ ...whiteBtnStyle, fontSize: 14, padding: 14 }}
                >
                  ↻ Retry
                </button>
              </>
            ) : groups.length === 0 ? (
              <>
                <p style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>No groups yet</p>
                <button
                  onClick={() => setShowJoin(true)}
                  style={{ ...whiteBtnStyle, fontSize: 14, padding: 14 }}
                >
                  Join a Group
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  style={{ ...whiteBtnStyle, fontSize: 14, padding: 14 }}
                >
                  Create Group
                </button>
              </>
            ) : (
              <>
                {groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => startWipe(group.id)}
                    style={whiteBtnStyle}
                  >
                    {group.name}
                  </button>
                ))}
              </>
            )}

            <button
              onClick={() => setView('welcome')}
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
              ← BACK
            </button>
          </div>
        )}
      </div>

      <CloudWipe
        phase={wipePhase}
        onCovered={() => { if (pendingGroupId) router.push(`/group/${pendingGroupId}`) }}
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
