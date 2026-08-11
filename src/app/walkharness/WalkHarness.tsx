'use client'

// Test-only harness for the plaza's third-person walk mode.
//
// MiiPlaza normally only renders behind Firebase auth inside a real group, which
// makes the walk-mode controls impossible to drive from an end-to-end test. This
// mounts it with stub members instead. The route that renders it is
// development-only (see page.tsx) — it 404s in a production build.

import { useEffect, useRef } from 'react'
import MiiPlaza from '@/components/World/MiiPlaza'
import BottomTabBar, { TAB_BAR_HEIGHT, type TabDef } from '@/components/Shell/BottomTabBar'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import type { Locomotion } from '@/components/World/thirdPerson'
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

// The real plaza sits under the app's fixed tab bar. The harness renders that
// bar too — without it the plaza is the only thing on screen and overlays that
// collide with the shell in the real app look perfectly fine here.
const TABS = [
  { key: 'plaza', label: 'Plaza', icon: '🌳' },
  { key: 'wall', label: 'Wall', icon: '📋' },
  { key: 'leaderboard', label: 'Ranks', icon: '🏆' },
] as const satisfies readonly TabDef<'plaza' | 'wall' | 'leaderboard'>[]

export default function WalkHarness() {
  // Walking has no DOM footprint at all — the position lives in a ref the
  // animator reads 60× a second — so tap-to-move would be untestable from
  // outside without a way to look at it. Publish a reader on window; this route
  // is development-only, so nothing ships.
  const walker = useRef<Locomotion | null>(null)
  useEffect(() => {
    const w = window as unknown as {
      __walkerPos?: () => { x: number; z: number; speed: number } | null
    }
    w.__walkerPos = () => {
      const loco = walker.current
      return loco ? { x: loco.pos.x, z: loco.pos.z, speed: loco.speed } : null
    }
    return () => { delete w.__walkerPos }
  }, [])

  return (
    <>
      <MiiPlaza
        members={MEMBERS}
        currentUid="player-uid-000000000000001"
        groupId="harness-group"
        remainingGive={100}
        remainingTake={100}
        bottomInset={TAB_BAR_HEIGHT}
        walkerProbe={walker}
      />
      <BottomTabBar tabs={TABS} active="plaza" onSelect={() => {}} />
    </>
  )
}
