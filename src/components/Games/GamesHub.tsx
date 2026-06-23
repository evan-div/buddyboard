'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { GroupMember } from '@/lib/types'
import type { GameScore } from '@/lib/gameScores'
import {
  getTodayString,
  getGameScores,
  getUserGameScore,
  settleYesterdayIfNeeded,
  submitGameScore,
} from '@/lib/gameScores'

const MiniGolf  = dynamic(() => import('./MiniGolf'),  { ssr: false })
const Bowling3D = dynamic(() => import('./Bowling3D'), { ssr: false })

interface Props {
  groupId:    string
  currentUid: string
  displayName: string
  members:    GroupMember[]
  timezone?:  string
}

interface GameDef {
  id:           string
  name:         string
  icon:         string
  description:  string
  scoreLabel:   (s: number) => string
  scoringOrder: 'lower' | 'higher'
}

const GAMES: GameDef[] = [
  {
    id:           'minigolf',
    name:         'Mini Golf',
    icon:         '⛳',
    description:  'One randomly generated hole · Lowest strokes wins',
    scoreLabel:   (s) => `${s} stroke${s !== 1 ? 's' : ''}`,
    scoringOrder: 'lower',
  },
  {
    id:           'bowling',
    name:         'Bowling',
    icon:         '🎳',
    description:  '10 frames of 3D bowling · Highest score wins · Max 300',
    scoreLabel:   (s) => `${s} pts`,
    scoringOrder: 'higher',
  },
]

