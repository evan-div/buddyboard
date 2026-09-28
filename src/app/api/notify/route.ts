import { NextRequest, NextResponse } from 'next/server'
import { loadServiceAccount, verifyIdToken, getAccessToken } from '@/lib/server/googleAuth'
import { sendPush, type NotifCategory } from '@/lib/server/push'

/**
 * Send a push notification to another user.
 *
 * The caller proves who they are with a Firebase ID token; the recipient's push
 * tokens and mute preferences are read server-side, so a client can neither see
 * another user's tokens nor push past their settings.
 *
 * Token verification, service-account auth and FCM delivery live in
 * @/lib/server so the commitment cron can reuse them without a user in the loop.
 */
export async function POST(req: NextRequest) {
  const sa = loadServiceAccount()
  if (!sa) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!idToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const callerUid = await verifyIdToken(idToken, sa.project_id)
  if (!callerUid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { toUid, title, body, url, category = 'points' } = await req.json() as {
    toUid: string
    title: string
    body: string
    url?: string
    category?: NotifCategory
  }

  if (!toUid || !title || !body) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const accessToken = await getAccessToken(sa)
  const result = await sendPush(sa, accessToken, toUid, { title, body, url, category })

  return NextResponse.json(result)
}
