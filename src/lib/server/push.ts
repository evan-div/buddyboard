/**
 * @file Server-side push delivery
 * @description Looks up a recipient's FCM tokens AND notification preferences in
 * one server-side read, so clients never handle other users' push tokens and
 * can't push past someone's mute settings. Prunes tokens FCM reports as
 * permanently dead.
 *
 * Extracted from api/notify/route.ts so the commitment cron can send the
 * finish-line push without a user in the loop.
 */

import type { ServiceAccount } from './googleAuth'

export type NotifCategory = 'points' | 'court' | 'social'

export type Recipient = {
  tokens: string[]
  mutedAll: boolean
  muted: (c: NotifCategory) => boolean
}

const EMPTY: Recipient = { tokens: [], mutedAll: false, muted: () => false }

export async function getRecipient(
  sa: ServiceAccount,
  accessToken: string,
  uid: string,
): Promise<Recipient> {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/users/${encodeURIComponent(uid)}`
  const res = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return EMPTY

  const doc = await res.json() as {
    fields?: {
      fcmTokens?: { arrayValue?: { values?: { stringValue?: string }[] } }
      notifPrefs?: { mapValue?: { fields?: Record<string, { booleanValue?: boolean }> } }
    }
  }

  const tokens = (doc.fields?.fcmTokens?.arrayValue?.values ?? [])
    .map((v) => v.stringValue)
    .filter((t): t is string => !!t)

  const prefs = doc.fields?.notifPrefs?.mapValue?.fields ?? {}
  const mutedAll = prefs.muteAll?.booleanValue === true

  return {
    tokens,
    mutedAll,
    // A category is on unless explicitly set to false.
    muted: (c: NotifCategory) => prefs[c]?.booleanValue === false,
  }
}

export async function replaceRecipientTokens(
  sa: ServiceAccount,
  accessToken: string,
  uid: string,
  tokens: string[],
): Promise<void> {
  const docUrl =
    `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/users/${encodeURIComponent(uid)}` +
    `?updateMask.fieldPaths=fcmTokens`
  await fetch(docUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        fcmTokens: { arrayValue: { values: tokens.map((t) => ({ stringValue: t })) } },
      },
    }),
  }).catch(() => {})
}

// FCM reports a permanently dead token (app uninstalled, token rotated) with
// these codes — anything else (throttling, transient) we leave in place.
export function isDeadTokenError(status: number, errorCode?: string): boolean {
  if (errorCode === 'UNREGISTERED' || errorCode === 'INVALID_ARGUMENT') return true
  return status === 404
}

export type PushResult = { sent: number; failed: number; muted?: boolean }

/**
 * Deliver one notification to every live token a user has, honouring their mute
 * settings and pruning dead tokens afterwards.
 */
export async function sendPush(
  sa: ServiceAccount,
  accessToken: string,
  uid: string,
  msg: { title: string; body: string; url?: string; category?: NotifCategory },
): Promise<PushResult> {
  const recipient = await getRecipient(sa, accessToken, uid)
  if (recipient.mutedAll || recipient.muted(msg.category ?? 'points')) {
    return { sent: 0, failed: 0, muted: true }
  }

  const tokens = recipient.tokens
  if (!tokens.length) return { sent: 0, failed: 0 }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  const deadTokens = new Set<string>()

  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: msg.title, body: msg.body },
            webpush: {
              notification: { icon: '/favicon.ico' },
              fcm_options: { link: msg.url ?? '/' },
            },
          },
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null) as { error?: { status?: string } } | null
        if (isDeadTokenError(res.status, errBody?.error?.status)) deadTokens.add(token)
        throw new Error(`FCM ${res.status}`)
      }
    })
  )

  if (deadTokens.size > 0) {
    const surviving = tokens.filter((t) => !deadTokens.has(t))
    await replaceRecipientTokens(sa, accessToken, uid, surviving)
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return { sent, failed: results.length - sent }
}
