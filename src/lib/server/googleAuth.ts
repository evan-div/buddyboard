/**
 * @file Service-account auth for server-side Google APIs
 * @description Mints an OAuth access token from the FIREBASE_SERVICE_ACCOUNT
 * JSON, and verifies Firebase ID tokens against Google's JWKS. Deliberately has
 * no firebase-admin dependency — everything here is WebCrypto and fetch, which
 * is what lets it run on the edge-ish Node runtime Vercel gives route handlers.
 *
 * Extracted from api/notify/route.ts so the commitment cron can reuse it. The
 * requested scopes already include `datastore`, which is what makes server-side
 * Firestore REST reads and writes possible at all.
 */

export type ServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
}

export function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    return JSON.parse(raw) as ServiceAccount
  } catch {
    return null
  }
}

// ── ID token verification ────────────────────────────────────────────────────

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

let cachedJwks: { keys: JsonWebKey[]; expiresAt: number } | null = null

async function getJwks(): Promise<JsonWebKey[]> {
  const now = Date.now()
  if (cachedJwks && cachedJwks.expiresAt > now) return cachedJwks.keys

  const res = await fetch(JWKS_URL)
  if (!res.ok) throw new Error('JWKS fetch failed')
  const data = await res.json() as { keys: (JsonWebKey & { kid?: string })[] }

  // Respect Google's cache lifetime; fall back to 1 hour
  const cacheControl = res.headers.get('cache-control') ?? ''
  const maxAge = /max-age=(\d+)/.exec(cacheControl)
  const ttl = maxAge ? parseInt(maxAge[1], 10) * 1000 : 3600_000

  cachedJwks = { keys: data.keys, expiresAt: now + ttl }
  return data.keys
}

function decodeSegment<T>(seg: string): T {
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8')) as T
}

// Returns the verified uid, or null if the token is invalid.
export async function verifyIdToken(
  idToken: string,
  projectId: string,
): Promise<string | null> {
  try {
    const parts = idToken.split('.')
    if (parts.length !== 3) return null

    const header = decodeSegment<{ alg?: string; kid?: string }>(parts[0])
    if (header.alg !== 'RS256' || !header.kid) return null

    const jwks = await getJwks()
    const jwk = jwks.find((k) => (k as { kid?: string }).kid === header.kid)
    if (!jwk) return null

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      Buffer.from(parts[2], 'base64url'),
      Buffer.from(`${parts[0]}.${parts[1]}`)
    )
    if (!valid) return null

    const payload = decodeSegment<{
      aud?: string
      iss?: string
      sub?: string
      exp?: number
    }>(parts[1])

    const now = Math.floor(Date.now() / 1000)
    if (payload.aud !== projectId) return null
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null
    if (!payload.exp || payload.exp <= now) return null
    if (!payload.sub) return null

    return payload.sub
  } catch {
    return null
  }
}

// ── Access token (FCM send + Firestore read/write) ───────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null

export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')

  const header = encode({ alg: 'RS256', typ: 'JWT' })
  const payload = encode({
    iss: sa.client_email,
    scope:
      'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })

  const signingInput = `${header}.${payload}`

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')

  const keyData = Buffer.from(pemBody, 'base64')
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    Buffer.from(signingInput)
  )

  const jwt = `${signingInput}.${Buffer.from(sig).toString('base64url')}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken = { value: data.access_token, expiresAt: now + (data.expires_in ?? 3600) }
  return cachedToken.value
}
