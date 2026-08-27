/**
 * @file Firestore security-rules tests for commitments and their disputes
 * @description These run against the Firestore emulator, NOT in the normal
 * `npm test` run — see vitest.rules.config.ts and `npm run test:rules`.
 *
 * Why this file exists: the `cases` rule originally allowed only the DEFENDANT
 * to open a case, which is right for a points appeal (you appeal your own loss)
 * and wrong for a commitment dispute (you accuse someone else). That bug worked
 * perfectly against a local setup with no rules enforcement and would have
 * failed every dispute in production with permission-denied. Rules are the one
 * part of this codebase that cannot be checked by reading the app code, so they
 * get their own suite.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, increment } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

const GID = 'g1'
const MAYOR = 'mayor-uid'
const ALICE = 'alice-uid'
const BOB = 'bob-uid'
const OUTSIDER = 'outsider-uid'

let env: RulesTestEnvironment

const asUser = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const asAnon = () => env.unauthenticatedContext().firestore() as unknown as Firestore

function commitmentDoc(db: Firestore, id: string) {
  return doc(db, 'groups', GID, 'commitments', id)
}

function newCommitment(createdBy: string) {
  return {
    id: 'c-new',
    title: 'Run three times a week',
    createdBy,
    createdByName: 'Someone',
    status: 'forming',
    durationDays: 30,
    rarity: 'rare',
    cadence: 'weekly',
    targetPerPeriod: 3,
    thresholdPct: 80,
    createdAt: new Date(),
    participants: {},
  }
}

// A dispute: the accuser writes the case against someone else.
function commitmentCase(accuserUid: string, defendantUid: string) {
  return {
    id: 'case-new',
    subject: 'commitment',
    commitmentId: 'c1',
    transactionId: 'c1',
    defendantUid,
    defendantName: 'Defendant',
    accuserUid,
    accuserName: 'Accuser',
    points: 0,
    reason: 'Run three times a week',
    appealComment: 'They did not run',
    status: 'in_court',
    createdAt: new Date(),
    votes: {},
  }
}

// A points appeal: filed by the person who lost the points, about themselves.
function pointsCase(defendantUid: string, accuserUid: string) {
  return {
    id: 'case-points',
    transactionId: 'tx1',
    defendantUid,
    defendantName: 'Defendant',
    accuserUid,
    accuserName: 'Accuser',
    points: 10,
    appealComment: 'That was unfair',
    status: 'pending_review',
    createdAt: new Date(),
    votes: {},
  }
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-buddyboard-rules',
    firestore: {
      rules: readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'groups', GID), {
      id: GID,
      name: 'Test group',
      createdBy: MAYOR,
      inviteCode: 'ABC123',
      memberCount: 3,
    })
    for (const uid of [MAYOR, ALICE, BOB]) {
      await setDoc(doc(db, 'groups', GID, 'members', uid), {
        uid, displayName: uid, totalPoints: 0, seeds: 0,
      })
    }
    await setDoc(doc(db, 'groups', GID, 'commitments', 'c1'), {
      ...newCommitment(ALICE),
      id: 'c1',
      participants: {
        [ALICE]: { uid: ALICE, displayName: 'Alice', markedDays: [] },
        [BOB]: { uid: BOB, displayName: 'Bob', markedDays: [] },
      },
    })
    await setDoc(doc(db, 'groups', GID, 'notifications', 'n1'), {
      id: 'n1', forUid: ALICE, type: 'commitment_resolved', transactionId: 'c1',
      fromUid: BOB, fromName: 'Bob', toName: 'x', points: 0, read: false, cleared: false,
    })
  })
})

describe('commitments — reading', () => {
  it('lets a member read the group\'s commitments', async () => {
    await assertSucceeds(getDoc(commitmentDoc(asUser(ALICE), 'c1')))
  })

  it('keeps non-members out', async () => {
    await assertFails(getDoc(commitmentDoc(asUser(OUTSIDER), 'c1')))
  })

  it('keeps signed-out visitors out', async () => {
    await assertFails(getDoc(commitmentDoc(asAnon(), 'c1')))
  })
})

describe('commitments — creating', () => {
  it('lets a member open one attributed to themselves', async () => {
    await assertSucceeds(
      setDoc(commitmentDoc(asUser(ALICE), 'c-new'), newCommitment(ALICE)),
    )
  })

  it('refuses one attributed to somebody else', async () => {
    await assertFails(
      setDoc(commitmentDoc(asUser(ALICE), 'c-new'), newCommitment(BOB)),
    )
  })

  it('refuses a non-member entirely', async () => {
    await assertFails(
      setDoc(commitmentDoc(asUser(OUTSIDER), 'c-new'), newCommitment(OUTSIDER)),
    )
  })
})

describe('commitments — updating', () => {
  // Joining and marking both write another member's slot in the participants
  // map, so member-wide update is deliberate rather than an oversight. This
  // test documents that intent — it is the client-enforced ceiling described in
  // the rules header, and tightening it needs Cloud Functions.
  it('lets any member update, which is what joining and marking require', async () => {
    await assertSucceeds(
      updateDoc(commitmentDoc(asUser(BOB), 'c1'), {
        [`participants.${BOB}.markedDays`]: ['2026-01-01'],
      }),
    )
  })

  it('lets a member write another member\'s participant slot (the resolver path)', async () => {
    await assertSucceeds(
      updateDoc(commitmentDoc(asUser(BOB), 'c1'), {
        [`participants.${ALICE}.outcome`]: 'kept',
      }),
    )
  })

  it('refuses a non-member', async () => {
    await assertFails(
      updateDoc(commitmentDoc(asUser(OUTSIDER), 'c1'), { status: 'cancelled' }),
    )
  })
})

describe('commitments — deleting', () => {
  it('lets the creator delete their own', async () => {
    await assertSucceeds(deleteDoc(commitmentDoc(asUser(ALICE), 'c1')))
  })

  it('lets the mayor delete anyone\'s', async () => {
    await assertSucceeds(deleteDoc(commitmentDoc(asUser(MAYOR), 'c1')))
  })

  it('refuses another member', async () => {
    await assertFails(deleteDoc(commitmentDoc(asUser(BOB), 'c1')))
  })
})

describe('court cases — the accuser/defendant regression', () => {
  // The bug: `allow create` required defendantUid == request.auth.uid, so a
  // dispute filed against somebody else was rejected. Every commitment dispute
  // would have failed in production.
  it('lets an accuser open a commitment dispute against someone else', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(ALICE), 'groups', GID, 'cases', 'case-new'),
        commitmentCase(ALICE, BOB)),
    )
  })

  it('still lets a defendant appeal their own points loss', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(ALICE), 'groups', GID, 'cases', 'case-points'),
        pointsCase(ALICE, BOB)),
    )
  })

  it('refuses a commitment dispute that names someone else as the accuser', async () => {
    // Alice cannot file a dispute pretending Bob raised it.
    await assertFails(
      setDoc(doc(asUser(ALICE), 'groups', GID, 'cases', 'case-new'),
        commitmentCase(BOB, MAYOR)),
    )
  })

  it('refuses a points appeal filed on somebody else\'s behalf', async () => {
    await assertFails(
      setDoc(doc(asUser(ALICE), 'groups', GID, 'cases', 'case-points'),
        pointsCase(BOB, MAYOR)),
    )
  })

  it('refuses a non-member opening either kind', async () => {
    await assertFails(
      setDoc(doc(asUser(OUTSIDER), 'groups', GID, 'cases', 'case-new'),
        commitmentCase(OUTSIDER, ALICE)),
    )
    await assertFails(
      setDoc(doc(asUser(OUTSIDER), 'groups', GID, 'cases', 'case-points'),
        pointsCase(OUTSIDER, ALICE)),
    )
  })

  it('lets members vote on an open case', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups', GID, 'cases', 'c-open'),
        commitmentCase(ALICE, BOB))
    })
    await assertSucceeds(
      updateDoc(doc(asUser(MAYOR), 'groups', GID, 'cases', 'c-open'),
        { [`votes.${MAYOR}`]: 'guilty' }),
    )
  })
})

describe('seed payout and notifications', () => {
  it('lets a member increment another member\'s seedsByRarity — the resolver path', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(BOB), 'groups', GID, 'members', ALICE), {
        'seedsByRarity.rare': increment(1),
      }),
    )
  })

  it('refuses a non-member touching seed inventory', async () => {
    await assertFails(
      updateDoc(doc(asUser(OUTSIDER), 'groups', GID, 'members', ALICE), {
        'seedsByRarity.rare': increment(1),
      }),
    )
  })

  it('keeps a commitment notification private to its recipient', async () => {
    await assertSucceeds(getDoc(doc(asUser(ALICE), 'groups', GID, 'notifications', 'n1')))
    await assertFails(getDoc(doc(asUser(BOB), 'groups', GID, 'notifications', 'n1')))
  })

  it('lets a member write a resolution notification for someone else', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(BOB), 'groups', GID, 'notifications', 'n2'), {
        id: 'n2', forUid: ALICE, type: 'commitment_resolved', transactionId: 'c1',
        commitmentId: 'c1', fromUid: BOB, fromName: 'Bob', toName: 'Run',
        points: 0, rarity: 'rare', read: false, cleared: false,
      }),
    )
  })
})
