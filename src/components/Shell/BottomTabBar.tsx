'use client'

export const TAB_BAR_HEIGHT = 62

export type TabDef<K extends string> = {
  key: K
  label: string
  icon: string     // emoji — rendered grayscale when inactive
  badge?: number
}

type Props<K extends string> = {
  tabs: readonly TabDef<K>[]
  active: K
  onSelect: (key: K) => void
}

// Fixed bottom navigation. Active tab gets the accent color and a small
// indicator bar; inactive icons render grayscale.
export default function BottomTabBar<K extends string>({ tabs, active, onSelect }: Props<K>) {
  return (
    <nav
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        display: 'flex',
        background: 'rgba(13,13,18,0.94)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            onClick={() => onSelect(tab.key)}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1, height: TAB_BAR_HEIGHT,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, position: 'relative',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            {isActive && (
              <span style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 28, height: 3, borderRadius: '0 0 3px 3px',
                background: 'var(--accent)',
              }} />
            )}
            <span style={{
              fontSize: 19, lineHeight: 1, position: 'relative',
              filter: isActive ? 'none' : 'grayscale(1)',
              opacity: isActive ? 1 : 0.45,
            }}>
              {tab.icon}
              {(tab.badge ?? 0) > 0 && (
                <span style={{
                  position: 'absolute', top: -6, right: -10,
                  background: '#f35b5a', color: 'white',
                  fontSize: 9, fontWeight: 900,
                  borderRadius: 999, minWidth: 15, height: 15, padding: '0 3px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #0d0d12', boxSizing: 'border-box',
                  filter: 'none', opacity: 1,
                }}>
                  {tab.badge}
                </span>
              )}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
              color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
            }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
