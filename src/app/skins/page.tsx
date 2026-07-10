'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  type SkinsRound,
  createRound,
  loadRounds,
  saveRounds,
  computeHoleResults,
  computeStandings,
} from '@/lib/skins'

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 20,
  color: '#111',
}

const primaryBtn: React.CSSProperties = {
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 9999,
  fontWeight: 800,
  padding: '12px 20px',
  cursor: 'pointer',
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#6b7280',
  border: '1px solid #d1d5db',
  borderRadius: 9999,
  fontWeight: 700,
  padding: '10px 18px',
  cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
}

function money(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}$${Math.abs(n)}`
}

function NewRoundForm({ onCreate, onCancel }: { onCreate: (r: SkinsRound) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [playerNames, setPlayerNames] = useState(['', '', '', ''])
  const [holeCount, setHoleCount] = useState(18)
  const [skinValue, setSkinValue] = useState(5)
  const [error, setError] = useState('')

  function updatePlayer(i: number, value: string) {
    setPlayerNames((prev) => prev.map((p, idx) => (idx === i ? value : p)))
  }

  function addPlayer() {
    setPlayerNames((prev) => [...prev, ''])
  }

  function removePlayer(i: number) {
    setPlayerNames((prev) => prev.filter((_, idx) => idx !== i))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleanNames = playerNames.map((p) => p.trim()).filter(Boolean)
    if (cleanNames.length < 2) {
      setError('Add at least 2 players.')
      return
    }
    if (holeCount < 1) {
      setError('Hole count must be at least 1.')
      return
    }
    const round = createRound({
      name: name.trim() || 'Untitled Round',
      playerNames: cleanNames,
      holeCount,
      skinValue: Math.max(0, skinValue),
    })
    onCreate(round)
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>New Round</h2>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>Round name</label>
        <input style={inputStyle} placeholder="Saturday at Pebble" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>Holes</label>
          <select style={inputStyle} value={holeCount} onChange={(e) => setHoleCount(Number(e.target.value))}>
            <option value={9}>9</option>
            <option value={18}>18</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>Skin value ($)</label>
          <input
            style={inputStyle}
            type="number"
            min={0}
            value={skinValue}
            onChange={(e) => setSkinValue(Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>Players</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          {playerNames.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input
                style={inputStyle}
                placeholder={`Player ${i + 1}`}
                value={p}
                onChange={(e) => updatePlayer(i, e.target.value)}
              />
              {playerNames.length > 2 && (
                <button type="button" onClick={() => removePlayer(i)} style={{ ...ghostBtn, padding: '8px 12px' }}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addPlayer} style={{ ...ghostBtn, marginTop: 8, fontSize: 13 }}>
          + Add player
        </button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button type="submit" style={{ ...primaryBtn, flex: 1 }}>
          Start Round
        </button>
        <button type="button" onClick={onCancel} style={ghostBtn}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function RoundView({
  round,
  onUpdate,
  onDelete,
  onBack,
}: {
  round: SkinsRound
  onUpdate: (r: SkinsRound) => void
  onDelete: () => void
  onBack: () => void
}) {
  const holeResults = useMemo(() => computeHoleResults(round), [round])
  const standings = useMemo(() => computeStandings(round, holeResults), [round, holeResults])

  function setScore(holeIndex: number, playerIndex: number, raw: string) {
    const value = raw === '' ? null : Number(raw)
    const next: SkinsRound = {
      ...round,
      scores: round.scores.map((holeScores, h) =>
        h === holeIndex ? holeScores.map((s, p) => (p === playerIndex ? value : s)) : holeScores
      ),
    }
    onUpdate(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} style={{ ...ghostBtn, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
          ← Rounds
        </button>
        <button onClick={onDelete} style={{ ...ghostBtn, background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)' }}>
          Delete round
        </button>
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>{round.name}</h2>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          {round.holeCount} holes · ${round.skinValue}/skin
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
          Standings
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {standings.map((s) => (
            <div key={s.player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>{s.player.name}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{s.skinsWon} skin{s.skinsWon === 1 ? '' : 's'}</span>
                <span style={{ fontWeight: 800, color: s.net > 0 ? '#16a34a' : s.net < 0 ? '#dc2626' : '#6b7280' }}>
                  {money(s.net)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}>Hole</th>
              {round.players.map((p) => (
                <th key={p.id} style={{ padding: '10px 8px', textAlign: 'center', minWidth: 64 }}>
                  {p.name}
                </th>
              ))}
              <th style={{ padding: '10px 12px', textAlign: 'center' }}>Pot</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Skin</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: round.holeCount }, (_, h) => {
              const result = holeResults[h]
              const winner = round.players.find((p) => p.id === result.winnerId)
              return (
                <tr key={h} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '6px 12px', fontWeight: 700, position: 'sticky', left: 0, background: '#fff' }}>{h + 1}</td>
                  {round.players.map((p, pi) => (
                    <td key={p.id} style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <input
                        type="number"
                        min={1}
                        value={round.scores[h]?.[pi] ?? ''}
                        onChange={(e) => setScore(h, pi, e.target.value)}
                        style={{ width: 48, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 2px' }}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '6px 12px', textAlign: 'center', color: '#6b7280' }}>${result.pot}</td>
                  <td style={{ padding: '6px 12px', color: winner ? '#16a34a' : '#9ca3af', fontWeight: winner ? 700 : 400 }}>
                    {winner ? winner.name : result.complete ? 'Carried' : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SkinsPage() {
  const router = useRouter()
  const [rounds, setRounds] = useState<SkinsRound[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setRounds(loadRounds())
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (loaded) saveRounds(rounds)
  }, [rounds, loaded])

  const activeRound = rounds.find((r) => r.id === activeId) ?? null

  function handleCreate(round: SkinsRound) {
    setRounds((prev) => [round, ...prev])
    setActiveId(round.id)
    setCreating(false)
  }

  function handleUpdate(round: SkinsRound) {
    setRounds((prev) => prev.map((r) => (r.id === round.id ? round : r)))
  }

  function handleDelete(id: string) {
    setRounds((prev) => prev.filter((r) => r.id !== id))
    setActiveId(null)
  }

  return (
    <div style={{ minHeight: '100%', padding: '24px 16px 48px', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => router.push('/dashboard')} style={{ ...ghostBtn, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
          ← Dashboard
        </button>
        <h1 style={{ color: '#fff', fontWeight: 900, fontSize: 22, margin: 0 }}>⛳ Skins</h1>
        <div style={{ width: 96 }} />
      </div>

      {activeRound ? (
        <RoundView
          round={activeRound}
          onUpdate={handleUpdate}
          onDelete={() => handleDelete(activeRound.id)}
          onBack={() => setActiveId(null)}
        />
      ) : creating ? (
        <NewRoundForm onCreate={handleCreate} onCancel={() => setCreating(false)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => setCreating(true)} style={primaryBtn}>
            + New Round
          </button>

          {rounds.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 24 }}>
              No rounds yet. Start one to track skins with your friends.
            </div>
          ) : (
            rounds.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveId(r.id)}
                style={{ ...cardStyle, textAlign: 'left', cursor: 'pointer', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {r.players.length} players · {r.holeCount} holes · ${r.skinValue}/skin
                  </div>
                </div>
                <div style={{ color: '#9ca3af' }}>→</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
