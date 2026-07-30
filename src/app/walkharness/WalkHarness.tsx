'use client'

// Test-only harness for the plaza's third-person walk mode.
//
// MiiPlaza normally only renders behind Firebase auth inside a real group, which
// makes the walk-mode controls impossible to drive from an end-to-end test. This
// mounts it with stub members instead. The route that renders it is
// development-only (see page.tsx) — it 404s in a production build.

import MiiPlaza from '@/components/World/MiiPlaza'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import type { GroupMember } from '@/lib/types'

function member(uid: string, displayName: string, bodyColor: string): GroupMember {
  return {
    uid,
    displayName,
    avatar: { ...DEFAULT_AVATAR, bodyColor },
    totalPoints: 0,
    dailyPointsGiven: 0,
    dailyPointsTaken: 0,
    lastResetDate: '',
    joinedAt: new Date(),
  }
}

// The walker is deliberately a colour nothing else in the palette uses, so a
// screenshot makes it obvious which bean the camera is actually following.
const MEMBERS: GroupMember[] = [
  member('player-uid-000000000000001', 'You', '#FF00FF'),
  member('buddy-uid-000000000000002', 'Riley', '#F97316'),
  member('buddy-uid-000000000000003', 'Sam', '#22c55e'),
  member('buddy-uid-000000000000004', 'Jordan', '#F5D033'),
]

export default function WalkHarness() {
  return (
    <MiiPlaza
      members={MEMBERS}
      currentUid="player-uid-000000000000001"
      groupId="harness-group"
      remainingGive={100}
      remainingTake={100}
    />
  )
}
