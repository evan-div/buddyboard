'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import CloudScene from '@/components/World/CloudScene'
import CloudWipe from '@/components/World/CloudWipe'
import type { WipePhase } from '@/components/World/CloudWipe'
import { getUserGroups, joinGroup } from '@/lib/firestore'
import CreateGroupModal from '@/components/Group/CreateGroupModal'
import type { Group } from '@/lib/types'

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
  background: 'white',
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
    getUserGroups(user.uid)
      .then(userGroups => setGroups(userGroups))
      .catch(err => console.error('Error loading groups:', err))
      .finally(() => setLoadingGroups(false))
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
                    className="animate-pulse"
                    style={{
                      background: 'rgba(255,255,255,0.6)',
                      borderRadius: 16,
                      height: 62,
                      width: '100%',
                    }}
                  />
                ))}
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
