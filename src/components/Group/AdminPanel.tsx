'use client'

import { useState, useEffect } from 'react'
import AvatarDisplay from '@/components/Avatar/AvatarDisplay'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import { timeAgo } from '@/lib/utils'
import { banishMember, adminSetPoints, updateGroupSettings } from '@/lib/firestore'
import { subscribeToCases, dismissCase } from '@/lib/appeals'
import type { Group, GroupMember, CourtCase, PlazaPreset } from '@/lib/types'

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

  const INPUT = "bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm w-full"
  const activeCases = cases.filter((c) => ['in_court', 'pending_review'].includes(c.status))

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(380px, 100vw)',
        background: '#0f0f13', borderLeft: '1px solid #1f2937', zIndex: 301,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#0f0f13', zIndex: 1 }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#f9fafb', margin: 0 }}>👑 Mayor Panel</h2>
            <p style={{ fontSize: '11px', color: '#6366f1', margin: '2px 0 0' }}>{emoji} {group.name}</p>
          </div>
          <button onClick={onClose} style={{ background: '#1f2937', border: 'none', borderRadius: '8px', color: '#9ca3af', fontSize: '18px', width: '34px', height: '34px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Section tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1f2937', padding: '0 12px' }}>
          {(['settings', 'members', 'court'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              style={{
                flex: 1, padding: '10px 4px', fontSize: '12px', fontWeight: 700,
                color: section === s ? '#818cf8' : '#6b7280',
                borderBottom: `2px solid ${section === s ? '#818cf8' : 'transparent'}`,
                background: 'none', border: 'none', cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s === 'court' ? `Court${activeCases.length > 0 ? ` (${activeCases.length})` : ''}` : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ padding: '16px', flex: 1 }}>

          {/* ── Settings ── */}
          {section === 'settings' && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1 font-medium">Emoji</label>
                  <input type="text" value={emoji} onChange={(e) => setEmoji(e.target.value.slice(-2) || '🏠')} maxLength={2} className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-center text-xl w-16 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-gray-400 text-xs mb-1 font-medium">Plaza Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} className={INPUT} />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1 font-medium">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={2} className={`${INPUT} resize-none`} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1 font-medium">Daily Give Limit</label>
                  <input type="number" value={giveLimit} onChange={(e) => setGiveLimit(Math.max(10, parseInt(e.target.value) || 10))} className={INPUT} />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1 font-medium">Daily Take Limit</label>
                  <input type="number" value={takeLimit} onChange={(e) => setTakeLimit(Math.max(5, parseInt(e.target.value) || 5))} className={INPUT} />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1 font-medium">Timezone</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={INPUT}>
                  {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>

              {/* Presets editor */}
              <div>
                <label className="block text-gray-400 text-xs mb-2 font-medium">Quick Actions</label>
                {presets.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {presets.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-1.5">
                        <span className="text-white text-sm">{p.emoji} {p.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${p.points > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {p.points > 0 ? `+${p.points}` : p.points}
                          </span>
                          <button onClick={() => setPresets(prev => prev.filter(x => x.id !== p.id))} className="text-gray-500 hover:text-red-400 text-sm">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <input type="text" value={newPresetEmoji} onChange={(e) => setNewPresetEmoji(e.target.value.slice(-2))} maxLength={2} className="w-12 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-center focus:outline-none focus:border-indigo-500" />
                  <input type="text" value={newPresetLabel} onChange={(e) => setNewPresetLabel(e.target.value)} placeholder="Label" maxLength={50} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
                  <input type="number" value={newPresetPts} onChange={(e) => setNewPresetPts(e.target.value)} placeholder="pts" className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-indigo-500" />
                  <button onClick={addPreset} className="px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold">+</button>
                </div>
              </div>

              <button
                onClick={saveSettings}
                disabled={savingSettings || !name.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm transition-all"
              >
                {savingSettings ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          )}

          {/* ── Members ── */}
          {section === 'members' && (
            <div className="space-y-3">
              {members.map((m) => {
                const isSelf = m.uid === currentUid
                const isChief = m.uid === chiefUid
                return (
                  <div key={m.uid} style={{ background: '#1a1a22', borderRadius: '12px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <AvatarDisplay config={m.avatar ?? DEFAULT_AVATAR} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          <p style={{ fontSize: '13px', fontWeight: 700, color: '#f9fafb', margin: 0 }}>{m.displayName}</p>
                          {m.isAdmin && <span style={{ fontSize: '10px', background: '#312e81', color: '#818cf8', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>MAYOR</span>}
                          {isChief && <span style={{ fontSize: '10px', background: '#422006', color: '#fbbf24', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>CHIEF</span>}
                          {isSelf && <span style={{ fontSize: '10px', color: '#6b7280' }}>(you)</span>}
                        </div>
                        <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>{m.totalPoints} pts</p>
                      </div>
                    </div>

                    {!isSelf && (
                      <>
                        {editingPoints === m.uid ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              type="number"
                              value={newPointsVal}
                              onChange={(e) => setNewPointsVal(e.target.value)}
                              placeholder={String(m.totalPoints)}
                              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                            />
                            <button onClick={() => handleSetPoints(m)} className="px-3 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs font-bold">Save</button>
                            <button onClick={() => { setEditingPoints(null); setNewPointsVal('') }} className="px-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs">✕</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => { setEditingPoints(m.uid); setNewPointsVal(String(m.totalPoints)) }} style={{ flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#9ca3af', fontSize: '11px', fontWeight: 600, padding: '6px', cursor: 'pointer' }}>
                              ✏️ Set Points
                            </button>
                            <button
                              onClick={() => handleBanish(m)}
                              disabled={banishing === m.uid}
                              style={{ flex: 1, background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: '8px', color: '#f87171', fontSize: '11px', fontWeight: 700, padding: '6px', cursor: banishing === m.uid ? 'default' : 'pointer', opacity: banishing === m.uid ? 0.6 : 1 }}
                            >
                              🚫 Banish
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Court ── */}
          {section === 'court' && (
            <div className="space-y-3">
              {activeCases.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: '40px' }}>
                  <div style={{ fontSize: '36px', marginBottom: '10px' }}>🏛️</div>
                  <p style={{ color: '#6b7280', fontSize: '13px' }}>No active court cases</p>
                </div>
              ) : (
                activeCases.map((c) => (
                  <div key={c.id} style={{ background: '#1a1a22', borderRadius: '12px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#f9fafb', margin: 0 }}>
                        {c.defendantName} vs {c.accuserName}
                      </p>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#f87171' }}>-{c.points} pts</span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic', margin: '0 0 8px' }}>
                      &ldquo;{c.appealComment}&rdquo;
                    </p>
                    <p style={{ fontSize: '10px', color: '#4b5563', margin: '0 0 8px' }}>{timeAgo(c.createdAt)}</p>
                    <button
                      onClick={() => dismissCase(group.id, c.id)}
                      style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#9ca3af', fontSize: '12px', fontWeight: 600, padding: '7px', cursor: 'pointer' }}
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
    </>
  )
}
