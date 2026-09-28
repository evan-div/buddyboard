'use client'

// Test-only harness for the Commitments tab.
//
// The tab normally only renders behind Firebase auth inside a real group, and a
// commitment takes at minimum a week and two people to reach any interesting
// state. This mounts it standalone so the whole lifecycle can be walked in
// preview mode. The route that renders it is development-only (see page.tsx) —
// it 404s in a production build.
//
// Add ?preview=1 to get the fixture set; without it the tab tries to subscribe
// to Firestore and simply shows an empty group.

import CommitmentsTab from '@/app/group/[groupId]/tabs/CommitmentsTab'
import BottomTabBar, { TAB_BAR_HEIGHT, type TabDef } from '@/components/Shell/BottomTabBar'

const TABS = [
  { key: 'plaza', label: 'Plaza', icon: '🌳' },
  { key: 'pacts', label: 'Pacts', icon: '🤝' },
  { key: 'court', label: 'Court', icon: '⚖️' },
] as const satisfies readonly TabDef<'plaza' | 'pacts' | 'court'>[]

const MEMBER_UIDS = [
  'harness-me',
  'preview-riley',
  'preview-sam',
  'preview-jordan',
]

export default function PactHarness() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg, #0d0d12)' }}>
      <div style={{
        maxWidth: 560, margin: '0 auto',
        padding: `16px 14px ${TAB_BAR_HEIGHT + 24}px`,
      }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
            textTransform: 'uppercase', color: 'var(--accent, #a78bfa)',
          }}>
            Together
          </div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 800, color: '#f9fafb' }}>
            🤝 Commitments
          </h1>
        </div>

        <CommitmentsTab
          groupId="harness-group"
          currentUid="harness-me"
          displayName="You"
          memberUids={MEMBER_UIDS}
        />
      </div>
      <BottomTabBar tabs={TABS} active="pacts" onSelect={() => {}} />
    </div>
  )
}
