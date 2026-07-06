'use client'

import { useState } from 'react'
import { createGroup } from '@/lib/firestore'
import { TIMEZONES } from '@/lib/timezones'
import type { PlazaPreset } from '@/lib/types'

const EMOJI_PICKS = ['🏠', '🏡', '🏢', '🎓', '🎮', '🚀', '🌴', '🎯', '🍕', '🏋️', '🎵', '💼']

type Props = {
  onClose: () => void
  onCreated: (groupId: string) => void
  userUid: string
}

export default function CreateGroupModal({ onClose, onCreated, userUid }: Props) {
  const [step, setStep] = useState(1)

  // Step 1
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🏠')
  const [description, setDescription] = useState('')

  // Step 2
  const [giveLimit, setGiveLimit] = useState(100)
  const [takeLimit, setTakeLimit] = useState(20)
  const [timezone, setTimezone] = useState('America/New_York')

  // Step 3
  const [presets, setPresets] = useState<PlazaPreset[]>([])
  const [newEmoji, setNewEmoji] = useState('😊')
  const [newLabel, setNewLabel] = useState('')
  const [newPoints, setNewPoints] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function addPreset() {
    const pts = parseInt(newPoints, 10)
    if (!newLabel.trim() || isNaN(pts) || pts === 0) return
    setPresets((prev) => [
      ...prev,
      { id: Date.now().toString(), emoji: newEmoji.trim() || '⚡', label: newLabel.trim(), points: pts },
    ])
    setNewEmoji('😊')
    setNewLabel('')
    setNewPoints('')
  }

  function removePreset(id: string) {
    setPresets((prev) => prev.filter((p) => p.id !== id))
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Plaza name is required.'); return }
    setError('')
    setLoading(true)
    try {
      const groupId = await createGroup(userUid, name.trim(), description.trim(), {
        emoji,
        dailyGiveLimit: giveLimit,
        dailyTakeLimit: takeLimit,
        timezone,
        presets,
      })
      onCreated(groupId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create group.')
    } finally {
      setLoading(false)
    }
  }

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

  const textareaStyle: React.CSSProperties = {
    background: '#d4d4d4',
    borderRadius: 16,
    border: 'none',
    outline: 'none',
    padding: '14px 24px',
    textAlign: 'center',
    fontSize: 16,
    color: '#111',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'none',
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

  const spinnerMinusBtnStyle: React.CSSProperties = {
    background: '#d4d4d4',
    borderRadius: 12,
    fontWeight: 700,
    color: '#111',
    width: 44,
    height: 44,
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }

  const labelStyle: React.CSSProperties = {
    color: '#555',
    fontSize: 13,
    fontWeight: 600,
    display: 'block',
    marginBottom: 6,
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#efefef',
          borderRadius: 28,
          width: '100%',
          maxWidth: 380,
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
      >
        {/* Progress bar */}
        <div style={{ height: 4, background: '#d4d4d4' }}>
          <div
            style={{
              height: '100%',
              background: '#42b842',
              width: `${(step / 3) * 100}%`,
              transition: 'width 0.3s',
            }}
          />
        </div>

        <div style={{ padding: 28 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {step > 1 && (
                <button
                  onClick={() => setStep(step - 1)}
                  style={{ color: '#999', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}
                >
                  ←
                </button>
              )}
              <h2 style={{ color: '#111', fontWeight: 800, fontSize: 20, margin: 0 }}>
                {step === 1 ? 'Create your Plaza' : step === 2 ? 'Set the Rules' : '⚡ Quick Actions'}
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{ color: '#999', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
          <p style={{ color: '#999', fontSize: 12, marginBottom: 20, marginTop: 2 }}>Step {step} of 3</p>

          {error && (
            <p style={{ color: '#e53e3e', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
              {error}
            </p>
          )}

          {/* ── Step 1: Identity ── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Emoji picker */}
              <div>
                <label style={labelStyle}>Plaza Emoji</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {EMOJI_PICKS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEmoji(e)}
                      style={{
                        fontSize: 22,
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: emoji === e ? '#42b842' : '#d4d4d4',
                        color: emoji === e ? 'white' : undefined,
                        transition: 'all 0.15s',
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value.slice(-2) || '🏠')}
                  placeholder="Or type any emoji"
                  maxLength={2}
                  style={{ ...inputStyle, fontSize: 22, padding: '8px 24px' }}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Plaza Name <span style={{ color: '#e53e3e' }}>*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. The Household"
                  maxLength={50}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Description <span style={{ color: '#999', fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this plaza about?"
                  maxLength={200}
                  rows={2}
                  style={textareaStyle}
                />
              </div>

              <button
                onClick={() => {
                  if (!name.trim()) { setError('Plaza name is required.'); return }
                  setError('')
                  setStep(2)
                }}
                style={greenBtnStyle}
              >
                Next →
              </button>
            </div>
          )}

          {/* ── Step 2: Rules ── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={labelStyle}>Daily Give Limit</label>
                <p style={{ color: '#999', fontSize: 12, marginBottom: 8, marginTop: 0 }}>Max points a member can give per day</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => setGiveLimit(Math.max(10, giveLimit - 10))}
                    style={spinnerMinusBtnStyle}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={giveLimit}
                    onChange={(e) => setGiveLimit(Math.max(10, Math.min(500, parseInt(e.target.value) || 10)))}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: '#d4d4d4',
                      borderRadius: 12,
                      border: 'none',
                      outline: 'none',
                      padding: '10px 16px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#111',
                      fontSize: 18,
                    }}
                  />
                  <button
                    onClick={() => setGiveLimit(Math.min(500, giveLimit + 10))}
                    style={spinnerMinusBtnStyle}
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Daily Take Limit</label>
                <p style={{ color: '#999', fontSize: 12, marginBottom: 8, marginTop: 0 }}>Max points a member can take per day</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => setTakeLimit(Math.max(5, takeLimit - 5))}
                    style={spinnerMinusBtnStyle}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={takeLimit}
                    onChange={(e) => setTakeLimit(Math.max(5, Math.min(100, parseInt(e.target.value) || 5)))}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: '#d4d4d4',
                      borderRadius: 12,
                      border: 'none',
                      outline: 'none',
                      padding: '10px 16px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#111',
                      fontSize: 18,
                    }}
                  />
                  <button
                    onClick={() => setTakeLimit(Math.min(100, takeLimit + 5))}
                    style={spinnerMinusBtnStyle}
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  style={{
                    background: '#d4d4d4',
                    borderRadius: 12,
                    border: 'none',
                    outline: 'none',
                    color: '#111',
                    padding: '12px 16px',
                    width: '100%',
                    fontSize: 15,
                  }}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>

              <button onClick={() => setStep(3)} style={greenBtnStyle}>
                Next →
              </button>
            </div>
          )}

          {/* ── Step 3: Quick Actions ── */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ color: '#999', fontSize: 12, marginTop: -8, marginBottom: 0 }}>
                Pre-set common give/takes so members can apply them in one tap. Optional — you can add more later.
              </p>

              {/* Existing presets */}
              {presets.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 160, overflowY: 'auto' }}>
                  {presets.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#d4d4d4',
                        borderRadius: 12,
                        padding: '10px 14px',
                      }}
                    >
                      <span style={{ color: '#111', fontSize: 14 }}>
                        {p.emoji} {p.label}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: p.points > 0 ? '#42b842' : '#e53e3e' }}>
                          {p.points > 0 ? `+${p.points}` : p.points}
                        </span>
                        <button
                          onClick={() => removePreset(p.id)}
                          style={{ color: '#999', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new preset */}
              <div
                style={{
                  background: '#e4e4e4',
                  borderRadius: 16,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <p style={{ color: '#555', fontSize: 12, fontWeight: 600, margin: 0, marginBottom: 4 }}>Add a quick action</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={newEmoji}
                    onChange={(e) => setNewEmoji(e.target.value.slice(-2))}
                    placeholder="😊"
                    maxLength={2}
                    style={{
                      width: 56,
                      background: '#d4d4d4',
                      borderRadius: 8,
                      border: 'none',
                      outline: 'none',
                      padding: '8px',
                      textAlign: 'center',
                      fontSize: 18,
                      color: '#111',
                      boxSizing: 'border-box',
                    }}
                  />
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Did the dishes"
                    maxLength={50}
                    style={{
                      flex: 1,
                      background: '#d4d4d4',
                      borderRadius: 8,
                      border: 'none',
                      outline: 'none',
                      padding: '8px 12px',
                      fontSize: 14,
                      color: '#111',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    value={newPoints}
                    onChange={(e) => setNewPoints(e.target.value)}
                    placeholder="pts (e.g. 10 or -15)"
                    style={{
                      flex: 1,
                      background: '#d4d4d4',
                      borderRadius: 8,
                      border: 'none',
                      outline: 'none',
                      padding: '8px 12px',
                      fontSize: 14,
                      color: '#111',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={addPreset}
                    disabled={!newLabel.trim() || !newPoints.trim()}
                    style={{
                      background: '#42b842',
                      color: 'white',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: !newLabel.trim() || !newPoints.trim() ? 'not-allowed' : 'pointer',
                      opacity: !newLabel.trim() || !newPoints.trim() ? 0.4 : 1,
                      fontSize: 14,
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={loading}
                style={{
                  ...greenBtnStyle,
                  opacity: loading ? 0.5 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Creating...' : `Create ${emoji} ${name}`}
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                style={{
                  color: '#999',
                  fontSize: 13,
                  textAlign: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginTop: -8,
                }}
              >
                Skip and create without quick actions
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
