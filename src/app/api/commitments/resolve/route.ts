import { NextRequest, NextResponse } from 'next/server'
import { loadServiceAccount, getAccessToken } from '@/lib/server/googleAuth'
import { sendPush } from '@/lib/server/push'
import {
  autoId,
  commitWrites,
  decodeFields,
  docName,
  encodeFields,
  groupIdFromName,
  idFromName,
  incrementField,
  runCollectionGroupQuery,
  type FsDocument,
  type FsWrite,
} from '@/lib/server/firestoreRest'
import { metThreshold } from '@/lib/commitments'
import type { SeedRarity } from '@/lib/types'

/**
 * Resolve commitments whose deadline has passed.
 *
 * Called hourly by Vercel Cron (see vercel.json). This is what makes the finish
 * line a real moment: the seed lands and the push goes out on time, rather than
 * whenever somebody next happens to open the app. A client-side sweep in the
 * Commitments tab covers local development and cron outages, and both paths are
 * safe to race because the commit below carries an updateTime precondition.
 *
 * Vercel Cron delivers at-least-once, so this must be idempotent — it is: a
 * commitment already moved off 'active' fails the precondition and is skipped.
 */

// A cron endpoint must never be served from cache.
export const dynamic = 'force-dynamic'

const PAGE_LIMIT = 200

type Outcome = { uid: string; kept: boolean; displayName: string }

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Refuse rather than run open if the secret was never configured.
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

/** Decide each participant's outcome from their marks. */
function judge(data: Record<string, unknown>): Outcome[] {
  const rules = {
    cadence: data.cadence as 'daily' | 'weekly',
    targetPerPeriod: (data.targetPerPeriod as number) ?? 1,
    thresholdPct: (data.thresholdPct as number) ?? 80,
    durationDays: (data.durationDays as number) ?? 7,
  }
  const participants = (data.participants ?? {}) as Record<string, Record<string, unknown>>

  return Object.entries(participants).map(([uid, p]) => ({
    uid,
    displayName: (p.displayName as string) ?? uid,
    // Marks can only be written while the commitment is active and only for the
    // marker's own check-in day, so everything here is already inside the
    // window — bar anything marked in the gap between the deadline and this
    // run, which is at most an hour of grace and only ever helps.
    kept: metThreshold(rules, (p.markedDays as string[]) ?? []),
  }))
}

/** Build the atomic write batch that settles one commitment. */
function writesFor(
  sa: NonNullable<ReturnType<typeof loadServiceAccount>>,
  doc: FsDocument,
  groupId: string,
  commitmentId: string,
  data: Record<string, unknown>,
  outcomes: Outcome[],
  now: Date,
): FsWrite[] {
  const rarity = (data.rarity as SeedRarity) ?? 'common'
  const title = (data.title as string) ?? ''
  const createdBy = (data.createdBy as string) ?? ''
  const createdByName = (data.createdByName as string) ?? ''

  const participantFields: Record<string, unknown> = {}
  const fieldPaths = ['status', 'resolvedAt']

  for (const o of outcomes) {
    const leaf: Record<string, unknown> = { outcome: o.kept ? 'kept' : 'missed' }
    fieldPaths.push(`participants.${o.uid}.outcome`)
    if (o.kept) {
      leaf.seedAwarded = rarity
      fieldPaths.push(`participants.${o.uid}.seedAwarded`)
    }
    participantFields[o.uid] = leaf
  }

  const writes: FsWrite[] = [
    {
      update: {
        name: doc.name,
        fields: encodeFields({
          status: 'resolved',
          resolvedAt: now,
          participants: participantFields,
        }),
      },
      updateMask: { fieldPaths },
      // The idempotency guard. If anything else has touched this document since
      // the query — another cron run, a client sweep — the whole batch is
      // rejected and nobody is paid twice.
      currentDocument: { updateTime: doc.updateTime },
    },
  ]

  for (const o of outcomes) {
    if (o.kept) {
      writes.push(
        incrementField(
          docName(sa, 'groups', groupId, 'members', o.uid),
          `seedsByRarity.${rarity}`,
          1,
        ),
      )
    }

    const notifId = autoId()
    writes.push({
      update: {
        name: docName(sa, 'groups', groupId, 'notifications', notifId),
        fields: encodeFields({
          id: notifId,
          forUid: o.uid,
          type: 'commitment_resolved',
          transactionId: commitmentId,
          commitmentId,
          fromUid: createdBy,
          fromName: createdByName,
          toName: title,
          points: 0,
          rarity,
          outcome: o.kept ? 'innocent' : 'guilty',
          read: false,
          cleared: false,
          createdAt: now,
        }),
      },
    })
  }

  return writes
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sa = loadServiceAccount()
  if (!sa) {
    return NextResponse.json({ error: 'Service account not configured' }, { status: 503 })
  }

  const now = new Date()
  const accessToken = await getAccessToken(sa)

  let due: FsDocument[]
  try {
    due = await runCollectionGroupQuery(
      sa,
      accessToken,
      'commitments',
      [
        {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: 'active' },
          },
        },
        {
          fieldFilter: {
            field: { fieldPath: 'deadline' },
            op: 'LESS_THAN_OR_EQUAL',
            value: { timestampValue: now.toISOString() },
          },
        },
      ],
      PAGE_LIMIT,
    )
  } catch (err) {
    // Almost always a missing COLLECTION_GROUP index — surface it rather than
    // reporting a quiet success that hides unresolved commitments.
    return NextResponse.json(
      { error: 'Query failed', detail: String(err) },
      { status: 500 },
    )
  }

  let resolved = 0
  let skipped = 0
  const pushes: { uid: string; rarity: SeedRarity; title: string }[] = []

  for (const doc of due) {
    const groupId = groupIdFromName(doc.name)
    if (!groupId) { skipped++; continue }
    const commitmentId = idFromName(doc.name)
    const data = decodeFields(doc.fields ?? {})

    const outcomes = judge(data)
    if (outcomes.length === 0) { skipped++; continue }

    const result = await commitWrites(
      sa,
      accessToken,
      writesFor(sa, doc, groupId, commitmentId, data, outcomes, now),
    )

    if (!result.ok) {
      // A failed precondition means somebody else already settled this one.
      skipped++
      continue
    }

    resolved++
    const rarity = (data.rarity as SeedRarity) ?? 'common'
    for (const o of outcomes) {
      if (o.kept) pushes.push({ uid: o.uid, rarity, title: (data.title as string) ?? '' })
    }
  }

  // Fire-and-forget: a push that fails must never look like a failed resolution,
  // because the seed is already paid out by this point.
  await Promise.allSettled(
    pushes.map((p) =>
      sendPush(sa, accessToken, p.uid, {
        title: `You earned a ${p.rarity} seed 🌱`,
        body: p.title,
        category: 'social',
      }),
    ),
  )

  return NextResponse.json({ due: due.length, resolved, skipped, pushed: pushes.length })
}