export default function GamesHub({ groupId, currentUid, displayName, members, timezone }: Props) {
  const today = getTodayString(timezone)

  const [selectedGame, setSelectedGame] = useState<GameDef>(GAMES[0])
  const [scores,       setScores]       = useState<GameScore[]>([])
  const [myScore,      setMyScore]      = useState<GameScore | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [playing,      setPlaying]      = useState(false)
  const [submitting,   setSubmitting]   = useState(false)

  async function load() {
    setLoading(true)
    try {
      await settleYesterdayIfNeeded(groupId, selectedGame.id, today, selectedGame.scoringOrder)
      const [all, mine] = await Promise.all([
        getGameScores(groupId, selectedGame.id, today),
        getUserGameScore(groupId, currentUid, selectedGame.id, today),
      ])
      const sorted = selectedGame.scoringOrder === 'lower'
        ? all.sort((a, b) => a.score - b.score)
        : all.sort((a, b) => b.score - a.score)
      setScores(sorted)
      setMyScore(mine)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [selectedGame.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGameComplete(score: number) {
    setSubmitting(true)
    try {
      await submitGameScore(groupId, currentUid, displayName, selectedGame.id, today, score)
      setPlaying(false)
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  const medal = ['🥇', '🥈', '🥉']
  const myRank = myScore ? scores.findIndex(s => s.uid === currentUid) : -1

  return (
    <>
      {/* Game overlays */}
      {playing && selectedGame.id === 'minigolf' && (
        <MiniGolf
          dateStr={today}
          membersCount={members.length}
          onComplete={handleGameComplete}
          onClose={() => setPlaying(false)}
        />
      )}
      {playing && selectedGame.id === 'bowling' && (
        <Bowling3D
          dateStr={today}
          membersCount={members.length}
          onComplete={handleGameComplete}
          onClose={() => setPlaying(false)}
        />
      )}

      <div style={{
        maxWidth: 480, margin: '0 auto',
        padding: '16px 14px 32px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>

        {/* Game selector (single game for now, extensible) */}
        {GAMES.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {GAMES.map(g => (
              <button
                key={g.id}
                onClick={() => setSelectedGame(g)}
                style={{
                  padding: '7px 14px', borderRadius: 20, border: 'none',
                  background: selectedGame.id === g.id ? '#6366f1' : '#f3f4f6',
                  color: selectedGame.id === g.id ? '#fff' : '#555',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >{g.icon} {g.name}</button>
            ))}
          </div>
        )}

        {/* Hero card */}
        <div style={{
          background: selectedGame.id === 'bowling'
            ? 'linear-gradient(135deg, #1a1a5c 0%, #2d2d8a 100%)'
            : 'linear-gradient(135deg, #1a5c1a 0%, #2d8a2d 100%)',
          borderRadius: 20, padding: '24px 20px 20px',
          color: '#fff', marginBottom: 16, textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}>
          <div style={{ fontSize: 44, marginBottom: 6 }}>{selectedGame.icon}</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>{selectedGame.name}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4, marginBottom: 18 }}>
            {selectedGame.description}
          </div>

          {myScore && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>Your best today</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>
                {myRank >= 0 ? medal[myRank] ?? `#${myRank + 1}` : ''}{' '}
                {selectedGame.scoreLabel(myScore.score)}
              </div>
            </div>
          )}
          <button
            onClick={() => setPlaying(true)}
            disabled={submitting}
            style={{
              background: '#fff', color: '#1a5c1a',
              border: 'none', borderRadius: 14,
              padding: '12px 32px', fontSize: 15, fontWeight: 900,
              cursor: submitting ? 'default' : 'pointer',
              boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
            }}
          >
            {submitting ? 'Saving…' : myScore ? 'Play Again' : selectedGame.id === 'bowling' ? `Bowl Now` : `Play Today's Hole`}
          </button>
        </div>

        {/* Leaderboard */}
        <div style={{
          background: '#fff', borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #f3f4f6',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#111' }}>Today's Leaderboard</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>{today}</div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#aaa', fontSize: 13 }}>Loading…</div>
          ) : scores.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 16px', color: '#999', fontSize: 13 }}>
              No scores yet today.<br />
              <span style={{ color: '#6366f1', fontWeight: 700 }}>Be the first to play!</span>
            </div>
          ) : (
            scores.map((s, i) => {
              const isMe = s.uid === currentUid
              return (
                <div
                  key={s.uid}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 16px',
                    background: isMe ? '#f0f0ff' : 'transparent',
                    borderBottom: i < scores.length - 1 ? '1px solid #f9fafb' : 'none',
                  }}
                >
                  <div style={{ width: 24, textAlign: 'center', fontSize: 16 }}>
                    {medal[i] ?? <span style={{ fontSize: 12, color: '#aaa', fontWeight: 700 }}>#{i + 1}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>
                      {s.displayName}{isMe && <span style={{ color: '#6366f1', fontSize: 11, marginLeft: 4 }}>(you)</span>}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: i === 0 ? '#16a34a' : '#374151' }}>
                    {selectedGame.scoreLabel(s.score)}
                  </div>
                </div>
              )
            })
          )}

          {!myScore && !loading && (
            <div style={{ padding: '10px 16px', borderTop: scores.length > 0 ? '1px solid #f3f4f6' : 'none', textAlign: 'center' }}>
              <button
                onClick={() => setPlaying(true)}
                style={{
                  background: '#6366f1', border: 'none', borderRadius: 10,
                  color: '#fff', padding: '8px 22px', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >{selectedGame.id === 'bowling' ? 'Bowl Now 🎳' : 'Play Now ⛳'}</button>
            </div>
          )}
        </div>

        {/* Points info */}
        <div style={{
          marginTop: 14, padding: '12px 16px',
          background: '#fefce8', borderRadius: 12, border: '1px solid #fde68a',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>Daily Prizes</div>
          <div style={{ fontSize: 11, color: '#78350f', lineHeight: 1.6 }}>
            🥇 1st place +22 pts &nbsp;·&nbsp; 🥈 2nd +12 pts &nbsp;·&nbsp; 🥉 3rd +7 pts<br />
            Everyone who plays: +2 pts &nbsp;·&nbsp; Resets at midnight
          </div>
        </div>
      </div>
    </>
  )
}
