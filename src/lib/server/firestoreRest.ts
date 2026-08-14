/**
 * @file Firestore REST client for server-side routes
 * @description Just enough of the Firestore v1 REST API to run a collection-group
 * query and commit a batch of writes with preconditions and increments. The
 * browser uses the Firebase Web SDK; route handlers can't, so they speak REST
 * with a service-account token instead.
 *
 * Everything here is untyped-in, typed-out on purpose: Firestore's wire format
 * boxes every scalar ({stringValue}, {integerValue: "1"}, …), and the codecs
 * below are the only place that shape should ever be visible.
 */

import type { ServiceAccount } from './googleAuth'

const BASE = 'https://firestore.googleapis.com/v1'

export type FsValue = {
  nullValue?: null
  booleanValue?: boolean
  integerValue?: string
  doubleValue?: number
  timestampValue?: string
  stringValue?: string
  arrayValue?: { values?: FsValue[] }
  mapValue?: { fields?: Record<string, FsValue> }
}

export type FsDocument = {
  name: string
  fields?: Record<string, FsValue>
  createTime?: string
  updateTime?: string
}

// ── Codecs ───────────────────────────────────────────────────────────────────

export function decodeValue(v: FsValue | undefined): unknown {
  if (!v) return undefined
  if (v.nullValue !== undefined) return null
  if (v.booleanValue !== undefined) return v.booleanValue
  if (v.integerValue !== undefined) return Number(v.integerValue)
  if (v.doubleValue !== undefined) return v.doubleValue
  // Timestamps come back as RFC3339 strings; callers want a Date.
  if (v.timestampValue !== undefined) return new Date(v.timestampValue)
  if (v.stringValue !== undefined) return v.stringValue
  if (v.arrayValue !== undefined) return (v.arrayValue.values ?? []).map(decodeValue)
  if (v.mapValue !== undefined) return decodeFields(v.mapValue.fields ?? {})
  return undefined
}

export function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v)
  return out
}

export function encodeValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } }
  if (typeof v === 'object') {
    return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } }
  }
  return { nullValue: null }
}

export function encodeFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {}
  for (const [k, v] of Object.entries(obj)) out[k] = encodeValue(v)
  return out
}

// ── Paths ────────────────────────────────────────────────────────────────────

export function databaseRoot(sa: ServiceAccount): string {
  return `projects/${sa.project_id}/databases/(default)`
}

export function documentsRoot(sa: ServiceAccount): string {
  return `${databaseRoot(sa)}/documents`
}

/** Full resource name for a document, e.g. groups/g1/commitments/c1. */
export function docName(sa: ServiceAccount, ...segments: string[]): string {
  return `${documentsRoot(sa)}/${segments.map(encodeURIComponent).join('/')}`
}

/** The trailing id of a resource name. */
export function idFromName(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1)
}

/** The group id embedded in a `.../groups/{gid}/commitments/{cid}` name. */
export function groupIdFromName(name: string): string | null {
  const parts = name.split('/')
  const i = parts.lastIndexOf('groups')
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null
}

// Firestore's own auto-id alphabet and length, so generated ids are
// indistinguishable from SDK-generated ones.
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function autoId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  let id = ''
  for (const b of bytes) id += ID_CHARS[b % ID_CHARS.length]
  return id
}

// ── Queries ──────────────────────────────────────────────────────────────────

export type FieldFilter = {
  fieldFilter: {
    field: { fieldPath: string }
    op: 'EQUAL' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL'
    value: FsValue
  }
}

/**
 * Run a collection-group query across every group. Requires a COLLECTION_GROUP
 * index on the filtered fields — see firestore.indexes.json.
 */
export async function runCollectionGroupQuery(
  sa: ServiceAccount,
  accessToken: string,
  collectionId: string,
  filters: FieldFilter[],
  limit = 200,
): Promise<FsDocument[]> {
  const res = await fetch(`${BASE}/${documentsRoot(sa)}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId, allDescendants: true }],
        where:
          filters.length === 1
            ? filters[0]
            : { compositeFilter: { op: 'AND', filters } },
        limit,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Firestore runQuery ${res.status}: ${body.slice(0, 400)}`)
  }

  const rows = await res.json() as { document?: FsDocument }[]
  return rows.filter((r) => r.document).map((r) => r.document as FsDocument)
}

// ── Writes ───────────────────────────────────────────────────────────────────

export type FsWrite =
  | {
      update: { name: string; fields: Record<string, FsValue> }
      updateMask?: { fieldPaths: string[] }
      currentDocument?: { exists?: boolean; updateTime?: string }
    }
  | {
      transform: {
        document: string
        fieldTransforms: { fieldPath: string; increment: FsValue }[]
      }
    }

export type CommitResult = { ok: true } | { ok: false; status: number; body: string }

/**
 * Commit a batch of writes atomically. A `currentDocument.updateTime`
 * precondition that no longer holds fails the whole batch with 400
 * FAILED_PRECONDITION — which is exactly the idempotency guard we want when two
 * resolvers race for the same commitment, so it is reported rather than thrown.
 */
export async function commitWrites(
  sa: ServiceAccount,
  accessToken: string,
  writes: FsWrite[],
): Promise<CommitResult> {
  if (writes.length === 0) return { ok: true }

  const res = await fetch(`${BASE}/${databaseRoot(sa)}/documents:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  })

  if (res.ok) return { ok: true }
  const body = await res.text().catch(() => '')
  return { ok: false, status: res.status, body: body.slice(0, 400) }
}

/** Convenience: an integer increment transform on one document field. */
export function incrementField(
  document: string,
  fieldPath: string,
  by: number,
): FsWrite {
  return {
    transform: {
      document,
      fieldTransforms: [{ fieldPath, increment: { integerValue: String(by) } }],
    },
  }
}
