import { NextRequest, NextResponse } from 'next/server'

type ServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
}

// ---------------------------------------------------------------------------
// Firebase ID token verification (no firebase-admin dependency).
// Verifies the RS256 signature against Google's securetoken JWKS and checks
// the standard claims for this project.
// ---------------------------------------------------------------------------

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
async function verifyIdToken(idToken: string, projectId: string): Promise<string | null> {
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

// ---------------------------------------------------------------------------
// Service-account OAuth token (FCM send + Firestore read)
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(sa: ServiceAccount): Promise<string> {
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

// Look up the recipient's FCM tokens server-side so clients never handle
// other users' push tokens.
async function getRecipientTokens(
  sa: ServiceAccount,
  accessToken: string,
  uid: string
): Promise<string[]> {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/users/${encodeURIComponent(uid)}`
  const res = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []

  const doc = await res.json() as {
    fields?: {
      fcmTokens?: { arrayValue?: { values?: { stringValue?: string }[] } }
    }
  }
  const values = doc.fields?.fcmTokens?.arrayValue?.values ?? []
  return values
    .map((v) => v.stringValue)
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
}

export async function POST(req: NextRequest) {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!saRaw) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 })
  }

  const sa: ServiceAccount = JSON.parse(saRaw)

  const authHeader = req.headers.get('authorization') ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!idToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const callerUid = await verifyIdToken(idToken, sa.project_id)
  if (!callerUid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { toUid, title, body, url } = await req.json() as {
    toUid: string
    title: string
    body: string
    url?: string
  }

  if (!toUid || !title || !body) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const accessToken = await getAccessToken(sa)
  const tokens = await getRecipientTokens(sa, accessToken, toUid)
  if (!tokens.length) {
    return NextResponse.json({ sent: 0, failed: 0 })
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`

  const results = await Promise.allSettled(
    tokens.map((token) =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            webpush: {
              notification: { icon: '/favicon.ico' },
              fcm_options: { link: url ?? '/' },
            },
          },
        }),
      })
    )
  )

  const failed = results.filter((r) => r.status === 'rejected').length
  return NextResponse.json({ sent: tokens.length - failed, failed })
}
