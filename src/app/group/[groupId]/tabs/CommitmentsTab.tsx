'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  COMMITMENT_TIERS,
  MIN_THRESHOLD_PCT,
  activeRarities,
  commitmentProgress,
  describeRules,
  disputeWindowOpen,
  maxTargetPerPeriod,
  metThreshold,
  rarityForDuration,
  validateDraft,
  type CommitmentDraft,
} from '@/lib/commitments'
import {
  cancelCommitment,
  createCommitment,
  disputeCommitment,
  joinCommitment,
  leaveCommitment,
  startCommitment,
  subscribeToCommitments,
  sweepDueCommitments,
} from '@/lib/commitmentsData'
import {
  commitmentPreviewServerSnapshot,
  commitmentPreviewSnapshot,
  previewCommitments,
  subscribeToCommitmentPreview,
} from '@/lib/commitmentsPreview'
import { RARITY_COLOR, RARITY_LABEL } from '@/components/World/plazaSpecies'
import { dayKey, formatRemaining, timeAgo } from '@/lib/utils'
import type {
  Commitment,
  CommitmentCadence,
  CommitmentParticipant,
  SeedRarity,
} from '@/lib/types'

const DAY_MS = 86_400_000

type Props = {
  groupId: string
  currentUid: string
  displayName: string
  /** Everyone who can be summoned as a juror if an outcome is disputed. */
  memberUids: string[]
}

const card = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 18,
  padding: 'var(--card-pad)',
} as const

const label = {
  fontSize: 11,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.45)',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.4,
}

function RarityPill({ rarity, small }: { rarity: SeedRarity; small?: boolean }) {
  const color = RARITY_COLOR[rarity]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: small ? '2px 7px' : '4px 10px',
      borderRadius: 8, fontSize: small ? 10 : 11, fontWeight: 800,
      color, background: `${color}22`, border: `1px solid ${color}55`,
      textTransform: 'uppercase', letterSpacing: 0.3,
    }}>
      🌱 {RARITY_LABEL[rarity]}
    </span>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{
      height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
    }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color }} />
    </div>
  )
}

// ─── Create ───────────────────────────────────────────────────────────────────

