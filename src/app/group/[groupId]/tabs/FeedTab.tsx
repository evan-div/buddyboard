'use client'

import { useState, useEffect } from 'react'
import FeedItem from '@/components/Feed/FeedItem'
import { subscribeToFeed, addReaction } from '@/lib/firestore'
import type { GroupMember, Transaction } from '@/lib/types'

type FeedTabProps = {
  groupId: string
  members: GroupMember[]
  currentUid: string
}

const CARD_ROTATIONS = [-7, 4, -9, 6, -3, 8, -5, 2, 10, -6]
const CARD_OFFSETS  = [10, -20, 25, -10, 30, -25, 5, -30, 15, -15]
const CARD_OVERLAP  = '-60px'

const FEED_PAGE = 50

export default function FeedTab({ groupId, members, currentUid }: FeedTabProps) {
  const [feed, setFeed] = useState<Transaction[]>([])
  const [feedLoading, setFeedLoading] = useState(true)
  const [feedLimit, setFeedLimit] = useState(FEED_PAGE)

  function handleReact(txId: string, emoji: string) {
    const reactorName = members.find((m) => m.uid === currentUid)?.displayName ?? ''
    addReaction(groupId, txId, emoji, currentUid, reactorName).catch(console.error)
  }

  useEffect(() => {
    // feedLoading starts true; the first snapshot clears it. Raising feedLimit
    // resubscribes with a deeper window (served mostly from the local cache).
    const unsubscribe = subscribeToFeed(groupId, (transactions) => {
      setFeed(transactions)
      setFeedLoading(false)
    }, feedLimit)
    return () => unsubscribe()
  }, [groupId, feedLimit])

  if (feedLoading) {
    return (
      <div style={{ position: 'relative', paddingBottom: '32px' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              marginTop: i === 0 ? 0 : CARD_OVERLAP,
              position: 'relative',
              zIndex: 3 - i,
              background: 'white',
              borderRadius: '24px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
              transform: `rotate(${CARD_ROTATIONS[i]}deg)`,
              opacity: 0.7,
            }}
          >
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#f3f4f6' }} />
            <div style={{ width: 80, height: 36, borderRadius: '8px', background: '#f3f4f6' }} />
            <div style={{ width: 120, height: 16, borderRadius: '6px', background: '#f3f4f6' }} />
          </div>
        ))}
      </div>
    )
  }

  if (feed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">✨</div>
        <h3 className="text-white font-bold text-base mb-1">No activity yet</h3>
        <p className="text-gray-400 text-sm">Be the first to award some points!</p>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', paddingBottom: '32px' }}>
      {feed.map((tx, i) => (
        <div
          key={tx.id}
          style={{
            marginTop: i === 0 ? 0 : CARD_OVERLAP,
            position: 'relative',
            zIndex: feed.length - i,
            transform: `translateX(${CARD_OFFSETS[i % CARD_OFFSETS.length]}px)`,
          }}
        >
          <FeedItem
            transaction={tx}
            members={members}
            rotation={CARD_ROTATIONS[i % CARD_ROTATIONS.length]}
            currentUid={currentUid}
            onReact={handleReact}
          />
        </div>
      ))}
      {feed.length >= feedLimit && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 20 }}>
          <button
            onClick={() => setFeedLimit((n) => n + FEED_PAGE)}
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', fontWeight: 700, fontSize: 14,
              borderRadius: 999, padding: '10px 22px', cursor: 'pointer',
            }}
          >
            Load older activity
          </button>
        </div>
      )}
    </div>
  )
}
