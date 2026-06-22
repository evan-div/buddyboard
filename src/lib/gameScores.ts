import {
  doc, getDoc, setDoc, getDocs, updateDoc,
  collection, query, where, writeBatch, increment, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { GameScore } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getTodayString(timezone?: string): string {
  try {
    if (timezone) {
      return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
    }
  } catch { /* fall through */ }
  return new Date().toISOString().slice(0, 10)
}

function yesterdayString(today: string): string {
  const d = new Date(today + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// ── Score read/write ──────────────────────────────────────────────────────────

export async function submitGameScore(
  groupId: string,
  uid: string,
  displayName: string,
  game: string,
  date: string,
  score: number,
): Promise<void> {
  const id = `${game}_${date}_${uid}`
  await setDoc(doc(db, 'groups', groupId, 'gameScores', id), {
    id, game, uid, displayName, score, date, groupId,
    completedAt: Timestamp.now(),
    pointsAwarded: false,
  })
}

export async function getUserGameScore(
  groupId: string,
  uid: string,
  game: string,
  date: string,
): Promise<GameScore | null> {
  const id = `${game}_${date}_${uid}`
  const snap = await getDoc(doc(db, 'groups', groupId, 'gameScores', id))
  if (!snap.exists()) return null
  const d = snap.data()
  return { ...d, completedAt: d.completedAt.toDate() } as GameScore
}

export async function getGameScores(
  groupId: string,
  game: string,
  date: string,
): Promise<GameScore[]> {
  const q = query(
    collection(db, 'groups', groupId, 'gameScores'),
    where('game', '==', game),
    where('date', '==', date),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data()
    return { ...data, completedAt: data.completedAt.toDate() } as GameScore
  })
}

// ── Lazy settlement ───────────────────────────────────────────────────────────
// Call on GamesHub mount. Awards points to yesterday's top scorers if not yet settled.
// Uses direct increment on member docs — bypasses daily give/take limits.

const AWARDS = [20, 10, 5]   // 1st, 2nd, 3rd
const PARTICIPATION = 2

export async function settleYesterdayIfNeeded(
  groupId: string,
  game: string,
  today: string,
): Promise<void> {
  const yesterday = yesterdayString(today)
  const scores = await getGameScores(groupId, game, yesterday)
  if (scores.length === 0) return
  const unsettled = scores.filter(s => !s.pointsAwarded)
  if (unsettled.length === 0) return

  // Lower score = better (golf)
  const sorted = [...scores].sort((a, b) => a.score - b.score)
  const batch = writeBatch(db)

  sorted.forEach((s, i) => {
    const pts = (AWARDS[i] ?? 0) + PARTICIPATION
    if (pts > 0) {
      batch.update(doc(db, 'groups', groupId, 'members', s.uid), {
        totalPoints: increment(pts),
      })
    }
    batch.update(doc(db, 'groups', groupId, 'gameScores', s.id), {
      pointsAwarded: true,
    })
  })

  await batch.commit()
}

export type { GameScore }
