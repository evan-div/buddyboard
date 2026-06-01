'use client'

import { useState } from 'react'
import { createGroup } from '@/lib/firestore'
import type { PlazaPreset } from '@/lib/types'

const EMOJI_PICKS = ['🏠', '🏡', '🏢', '🎓', '🎮', '🚀', '🌴', '🎯', '🍕', '🏋️', '🎵', '💼']

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

  const INPUT = "w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-gray-800">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="text-gray-500 hover:text-white text-lg leading-none mr-1"
                >
                  ←
                </button>
              )}
              <h2 className="text-lg font-bold text-white">
                {step === 1 ? 'Create your Plaza' : step === 2 ? 'Set the Rules' : '⚡ Quick Actions'}
              </h2>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">✕</button>
          </div>
          <p className="text-xs text-gray-500 mb-5">Step {step} of 3</p>

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* ── Step 1: Identity ── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              {/* Emoji picker */}
              <div>
                <label className="block text-gray-400 text-sm mb-2 font-medium">Plaza Emoji</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {EMOJI_PICKS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEmoji(e)}
                      className={`text-2xl w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        emoji === e ? 'bg-indigo-600 ring-2 ring-indigo-400' : 'bg-gray-800 hover:bg-gray-700'
                      }`}
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
                  className={`${INPUT} text-center text-2xl py-2`}
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-1.5 font-medium">
                  Plaza Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. The Household"
                  maxLength={50}
                  className={INPUT}
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-1.5 font-medium">
                  Description <span className="text-gray-600 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this plaza about?"
                  maxLength={200}
                  rows={2}
                  className={`${INPUT} resize-none`}
                />
              </div>

              <button
                onClick={() => { if (!name.trim()) { setError('Plaza name is required.'); return } setError(''); setStep(2) }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all"
              >
                Next →
              </button>
            </div>
          )}

          {/* ── Step 2: Rules ── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <label className="block text-gray-400 text-sm mb-1 font-medium">
                  Daily Give Limit
                </label>
                <p className="text-xs text-gray-600 mb-2">Max points a member can give per day</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setGiveLimit(Math.max(10, giveLimit - 10))} className="w-10 h-10 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-lg">−</button>
                  <input
                    type="number"
                    value={giveLimit}
                    onChange={(e) => setGiveLimit(Math.max(10, Math.min(500, parseInt(e.target.value) || 10)))}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-center font-bold text-lg focus:outline-none focus:border-indigo-500"
                  />
                  <button onClick={() => setGiveLimit(Math.min(500, giveLimit + 10))} className="w-10 h-10 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-lg">+</button>
                </div>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-1 font-medium">
                  Daily Take Limit
                </label>
                <p className="text-xs text-gray-600 mb-2">Max points a member can take per day</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setTakeLimit(Math.max(5, takeLimit - 5))} className="w-10 h-10 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-lg">−</button>
                  <input
                    type="number"
                    value={takeLimit}
                    onChange={(e) => setTakeLimit(Math.max(5, Math.min(100, parseInt(e.target.value) || 5)))}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-center font-bold text-lg focus:outline-none focus:border-indigo-500"
                  />
                  <button onClick={() => setTakeLimit(Math.min(100, takeLimit + 5))} className="w-10 h-10 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-lg">+</button>
                </div>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-1.5 font-medium">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setStep(3)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all"
              >
                Next →
              </button>
            </div>
          )}

          {/* ── Step 3: Quick Actions ── */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-gray-500 -mt-2">
                Pre-set common give/takes so members can apply them in one tap. Optional — you can add more later.
              </p>

              {/* Existing presets */}
              {presets.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {presets.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2">
                      <span className="text-white text-sm">
                        {p.emoji} {p.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${p.points > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {p.points > 0 ? `+${p.points}` : p.points}
                        </span>
                        <button onClick={() => removePreset(p.id)} className="text-gray-500 hover:text-red-400 text-sm">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new preset */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 space-y-2">
                <p className="text-xs text-gray-400 font-medium mb-2">Add a quick action</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newEmoji}
                    onChange={(e) => setNewEmoji(e.target.value.slice(-2))}
                    placeholder="😊"
                    maxLength={2}
                    className="w-14 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-center text-lg focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Did the dishes"
                    maxLength={50}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={newPoints}
                    onChange={(e) => setNewPoints(e.target.value)}
                    placeholder="pts (e.g. 10 or -15)"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={addPreset}
                    disabled={!newLabel.trim() || !newPoints.trim()}
                    className="px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-sm transition-all"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all"
                >
                  {loading ? 'Creating...' : `Create ${emoji} ${name}`}
                </button>
              </div>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="text-gray-500 hover:text-gray-400 text-sm text-center -mt-2"
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
