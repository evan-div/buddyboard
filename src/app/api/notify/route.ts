import { NextRequest, NextResponse } from 'next/server'

const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send'
const SERVER_KEY = process.env.FIREBASE_SERVER_KEY

export async function POST(req: NextRequest) {
  if (!SERVER_KEY) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 })
  }

  const { tokens, title, body, url } = await req.json() as {
    tokens: string[]
    title: string
    body: string
    url?: string
  }

  if (!tokens?.length || !title || !body) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const results = await Promise.allSettled(
    tokens.map((token) =>
      fetch(FCM_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `key=${SERVER_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          notification: { title, body, icon: '/favicon.ico' },
          data: { url: url ?? '/' },
        }),
      })
    )
  )

  const failed = results.filter((r) => r.status === 'rejected').length
  return NextResponse.json({ sent: tokens.length - failed, failed })
}
