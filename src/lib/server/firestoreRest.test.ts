import { describe, it, expect } from 'vitest'
import {
  autoId,
  decodeFields,
  decodeValue,
  docName,
  encodeFields,
  encodeValue,
  groupIdFromName,
  idFromName,
  incrementField,
} from './firestoreRest'
import type { ServiceAccount } from './googleAuth'

const sa: ServiceAccount = {
  project_id: 'buddyboard-test',
  client_email: 'x@y.iam.gserviceaccount.com',
  private_key: '',
}

describe('value codecs', () => {
  it('boxes integers as strings, which is what Firestore actually wants', () => {
    expect(encodeValue(3)).toEqual({ integerValue: '3' })
    expect(encodeValue(0)).toEqual({ integerValue: '0' })
    expect(encodeValue(-2)).toEqual({ integerValue: '-2' })
  })

  it('keeps non-integers as doubles', () => {
    expect(encodeValue(1.5)).toEqual({ doubleValue: 1.5 })
  })

  it('round-trips an integer back to a number, not a string', () => {
    expect(decodeValue(encodeValue(42))).toBe(42)
  })

  it('round-trips dates through RFC3339', () => {
    const d = new Date('2026-08-14T12:00:00.000Z')
    expect(encodeValue(d)).toEqual({ timestampValue: '2026-08-14T12:00:00.000Z' })
    expect(decodeValue(encodeValue(d))).toEqual(d)
  })

  it('distinguishes false from absent', () => {
    expect(encodeValue(false)).toEqual({ booleanValue: false })
    expect(decodeValue({ booleanValue: false })).toBe(false)
  })

  it('round-trips arrays of strings', () => {
    const marks = ['2026-01-01', '2026-01-02']
    expect(decodeValue(encodeValue(marks))).toEqual(marks)
  })

  it('round-trips the nested participant map a commitment actually stores', () => {
    const participants = {
      abc: { uid: 'abc', displayName: 'Ada', markedDays: ['2026-01-01'], outcome: 'kept' },
      def: { uid: 'def', displayName: 'Bo', markedDays: [] as string[] },
    }
    expect(decodeValue(encodeValue(participants))).toEqual(participants)
  })

  it('treats null and undefined alike on the wire', () => {
    expect(encodeValue(null)).toEqual({ nullValue: null })
    expect(encodeValue(undefined)).toEqual({ nullValue: null })
    expect(decodeValue({ nullValue: null })).toBeNull()
    expect(decodeValue(undefined)).toBeUndefined()
  })

  it('round-trips a whole field set', () => {
    const fields = { status: 'active', durationDays: 30, thresholdPct: 80 }
    expect(decodeFields(encodeFields(fields))).toEqual(fields)
  })
})

describe('resource names', () => {
  it('builds a document path under the default database', () => {
    expect(docName(sa, 'groups', 'g1', 'commitments', 'c1')).toBe(
      'projects/buddyboard-test/databases/(default)/documents/groups/g1/commitments/c1',
    )
  })

  it('pulls the trailing id back out', () => {
    expect(idFromName(docName(sa, 'groups', 'g1', 'commitments', 'c1'))).toBe('c1')
  })

  it('pulls the group id out of a collection-group query result', () => {
    expect(groupIdFromName(docName(sa, 'groups', 'g1', 'commitments', 'c1'))).toBe('g1')
  })

  it('returns null when there is no group segment to find', () => {
    expect(groupIdFromName('projects/p/databases/(default)/documents/users/u1')).toBeNull()
  })

  it('escapes ids that would otherwise break the path', () => {
    expect(docName(sa, 'groups', 'a/b')).toContain('a%2Fb')
  })
})

describe('autoId', () => {
  it('matches the shape of a Firestore auto-id', () => {
    const id = autoId()
    expect(id).toHaveLength(20)
    expect(id).toMatch(/^[A-Za-z0-9]{20}$/)
  })

  it('does not repeat across a large batch', () => {
    const ids = new Set(Array.from({ length: 500 }, autoId))
    expect(ids.size).toBe(500)
  })
})

describe('incrementField', () => {
  it('emits a transform write with the increment boxed as an integer', () => {
    const name = docName(sa, 'groups', 'g1', 'members', 'u1')
    expect(incrementField(name, 'seedsByRarity.rare', 1)).toEqual({
      transform: {
        document: name,
        fieldTransforms: [
          { fieldPath: 'seedsByRarity.rare', increment: { integerValue: '1' } },
        ],
      },
    })
  })

  it('supports a negative increment for clawing a seed back', () => {
    const w = incrementField('doc', 'seedsByRarity.legendary', -1)
    expect(w).toMatchObject({
      transform: { fieldTransforms: [{ increment: { integerValue: '-1' } }] },
    })
  })
})