function CreateCard({
  groupId, currentUid, displayName, commitments, onDone,
}: {
  groupId: string
  currentUid: string
  displayName: string
  commitments: Commitment[]
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const [durationDays, setDurationDays] = useState<number>(7)
  const [cadence, setCadence] = useState<CommitmentCadence>('daily')
  const [targetPerPeriod, setTargetPerPeriod] = useState(1)
  const [thresholdPct, setThresholdPct] = useState(80)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // One live commitment per tier, so a tier you already hold is not offerable.
  const taken = useMemo(
    () => activeRarities(commitments, currentUid),
    [commitments, currentUid],
  )

  const draft: CommitmentDraft = { title, durationDays, cadence, targetPerPeriod, thresholdPct }
  const problem = validateDraft(draft)
  const rarity = rarityForDuration(durationDays)
  const tierTaken = taken.has(rarity)

  function pickCadence(next: CommitmentCadence) {
    setCadence(next)
    // A daily commitment is marked once a day, so any higher target is unreachable.
    if (next === 'daily') setTargetPerPeriod(1)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await createCommitment(groupId, currentUid, displayName, draft)
      setTitle('')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#f3f4f6' }}>Start a commitment</div>

      <div>
        <div style={{ ...label, marginBottom: 6 }}>The goal</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Run three times a week"
          maxLength={120}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 11,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            color: '#f3f4f6', fontSize: 14, outline: 'none',
          }}
        />
      </div>

      <div>
        <div style={{ ...label, marginBottom: 6 }}>How long — and what it pays</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {COMMITMENT_TIERS.map((tier) => {
            const isActive = durationDays === tier.days
            const isTaken = taken.has(tier.rarity)
            const color = RARITY_COLOR[tier.rarity]
            return (
              <button
                key={tier.days}
                onClick={() => setDurationDays(tier.days)}
                disabled={isTaken}
                title={isTaken ? `You already have a ${tier.rarity} commitment running` : undefined}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
                  padding: '10px 12px', borderRadius: 12, cursor: isTaken ? 'not-allowed' : 'pointer',
                  background: isActive ? `${color}1f` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? color : 'var(--border)'}`,
                  opacity: isTaken ? 0.4 : 1,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 800, color: '#f3f4f6' }}>
                  {tier.days} days
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {RARITY_LABEL[tier.rarity]} seed
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div style={{ ...label, marginBottom: 6 }}>What counts</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {(['daily', 'weekly'] as CommitmentCadence[]).map((c) => (
            <button
              key={c}
              onClick={() => pickCadence(c)}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                background: cadence === c ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${cadence === c ? 'var(--accent)' : 'var(--border)'}`,
                color: cadence === c ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
                fontSize: 13, fontWeight: 700, textTransform: 'capitalize',
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {cadence === 'weekly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Times a week</span>
            <input
              type="range"
              min={1}
              max={maxTargetPerPeriod('weekly')}
              value={targetPerPeriod}
              onChange={(e) => setTargetPerPeriod(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#f3f4f6', minWidth: 16 }}>
              {targetPerPeriod}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Must clear</span>
          <input
            type="range"
            min={MIN_THRESHOLD_PCT}
            max={100}
            step={5}
            value={thresholdPct}
            onChange={(e) => setThresholdPct(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#f3f4f6', minWidth: 34 }}>
            {thresholdPct}%
          </span>
        </div>
      </div>

      {/* Stated plainly so nobody joins without seeing what clearing it takes. */}
      <div style={{
        padding: '9px 12px', borderRadius: 11,
        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
        fontSize: 12, color: 'rgba(255,255,255,0.72)',
      }}>
        {describeRules({ cadence, targetPerPeriod, thresholdPct, durationDays })}
        <span style={{ marginLeft: 8 }}><RarityPill rarity={rarity} small /></span>
      </div>

      {(error || (tierTaken && !problem)) && (
        <div style={{ fontSize: 12, color: '#fb6d5d' }}>
          {error ?? `You already have a ${rarity} commitment running`}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy || !!problem || tierTaken}
        style={{
          padding: '11px 14px', borderRadius: 12, border: 'none',
          background: problem || tierTaken ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
          color: problem || tierTaken ? 'rgba(255,255,255,0.35)' : '#0d0d12',
          fontSize: 14, fontWeight: 800,
          cursor: busy || problem || tierTaken ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Opening…' : problem ?? 'Open for sign-up'}
      </button>
    </div>
  )
}

// ─── Dispute ──────────────────────────────────────────────────────────────────

function DisputeBox({
  defendantName, onSubmit, onClose,
}: {
  defendantName: string
  onSubmit: (comment: string) => Promise<unknown>
  onClose: () => void
}) {
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await onSubmit(comment.trim())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not file that')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      marginTop: 10, padding: 12, borderRadius: 12,
      background: 'rgba(251,109,93,0.06)', border: '1px solid rgba(251,109,93,0.3)',
    }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', marginBottom: 8 }}>
        Dispute {defendantName}&apos;s result. The whole group votes, and they have 24 hours.
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Why do you think they didn't hold up their end?"
        maxLength={280}
        rows={2}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 10, resize: 'none',
          background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)',
          color: '#f3f4f6', fontSize: 13, outline: 'none', fontFamily: 'inherit',
        }}
      />
      {error && <div style={{ fontSize: 12, color: '#fb6d5d', marginTop: 6 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={submit}
          disabled={busy || !comment.trim()}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 10, border: 'none',
            background: comment.trim() ? '#fb6d5d' : 'rgba(255,255,255,0.06)',
            color: comment.trim() ? '#0d0d12' : 'rgba(255,255,255,0.35)',
            fontSize: 13, fontWeight: 800, cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Filing…' : 'Take it to court'}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '8px 12px', borderRadius: 10,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── One commitment ───────────────────────────────────────────────────────────

// Join/leave/start/cancel are injected rather than called directly, so preview
// mode can swap in local mutators and never reach Firestore.
type CardActions = {
  join: (c: Commitment) => Promise<unknown>
  leave: (c: Commitment) => Promise<unknown>
  start: (c: Commitment) => Promise<unknown>
  cancel: (c: Commitment) => Promise<unknown>
  dispute: (c: Commitment, defendantUid: string, comment: string) => Promise<unknown>
}

function CommitmentCard({
  c, groupId, currentUid, displayName, memberUids, commitments, now, actions, preview,
}: {
  c: Commitment
  groupId: string
  currentUid: string
  displayName: string
  memberUids: string[]
  commitments: Commitment[]
  now: number
  actions: CardActions
  preview: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disputing, setDisputing] = useState<string | null>(null)

  const me = c.participants[currentUid]
  const roster = Object.values(c.participants)
  const isCreator = c.createdBy === currentUid
  const color = RARITY_COLOR[c.rarity]

  const blockedByTier = useMemo(
    () => activeRarities(commitments.filter((x) => x.id !== c.id), currentUid).has(c.rarity),
    [commitments, c.id, c.rarity, currentUid],
  )

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const canDispute = disputeWindowOpen(c, now) && !!me

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#f9fafb', lineHeight: 1.3 }}>
            {c.title}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
            {describeRules(c)} · started by {c.createdByName}
          </div>
        </div>
        <RarityPill rarity={c.rarity} />
      </div>

      {/* Status line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        {c.status === 'forming' && (
          <span style={{ color: '#fbc22d', fontWeight: 700 }}>
            Open for sign-up · {roster.length} in
          </span>
        )}
        {c.status === 'active' && c.deadline && (
          <span style={{ color, fontWeight: 700 }}>{formatRemaining(c.deadline, now)}</span>
        )}
        {c.status === 'resolved' && (
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>
            Ended {c.resolvedAt ? timeAgo(c.resolvedAt) : ''}
          </span>
        )}
        {c.status === 'cancelled' && (
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Cancelled</span>
        )}
      </div>

      {/* Roster */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {roster.map((p) => {
          const progress = commitmentProgress(c, p.markedDays)
          const isMe = p.uid === currentUid
          return (
            <div key={p.uid}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12,
              }}>
                <span style={{ fontWeight: isMe ? 800 : 600, color: isMe ? '#f3f4f6' : 'rgba(255,255,255,0.66)' }}>
                  {isMe ? 'You' : p.displayName}
                </span>
                {c.status === 'active' && (
                  <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.45)' }}>
                    {progress.done}/{progress.total}
                  </span>
                )}
                {p.outcome === 'kept' && (
                  <span style={{ marginLeft: 'auto', color: '#14d8b0', fontWeight: 700 }}>
                    Kept it {p.seedAwarded ? '· 🌱' : ''}
                  </span>
                )}
                {p.outcome === 'missed' && (
                  <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                    Missed it
                  </span>
                )}
              </div>
              {c.status === 'active' && <ProgressBar pct={progress.pct} color={color} />}
              {canDispute && p.outcome === 'kept' && !isMe && !p.caseId && (
                disputing === p.uid ? (
                  <DisputeBox
                    defendantName={p.displayName}
                    onSubmit={(comment) => preview
                      ? actions.dispute(c, p.uid, comment)
                      : disputeCommitment(
                          groupId, c.id, currentUid, displayName, p.uid, comment, memberUids,
                        )}
                    onClose={() => setDisputing(null)}
                  />
                ) : (
                  <button
                    onClick={() => setDisputing(p.uid)}
                    style={{
                      marginTop: 4, background: 'none', border: 'none', padding: 0,
                      color: 'rgba(251,109,93,0.75)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Dispute this
                  </button>
                )
              )}
              {p.caseId && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#fbc22d' }}>
                  Disputed — the group is voting in Court
                </div>
              )}
            </div>
          )
        })}
      </div>

      {c.status === 'active' && me && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          Check in on the Plaza to mark today.
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: '#fb6d5d' }}>{error}</div>}

      {/* Actions */}
      {c.status === 'forming' && (
        <div style={{ display: 'flex', gap: 8 }}>
          {!me && (
            <button
              onClick={() => run(() => actions.join(c))}
              disabled={busy || blockedByTier}
              title={blockedByTier ? `You already have a ${c.rarity} commitment running` : undefined}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 11, border: 'none',
                background: blockedByTier ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
                color: blockedByTier ? 'rgba(255,255,255,0.35)' : '#0d0d12',
                fontSize: 13, fontWeight: 800,
                cursor: busy || blockedByTier ? 'not-allowed' : 'pointer',
              }}
            >
              Join
            </button>
          )}
          {me && !isCreator && (
            <button
              onClick={() => run(() => actions.leave(c))}
              disabled={busy}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 11,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Leave
            </button>
          )}
          {isCreator && (
            <>
              <button
                onClick={() => run(() => actions.start(c))}
                disabled={busy || roster.length < 2}
                title={roster.length < 2 ? 'A commitment needs at least two people' : undefined}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 11, border: 'none',
                  background: roster.length < 2 ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
                  color: roster.length < 2 ? 'rgba(255,255,255,0.35)' : '#0d0d12',
                  fontSize: 13, fontWeight: 800,
                  cursor: busy || roster.length < 2 ? 'not-allowed' : 'pointer',
                }}
              >
                Start it
              </button>
              <button
                onClick={() => run(() => actions.cancel(c))}
                disabled={busy}
                style={{
                  padding: '9px 12px', borderRadius: 11,
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export default function CommitmentsTab({
  groupId, currentUid, displayName, memberUids,
}: Props) {
  const [live, setLiveCommitments] = useState<Commitment[]>([])
  const [liveLoading, setLiveLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const sweeping = useRef(false)

  // Preview is browser-only state that never changes after load. Read through
  // useSyncExternalStore rather than an effect: this file is outside
  // components/World, so it has no React Compiler exemption for setState in an
  // effect, and a lazy useState initialiser would disagree with the server.
  const preview = useSyncExternalStore(
    subscribeToCommitmentPreview,
    commitmentPreviewSnapshot,
    commitmentPreviewServerSnapshot,
  )

  // Pinned once so fixtures do not slide around underneath the day dial.
  const [previewBaseMs] = useState(() => Date.now())
  const [dayOffset, setDayOffset] = useState(preview.dayOffset)
  // Local edits layered over the fixtures — the same "stays on this device"
  // promise the plaza's preview plants make.
  const [edited, setEdited] = useState<Record<string, Commitment>>({})

  const fixtures = useMemo(
    () => (preview.on
      ? previewCommitments({ uid: currentUid, displayName, nowMs: previewBaseMs })
      : []),
    [preview.on, currentUid, displayName, previewBaseMs],
  )

  const commitments = useMemo(
    () => (preview.on ? fixtures.map((c) => edited[c.id] ?? c) : live),
    [preview.on, fixtures, edited, live],
  )

  const effectiveNow = preview.on ? previewBaseMs + dayOffset * DAY_MS : now

  // Fixtures are ready the moment they are built, so there is nothing to wait
  // for in preview. Derived rather than set in the effect below — setState
  // straight from an effect body is what the React Compiler lint forbids here.
  const loading = preview.on ? false : liveLoading

  useEffect(() => {
    // Preview never subscribes — nothing should be read from or written to
    // Firestore while a fake lifecycle is on screen.
    if (preview.on) return
    const unsub = subscribeToCommitments(groupId, (list) => {
      setLiveCommitments(list)
      setLiveLoading(false)
    })
    return unsub
  }, [groupId, preview.on])

  // Minute tick — enough for "3 days left", and far cheaper than the court's
  // per-second countdown, which it does not need.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Fallback for the hourly cron: settle anything already past its deadline
  // while somebody is looking. Both paths are idempotent, so racing is safe.
  const sweep = useCallback(async (list: Commitment[]) => {
    if (sweeping.current) return
    sweeping.current = true
    try {
      await sweepDueCommitments(groupId, list)
    } finally {
      sweeping.current = false
    }
  }, [groupId])

  useEffect(() => {
    if (preview.on) return
    const due = commitments.some(
      (c) => c.status === 'active' && c.deadline && c.deadline.getTime() <= now,
    )
    if (due) void sweep(commitments)
  }, [commitments, now, sweep, preview.on])

  // ── Preview mutators ──
  // Every one of these builds a new Commitment locally. Nothing is persisted,
  // which is what lets the harness run a whole lifecycle in one sitting.
  const editPreview = useCallback((c: Commitment, next: Partial<Commitment>) => {
    setEdited((prev) => ({ ...prev, [c.id]: { ...c, ...next } }))
  }, [])

  const previewActions: CardActions = useMemo(() => ({
    join: async (c) => editPreview(c, {
      participants: {
        ...c.participants,
        [currentUid]: {
          uid: currentUid, displayName, joinedAt: new Date(effectiveNow), markedDays: [],
        },
      },
    }),
    leave: async (c) => {
      const participants = { ...c.participants }
      delete participants[currentUid]
      editPreview(c, { participants })
    },
    start: async (c) => editPreview(c, {
      status: 'active',
      startedAt: new Date(effectiveNow),
      deadline: new Date(effectiveNow + c.durationDays * DAY_MS),
    }),
    cancel: async (c) => editPreview(c, { status: 'cancelled', resolvedAt: new Date(effectiveNow) }),
    dispute: async (c, defendantUid) => editPreview(c, {
      participants: {
        ...c.participants,
        [defendantUid]: { ...c.participants[defendantUid], caseId: 'preview-case' },
      },
    }),
  }), [currentUid, displayName, effectiveNow, editPreview])

  const realActions: CardActions = useMemo(() => ({
    join: (c) => joinCommitment(groupId, c.id, currentUid, displayName),
    leave: (c) => leaveCommitment(groupId, c.id, currentUid),
    start: (c) => startCommitment(groupId, c.id, currentUid),
    cancel: (c) => cancelCommitment(groupId, c.id, currentUid),
    dispute: (c, defendantUid, comment) => disputeCommitment(
      groupId, c.id, currentUid, displayName, defendantUid, comment, memberUids,
    ),
  }), [groupId, currentUid, displayName, memberUids])

  const actions = preview.on ? previewActions : realActions

  // Mark today on every active commitment I'm in, exactly as the plaza's
  // check-in card would.
  function previewMarkToday() {
    const today = dayKey()
    for (const c of commitments) {
      const me = c.participants[currentUid]
      if (c.status !== 'active' || !me || me.markedDays.includes(today)) continue
      editPreview(c, {
        participants: {
          ...c.participants,
          [currentUid]: { ...me, markedDays: [today, ...me.markedDays] },
        },
      })
    }
  }

  // Settle anything past its (dialled) deadline using the real threshold rule,
  // so what you see here is the same judgement the cron would make.
  function previewResolveDue() {
    for (const c of commitments) {
      if (c.status !== 'active' || !c.deadline || c.deadline.getTime() > effectiveNow) continue
      const participants: Record<string, CommitmentParticipant> = {}
      for (const [uid, p] of Object.entries(c.participants)) {
        const kept = metThreshold(c, p.markedDays)
        participants[uid] = {
          ...p,
          outcome: kept ? 'kept' : 'missed',
          seedAwarded: kept ? c.rarity : undefined,
        }
      }
      editPreview(c, { status: 'resolved', resolvedAt: new Date(effectiveNow), participants })
    }
  }

  const dueCount = commitments.filter(
    (c) => c.status === 'active' && c.deadline && c.deadline.getTime() <= effectiveNow,
  ).length

  const { open, past } = useMemo(() => {
    const open = commitments.filter((c) => c.status === 'forming' || c.status === 'active')
    const past = commitments.filter((c) => c.status === 'resolved' || c.status === 'cancelled')
    return { open, past }
  }, [commitments])

  const previewBtn = (label: string, onClick: () => void, wide = false) => (
    <button
      onClick={onClick}
      style={{
        flex: wide ? 1 : undefined, minWidth: wide ? 0 : 32,
        padding: '6px 9px', borderRadius: 8, cursor: 'pointer',
        background: 'rgba(255,255,255,0.14)', color: '#fff',
        border: '1px solid rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 700,
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--stack-gap)' }}>
      {/* Tap-driven, like the plaza's panel — editing a query string on a phone
          is miserable, and this is meant to be usable there. */}
      {preview.on && (
        <div style={{
          background: 'rgba(150,95,15,0.94)', color: '#fff',
          borderRadius: 12, padding: 10, border: '1px solid rgba(255,255,255,0.2)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800 }}>
            ⏩ preview · {dayOffset >= 0 ? '+' : ''}{dayOffset}d
          </div>
          <div style={{ fontSize: 10, opacity: 0.85, lineHeight: 1.45 }}>
            Fake commitments covering every state. Render-only — nothing is saved,
            and no one else sees any of it.
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ fontSize: 11, opacity: 0.85, minWidth: 30 }}>Day</span>
            {previewBtn('−', () => setDayOffset((d) => d - 1))}
            <span style={{ minWidth: 30, textAlign: 'center', fontWeight: 800, fontSize: 12 }}>
              {dayOffset >= 0 ? '+' : ''}{dayOffset}
            </span>
            {previewBtn('+', () => setDayOffset((d) => d + 1))}
            {previewBtn('+7', () => setDayOffset((d) => d + 7))}
            {previewBtn('+30', () => setDayOffset((d) => d + 30))}
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {previewBtn('✅ Mark today', previewMarkToday, true)}
            {previewBtn(
              dueCount > 0 ? `⏱️ Resolve due · ${dueCount}` : '⏱️ Nothing due',
              previewResolveDue,
              true,
            )}
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {previewBtn('↺ Reset', () => { setEdited({}); setDayOffset(0) }, true)}
          </div>
        </div>
      )}

      {creating ? (
        <CreateCard
          groupId={groupId}
          currentUid={currentUid}
          displayName={displayName}
          commitments={commitments}
          onDone={() => setCreating(false)}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          style={{
            ...card, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer', color: 'var(--accent)', fontSize: 14, fontWeight: 800,
          }}
        >
          🤝 Start a commitment
        </button>
      )}

      {loading && (
        <div style={{ ...card, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          Loading…
        </div>
      )}

      {!loading && commitments.length === 0 && (
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🤝</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#f3f4f6', marginBottom: 6 }}>
            No commitments yet
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.5 }}>
            Make a pact with the group and hold it to the end. The longer it runs,
            the rarer the seed everyone who held up their end takes home.
          </p>
        </div>
      )}

      {open.map((c) => (
        <CommitmentCard
          key={c.id}
          c={c}
          groupId={groupId}
          currentUid={currentUid}
          displayName={displayName}
          memberUids={memberUids}
          commitments={commitments}
          now={effectiveNow}
          actions={actions}
          preview={preview.on}
        />
      ))}

      {past.length > 0 && (
        <div style={{ ...label, marginTop: 4 }}>Finished</div>
      )}
      {past.map((c) => (
        <CommitmentCard
          key={c.id}
          c={c}
          groupId={groupId}
          currentUid={currentUid}
          displayName={displayName}
          memberUids={memberUids}
          commitments={commitments}
          now={effectiveNow}
          actions={actions}
          preview={preview.on}
        />
      ))}
    </div>
  )
}
