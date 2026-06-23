'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import { timeAgo } from '@/lib/utils'
import { banishMember, adminSetPoints, updateGroupSettings } from '@/lib/firestore'
import { subscribeToCases, dismissCase } from '@/lib/appeals'
import type { Group, GroupMember, CourtCase, PlazaPreset } from '@/lib/types'

const Avatar3D = dynamic(() => import('@/components/Avatar/Avatar3D'), { ssr: false })

const TIMEZONES = [
  { label: 'Eastern (ET)', value: 'America/New_York' },
  { label: 'Central (CT)', value: 'America/Chicago' },
  { label: 'Mountain (MT)', value: 'America/Denver' },
  { label: 'Pacific (PT)', value: 'America/Los_Angeles' },
  { label: 'Hawaii', value: 'Pacific/Honolulu' },
  { label: 'London', value: 'Europe/London' },
  { label: 'Paris', value: 'Europe/Paris' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
  { label: 'Sydney', value: 'Australia/Sydney' },
  { label: 'UTC', value: 'UTC' },
]

type Props = {
  group: Group
  members: GroupMember[]
  currentUid: string
  chiefUid: string | null
  onClose: () => void
  onRefresh: () => void
}

const inputStyle: React.CSSProperties = {
  background: '#d4d4d4',
  borderRadius: 9999,
  border: 'none',
  outline: 'none',
  padding: '12px 18px',
  fontSize: 14,
  color: '#111',
  width: '100%',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 1,
  color: '#888',
  marginBottom: 6,
  marginTop: 0,
  display: 'block',
}

export default function AdminPanel({ group, members, currentUid, chiefUid, onClose, onRefresh }: Props) {
  const [section, setSection] = useState<'settings' | 'members' | 'court'>('settings')

  // Settings state
  const [name, setName] = useState(group.name)
  const [emoji, setEmoji] = useState(group.emoji ?? '🏠')
  const [description, setDescription] = useState(group.description)
  const [giveLimit, setGiveLimit] = useState(group.dailyGiveLimit ?? 100)
  const [takeLimit, setTakeLimit] = useState(group.dailyTakeLimit ?? 20)
  const [timezone, setTimezone] = useState(group.timezone ?? 'UTC')
  const [presets, setPresets] = useState<PlazaPreset[]>(group.presets ?? [])
  const [newPresetEmoji, setNewPresetEmoji] = useState('😊')
  const [newPresetLabel, setNewPresetLabel] = useState('')
  const [newPresetPts, setNewPresetPts] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)

  // Member management
  const [editingPoints, setEditingPoints] = useState<string | null>(null)
  const [newPointsVal, setNewPointsVal] = useState('')
  const [banishing, setBanishing] = useState<string | null>(null)

  // Court cases
  const [cases, setCases] = useState<CourtCase[]>([])

  useEffect(() => {
    const unsub = subscribeToCases(group.id, setCases)
    return unsub
  }, [group.id])

  async function saveSettings() {
    if (!name.trim()) return
    setSavingSettings(true)
    try {
      await updateGroupSettings(group.id, {
        name: name.trim(),
        emoji,
        description: description.trim(),
        dailyGiveLimit: giveLimit,
        dailyTakeLimit: takeLimit,
        timezone,
        presets,
      })
      onRefresh()
    } finally {
      setSavingSettings(false)
    }
  }

  function addPreset() {
    const pts = parseInt(newPresetPts, 10)
    if (!newPresetLabel.trim() || isNaN(pts) || pts === 0) return
    setPresets((prev) => [
      ...prev,
      { id: Date.now().toString(), emoji: newPresetEmoji.trim() || '⚡', label: newPresetLabel.trim(), points: pts },
    ])
    setNewPresetEmoji('😊')
    setNewPresetLabel('')
    setNewPresetPts('')
  }

  async function handleSetPoints(member: GroupMember) {
    const pts = parseInt(newPointsVal, 10)
    if (isNaN(pts)) return
    const adminMember = members.find((m) => m.uid === currentUid)
    await adminSetPoints(group.id, member.uid, pts, currentUid, adminMember?.displayName ?? 'Mayor', member.displayName)
    setEditingPoints(null)
    setNewPointsVal('')
    onRefresh()
  }

  async function handleBanish(member: GroupMember) {
    setBanishing(member.uid)
    try {
      await banishMember(group.id, member.uid)
      onRefresh()
    } finally {
      setBanishing(null)
    }
  }

  const activeCases = cases.filter((c) => ['in_court', 'pending_review'].includes(c.status))

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(380px, 100vw)',
        background: '#efefef', zIndex: 301,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #d4d4d4',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: '#efefef', zIndex: 1,
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: 0 }}>👑 Mayor Panel</h2>
            <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>{emoji} {group.name}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#d4d4d4', border: 'none', borderRadius: '50%',
              color: '#555', fontSize: 18, width: 34, height: 34,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, touchAction: 'manipulation',
            }}
          >
            ×
          </button>
        </div>

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 4, padding: 8, background: '#d4d4d4' }}>
          {(['settings', 'members', 'court'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 14,
                fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                touchAction: 'manipulation', textTransform: 'capitalize',
                background: section === s ? '#efefef' : 'transparent',
                color: section === s ? '#111' : '#777',
                boxShadow: section === s ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {s === 'court'
                ? `Court${activeCases.length > 0 ? ` (${activeCases.length})` : ''}`
                : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Settings ── */}
          {section === 'settings' && (
            <>
              {/* Emoji + Name row */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Emoji</label>
                  <input
                    type="text"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value.slice(-2) || '🏠')}
                    maxLength={2}
                    style={{
                      ...inputStyle,
                      width: 56,
                      textAlign: 'center',
                      fontSize: 22,
                      padding: '8px 0',
                      borderRadius: 14,
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Plaza Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} style={inputStyle} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                  rows={2}
                  style={{
                    ...inputStyle,
                    borderRadius: 16,
                    resize: 'none',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Give / Take limits */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Daily Give Limit</label>
                  <input
                    type="number"
                    value={giveLimit}
                    onChange={(e) => setGiveLimit(Math.max(10, parseInt(e.target.value) || 10))}
                    style={{ ...inputStyle, minWidth: 0 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Daily Take Limit</label>
                  <input
                    type="number"
                    value={takeLimit}
                    onChange={(e) => setTakeLimit(Math.max(5, parseInt(e.target.value) || 5))}
                    style={{ ...inputStyle, minWidth: 0 }}
                  />
                </div>
              </div>

              {/* Timezone */}
              <div>
                <label style={labelStyle}>Timezone</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} style={inputStyle}>
                  {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>

              {/* Quick Actions / Presets */}
              <div>
                <label style={labelStyle}>Quick Actions</label>
                {presets.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {presets.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: '#d4d4d4', borderRadius: 12, padding: '8px 14px',
                        }}
                      >
                        <span style={{ fontSize: 13, color: '#111' }}>{p.emoji} {p.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: p.points > 0 ? '#42b842' : '#e53e3e' }}>
                            {p.points > 0 ? `+${p.points}` : p.points}
                          </span>
                          <button
                            onClick={() => setPresets(prev => prev.filter(x => x.id !== p.id))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 14, padding: 0, lineHeight: 1, touchAction: 'manipulation' }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={newPresetEmoji}
                    onChange={(e) => setNewPresetEmoji(e.target.value.slice(-2))}
                    maxLength={2}
                    style={{ ...inputStyle, width: 52, textAlign: 'center', fontSize: 18, padding: '10px 0', borderRadius: 12, flexShrink: 0 }}
                  />
                  <input
                    type="text"
                    value={newPresetLabel}
                    onChange={(e) => setNewPresetLabel(e.target.value)}
                    placeholder="Label"
                    maxLength={50}
                    style={{ ...inputStyle, fontSize: 13, padding: '10px 14px' }}
                  />
                  <input
                    type="number"
                    value={newPresetPts}
                    onChange={(e) => setNewPresetPts(e.target.value)}
                    placeholder="pts"
                    style={{ ...inputStyle, width: 60, flexShrink: 0, padding: '10px 8px', textAlign: 'center', minWidth: 0 }}
                  />
                  <button
                    onClick={addPreset}
                    style={{
                      flexShrink: 0, width: 40, height: 40,
                      background: '#42b842', color: 'white', border: 'none',
                      borderRadius: 12, fontSize: 20, fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Save */}
              <button
                onClick={saveSettings}
                disabled={savingSettings || !name.trim()}
                style={{
                  background: '#42b842', color: 'white', borderRadius: 9999,
                  fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2,
                  fontSize: 15, padding: 14, width: '100%', border: 'none',
                  cursor: savingSettings || !name.trim() ? 'not-allowed' : 'pointer',
                  opacity: savingSettings || !name.trim() ? 0.5 : 1,
                  touchAction: 'manipulation',
                }}
              >
                {savingSettings ? 'Saving…' : 'Save Settings'}
              </button>
            </>
          )}

          {/* ── Members ── */}
          {section === 'members' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {members.map((m) => {
                const isSelf = m.uid === currentUid
                const isChief = m.uid === chiefUid
                return (
                  <div key={m.uid} style={{ background: '#d4d4d4', borderRadius: 16, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isSelf ? 0 : 10 }}>
                      <Avatar3D config={m.avatar ?? DEFAULT_AVATAR} size={38} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{m.displayName}</span>
                          {m.isAdmin && (
                            <span style={{ fontSize: 10, background: '#42b842', color: 'white', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>MAYOR</span>
                          )}
                          {isChief && (
                            <span style={{ fontSize: 10, background: '#f5a32d', color: 'white', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>CHIEF</span>
                          )}
                          {isSelf && <span style={{ fontSize: 10, color: '#888' }}>(you)</span>}
                        </div>
                        <span style={{ fontSize: 11, color: '#666' }}>{m.totalPoints} pts</span>
                      </div>
                    </div>

                    {!isSelf && (
                      editingPoints === m.uid ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="number"
                            value={newPointsVal}
                            onChange={(e) => setNewPointsVal(e.target.value)}
                            placeholder={String(m.totalPoints)}
                            style={{ ...inputStyle, flex: 1, background: '#efefef', minWidth: 0 }}
                          />
                          <button
                            onClick={() => handleSetPoints(m)}
                            style={{ flexShrink: 0, background: '#42b842', color: 'white', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingPoints(null); setNewPointsVal('') }}
                            style={{ flexShrink: 0, background: '#bbb', color: '#333', border: 'none', borderRadius: 10, padding: '8px 12px', fontSize: 12, cursor: 'pointer', touchAction: 'manipulation' }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => { setEditingPoints(m.uid); setNewPointsVal(String(m.totalPoints)) }}
                            style={{ flex: 1, background: '#efefef', border: 'none', borderRadius: 10, color: '#444', fontSize: 12, fontWeight: 600, padding: '8px 0', cursor: 'pointer', touchAction: 'manipulation' }}
                          >
                            ✏️ Set Points
                          </button>
                          <button
                            onClick={() => handleBanish(m)}
                            disabled={banishing === m.uid}
                            style={{ flex: 1, background: '#fee2e2', border: 'none', borderRadius: 10, color: '#e53e3e', fontSize: 12, fontWeight: 700, padding: '8px 0', cursor: banishing === m.uid ? 'default' : 'pointer', opacity: banishing === m.uid ? 0.6 : 1, touchAction: 'manipulation' }}
                          >
                            🚫 Banish
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Court ── */}
          {section === 'court' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeCases.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: 48 }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🏛️</div>
                  <p style={{ color: '#888', fontSize: 13, margin: 0 }}>No active court cases</p>
                </div>
              ) : (
                activeCases.map((c) => (
                  <div key={c.id} style={{ background: '#d4d4d4', borderRadius: 16, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>
                        {c.defendantName} vs {c.accuserName}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#e53e3e' }}>-{c.points} pts</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#555', fontStyle: 'italic', margin: '0 0 6px' }}>
                      &ldquo;{c.appealComment}&rdquo;
                    </p>
                    <p style={{ fontSize: 10, color: '#888', margin: '0 0 10px' }}>{timeAgo(c.createdAt)}</p>
                    <button
                      onClick={() => dismissCase(group.id, c.id)}
                      style={{
                        width: '100%', background: '#efefef', border: 'none', borderRadius: 10,
                        color: '#555', fontSize: 12, fontWeight: 600, padding: 9,
                        cursor: 'pointer', touchAction: 'manipulation',
                      }}
                    >
                      🚫 Dismiss Case
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        input::placeholder, textarea::placeholder { color: #999; }
      `}</style>
    </>
  )
}
