'use client'

import { useState } from 'react'
import {
  SKIN_TONES,
  HAIR_COLORS,
  BACKGROUND_COLORS,
  SHIRT_COLORS,
} from '@/lib/avatarDefaults'
import type { AvatarConfig } from '@/lib/types'
import AvatarDisplay from './AvatarDisplay'

interface Props {
  value: AvatarConfig
  onChange: (config: AvatarConfig) => void
  className?: string
}

type Tab = 'look' | 'style' | 'colors'

const TABS: { id: Tab; label: string }[] = [
  { id: 'look', label: 'Look' },
  { id: 'style', label: 'Style' },
  { id: 'colors', label: 'Colors' },
]

const HAIR_STYLES: { value: AvatarConfig['hairStyle']; label: string }[] = [
  { value: 'bald', label: 'Bald' },
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
  { value: 'curly', label: 'Curly' },
  { value: 'wavy', label: 'Wavy' },
  { value: 'mohawk', label: 'Mohawk' },
  { value: 'ponytail', label: 'Ponytail' },
]

const EYE_STYLES: { value: AvatarConfig['eyeStyle']; label: string; shopId?: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'happy', label: 'Happy' },
  { value: 'cool', label: 'Cool' },
  { value: 'sleepy', label: 'Sleepy' },
  { value: 'star',   label: 'Stars',  shopId: 'eyes_star'  },
  { value: 'heart',  label: 'Hearts', shopId: 'eyes_heart' },
]

const MOUTH_STYLES: { value: AvatarConfig['mouthStyle']; label: string }[] = [
  { value: 'smile', label: 'Smile' },
  { value: 'grin', label: 'Grin' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'smirk', label: 'Smirk' },
]

const ACCESSORIES: { value: AvatarConfig['accessory']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'glasses', label: 'Glasses' },
  { value: 'sunglasses', label: 'Shades' },
  { value: 'hat', label: 'Hat' },
  { value: 'crown', label: 'Crown' },
  { value: 'headband', label: 'Headband' },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#888', marginBottom: 10, marginTop: 0 }}>
      {children}
    </p>
  )
}

function ColorSwatch({ color, selected, onClick, title }: { color: string; selected: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? color}
      aria-pressed={selected}
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        backgroundColor: color,
        border: selected ? '3px solid #42b842' : '3px solid transparent',
        outline: selected ? '2px solid white' : 'none',
        outlineOffset: -5,
        cursor: 'pointer',
        touchAction: 'manipulation',
        transform: selected ? 'scale(1.15)' : 'scale(1)',
        transition: 'transform 0.1s',
        flexShrink: 0,
      }}
    />
  )
}

function OptionButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        padding: '8px 14px',
        borderRadius: 9999,
        fontSize: 13,
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer',
        touchAction: 'manipulation',
        background: selected ? '#42b842' : '#d4d4d4',
        color: selected ? 'white' : '#333',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {label}
    </button>
  )
}

function LookTab({ config, onChange }: { config: AvatarConfig; onChange: (c: AvatarConfig) => void }) {
  const skinEntries = Object.entries(SKIN_TONES) as [AvatarConfig['skinTone'], string][]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <SectionLabel>Skin Tone</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {skinEntries.map(([key, hex]) => (
            <ColorSwatch key={key} color={hex} selected={config.skinTone === key} onClick={() => onChange({ ...config, skinTone: key })} title={key} />
          ))}
        </div>
      </div>
      <div>
        <SectionLabel>Hair Style</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {HAIR_STYLES.map(({ value, label }) => (
            <OptionButton key={value} label={label} selected={config.hairStyle === value} onClick={() => onChange({ ...config, hairStyle: value })} />
          ))}
        </div>
      </div>
      <div>
        <SectionLabel>
          Hair Color{config.hairStyle === 'bald' && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: '#bbb' }}>(hidden while bald)</span>}
        </SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {HAIR_COLORS.map((hex) => (
            <ColorSwatch key={hex} color={hex} selected={config.hairColor === hex} onClick={() => onChange({ ...config, hairColor: hex })} />
          ))}
        </div>
      </div>
    </div>
  )
}

function StyleTab({ config, onChange }: { config: AvatarConfig; onChange: (c: AvatarConfig) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <SectionLabel>Eyes</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {EYE_STYLES.map(({ value, label, shopId }) => {
            const locked = !!shopId && !unlockedItems.includes(shopId)
            return (
              <OptionButton
                key={value}
                label={label}
                selected={config.eyeStyle === value}
                onClick={() => !locked && onChange({ ...config, eyeStyle: value })}
                locked={locked}
              />
            )
          })}
        </div>
      </div>
      <div>
        <SectionLabel>Mouth</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {MOUTH_STYLES.map(({ value, label }) => (
            <OptionButton key={value} label={label} selected={config.mouthStyle === value} onClick={() => onChange({ ...config, mouthStyle: value })} />
          ))}
        </div>
      </div>
      <div>
        <SectionLabel>Accessory</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ACCESSORIES.map(({ value, label }) => (
            <OptionButton key={value} label={label} selected={config.accessory === value} onClick={() => onChange({ ...config, accessory: value })} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ColorsTab({ config, onChange }: { config: AvatarConfig; onChange: (c: AvatarConfig) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <SectionLabel>Background</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {BACKGROUND_COLORS.map((hex) => (
            <ColorSwatch key={hex} color={hex} selected={config.backgroundColor === hex} onClick={() => onChange({ ...config, backgroundColor: hex })} />
          ))}
        </div>
      </div>
      <div>
        <SectionLabel>Shirt</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {SHIRT_COLORS.map((hex) => (
            <ColorSwatch key={hex} color={hex} selected={config.shirtColor === hex} onClick={() => onChange({ ...config, shirtColor: hex })} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AvatarBuilder({ value, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('look')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      {/* Preview */}
      <div style={{ borderRadius: '50%', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '3px solid white' }}>
        <AvatarDisplay config={value} size={140} />
      </div>

      {/* Panel */}
      <div style={{ width: '100%', background: '#e4e4e4', borderRadius: 20, overflow: 'hidden' }}>
        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 4, padding: 6, background: '#d4d4d4' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-selected={activeTab === tab.id}
              role="tab"
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                touchAction: 'manipulation',
                background: activeTab === tab.id ? '#efefef' : 'transparent',
                color: activeTab === tab.id ? '#111' : '#777',
                boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: 16 }}>
          {activeTab === 'look' && <LookTab config={value} onChange={onChange} />}
          {activeTab === 'style' && <StyleTab config={value} onChange={onChange} />}
          {activeTab === 'colors' && <ColorsTab config={value} onChange={onChange} />}
        </div>
      </div>
    </div>
  )
}
