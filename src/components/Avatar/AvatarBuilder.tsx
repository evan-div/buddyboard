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

const EYE_STYLES: { value: AvatarConfig['eyeStyle']; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'happy', label: 'Happy' },
  { value: 'cool', label: 'Cool' },
  { value: 'sleepy', label: 'Sleepy' },
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

// ── Reusable sub-components ───────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
      {children}
    </p>
  )
}

interface ColorSwatchProps {
  color: string
  selected: boolean
  onClick: () => void
  title?: string
}

function ColorSwatch({ color, selected, onClick, title }: ColorSwatchProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? color}
      className={`
        w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none
        ${selected ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' : ''}
      `}
      style={{ backgroundColor: color }}
      aria-pressed={selected}
    />
  )
}

interface OptionButtonProps {
  label: string
  selected: boolean
  onClick: () => void
}

function OptionButton({ label, selected, onClick }: OptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus:outline-none
        ${
          selected
            ? 'bg-indigo-500 text-white shadow-md'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }
      `}
      aria-pressed={selected}
    >
      {label}
    </button>
  )
}

// ── Tab panels ────────────────────────────────────────────────────────────────

function LookTab({
  config,
  onChange,
}: {
  config: AvatarConfig
  onChange: (c: AvatarConfig) => void
}) {
  const skinEntries = Object.entries(SKIN_TONES) as [
    AvatarConfig['skinTone'],
    string,
  ][]

  return (
    <div className="space-y-5">
      {/* Skin tone */}
      <div>
        <SectionLabel>Skin Tone</SectionLabel>
        <div className="flex flex-wrap gap-3">
          {skinEntries.map(([key, hex]) => (
            <ColorSwatch
              key={key}
              color={hex}
              selected={config.skinTone === key}
              onClick={() => onChange({ ...config, skinTone: key })}
              title={key}
            />
          ))}
        </div>
      </div>

      {/* Hair style */}
      <div>
        <SectionLabel>Hair Style</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {HAIR_STYLES.map(({ value, label }) => (
            <OptionButton
              key={value}
              label={label}
              selected={config.hairStyle === value}
              onClick={() => onChange({ ...config, hairStyle: value })}
            />
          ))}
        </div>
      </div>

      {/* Hair color */}
      <div>
        <SectionLabel>
          Hair Color
          {config.hairStyle === 'bald' && (
            <span className="ml-2 text-gray-400 normal-case font-normal tracking-normal">
              (hidden while bald)
            </span>
          )}
        </SectionLabel>
        <div className="flex flex-wrap gap-3">
          {HAIR_COLORS.map((hex) => (
            <ColorSwatch
              key={hex}
              color={hex}
              selected={config.hairColor === hex}
              onClick={() => onChange({ ...config, hairColor: hex })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StyleTab({
  config,
  onChange,
}: {
  config: AvatarConfig
  onChange: (c: AvatarConfig) => void
}) {
  return (
    <div className="space-y-5">
      {/* Eye style */}
      <div>
        <SectionLabel>Eyes</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {EYE_STYLES.map(({ value, label }) => (
            <OptionButton
              key={value}
              label={label}
              selected={config.eyeStyle === value}
              onClick={() => onChange({ ...config, eyeStyle: value })}
            />
          ))}
        </div>
      </div>

      {/* Mouth style */}
      <div>
        <SectionLabel>Mouth</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {MOUTH_STYLES.map(({ value, label }) => (
            <OptionButton
              key={value}
              label={label}
              selected={config.mouthStyle === value}
              onClick={() => onChange({ ...config, mouthStyle: value })}
            />
          ))}
        </div>
      </div>

      {/* Accessory */}
      <div>
        <SectionLabel>Accessory</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {ACCESSORIES.map(({ value, label }) => (
            <OptionButton
              key={value}
              label={label}
              selected={config.accessory === value}
              onClick={() => onChange({ ...config, accessory: value })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ColorsTab({
  config,
  onChange,
}: {
  config: AvatarConfig
  onChange: (c: AvatarConfig) => void
}) {
  return (
    <div className="space-y-5">
      {/* Background color */}
      <div>
        <SectionLabel>Background</SectionLabel>
        <div className="flex flex-wrap gap-3">
          {BACKGROUND_COLORS.map((hex) => (
            <ColorSwatch
              key={hex}
              color={hex}
              selected={config.backgroundColor === hex}
              onClick={() => onChange({ ...config, backgroundColor: hex })}
            />
          ))}
        </div>
      </div>

      {/* Shirt color */}
      <div>
        <SectionLabel>Shirt</SectionLabel>
        <div className="flex flex-wrap gap-3">
          {SHIRT_COLORS.map((hex) => (
            <ColorSwatch
              key={hex}
              color={hex}
              selected={config.shirtColor === hex}
              onClick={() => onChange({ ...config, shirtColor: hex })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AvatarBuilder({ value, onChange, className }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('look')

  return (
    <div className={`flex flex-col items-center gap-6 ${className ?? ''}`}>
      {/* Preview */}
      <div className="relative">
        <div className="rounded-full overflow-hidden shadow-xl ring-4 ring-white">
          <AvatarDisplay config={value} size={160} />
        </div>
      </div>

      {/* Panel */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Tab nav */}
        <div className="flex gap-1 p-2 bg-gray-50 border-b border-gray-100">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 py-1.5 px-3 rounded-xl text-sm font-semibold transition-colors focus:outline-none
                ${
                  activeTab === tab.id
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }
              `}
              aria-selected={activeTab === tab.id}
              role="tab"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-4">
          {activeTab === 'look' && (
            <LookTab config={value} onChange={onChange} />
          )}
          {activeTab === 'style' && (
            <StyleTab config={value} onChange={onChange} />
          )}
          {activeTab === 'colors' && (
            <ColorsTab config={value} onChange={onChange} />
          )}
        </div>
      </div>
    </div>
  )
}
