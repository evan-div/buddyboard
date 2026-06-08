import { NextRequest, NextResponse } from 'next/server'

type ServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')

  const header = encode({ alg: 'RS256', typ: 'JWT' })
  const payload = encode({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
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

export async function POST(req: NextRequest) {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!saRaw) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 })
  }

  const sa: ServiceAccount = JSON.parse(saRaw)

  const { tokens, title, body, url } = await req.json() as {
    tokens: string[]
    title: string
    body: string
    url?: string
  }

  if (!tokens?.length || !title || !body) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const accessToken = await getAccessToken(sa)
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
