'use client'

import type { Transaction, GroupMember } from '@/lib/types'
import AvatarDisplay from '@/components/Avatar/AvatarDisplay'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import { timeAgo, formatPoints } from '@/lib/utils'

type FeedItemProps = {
  transaction: Transaction
  members: GroupMember[]
}

export default function FeedItem({ transaction, members }: FeedItemProps) {
  const isPositive = transaction.points > 0

  const giverMember = members.find((m) => m.uid === transaction.fromUid)

  return (
    <div
      className={`rounded-xl p-4 border transition-colors ${
        isPositive
          ? 'bg-green-500/5 border-green-500/15'
          : 'bg-red-500/5 border-red-500/15'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Giver avatar */}
        <div className="flex-shrink-0">
          <AvatarDisplay
            config={giverMember?.avatar ?? DEFAULT_AVATAR}
            size={32}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 leading-snug">
            <span className="font-semibold text-white">{transaction.fromName}</span>
            {' '}
            <span className={isPositive ? 'text-green-400' : 'text-red-400'}>
              {isPositive ? 'gave' : 'took'}
            </span>
            {' '}
            <span className={`font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {formatPoints(transaction.points)}
            </span>
            {' '}
            {isPositive ? 'to' : 'from'}{' '}
            <span className="font-semibold text-white">{transaction.toName}</span>
          </p>

          {transaction.reason && (
            <p className="text-gray-400 text-xs mt-1 italic">
              &ldquo;{transaction.reason}&rdquo;
            </p>
          )}

          <p className="text-gray-600 text-xs mt-1.5">
            {timeAgo(transaction.createdAt)}
          </p>
        </div>
      </div>
    </div>
  )
}
