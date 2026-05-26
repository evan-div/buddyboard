'use client'

import { useRouter } from 'next/navigation'
import type { Group, GroupMember } from '@/lib/types'

type GroupCardProps = {
  group: Group
  member?: GroupMember | null
}

const GRADIENT_PAIRS = [
  'from-indigo-600 to-violet-600',
  'from-violet-600 to-pink-600',
  'from-blue-600 to-indigo-600',
  'from-emerald-600 to-teal-600',
  'from-orange-600 to-rose-600',
  'from-cyan-600 to-blue-600',
]

function getGradient(groupId: string): string {
  let hash = 0
  for (let i = 0; i < groupId.length; i++) {
    hash = groupId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return GRADIENT_PAIRS[Math.abs(hash) % GRADIENT_PAIRS.length]
}

export default function GroupCard({ group, member }: GroupCardProps) {
  const router = useRouter()
  const gradient = getGradient(group.id)

  return (
    <button
      onClick={() => router.push(`/group/${group.id}`)}
      className="w-full text-left bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 hover:border-gray-700 transition-all hover:shadow-lg hover:shadow-indigo-500/10 active:scale-[0.98]"
    >
      {/* Gradient header bar */}
      <div className={`h-2 bg-gradient-to-r ${gradient}`} />

      <div className="p-4">
        <h3 className="text-white font-bold text-base leading-tight truncate">{group.name}</h3>
        {group.description && (
          <p className="text-gray-400 text-sm mt-1 line-clamp-2 leading-snug">
            {group.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-1.5 text-gray-500 text-xs">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>{group.memberCount} member{group.memberCount !== 1 ? 's' : ''}</span>
          </div>

          {member !== undefined && (
            <div className="flex items-center gap-1 text-sm font-semibold">
              <span className="text-yellow-400">⭐</span>
              <span className={member ? (member.totalPoints >= 0 ? 'text-white' : 'text-red-400') : 'text-gray-500'}>
                {member ? member.totalPoints.toLocaleString() : '—'}
              </span>
              <span className="text-gray-500 font-normal text-xs">pts</span>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
