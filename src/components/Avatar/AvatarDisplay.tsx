'use client'

import { useId } from 'react'
import { SKIN_TONES } from '@/lib/avatarDefaults'
import type { AvatarConfig } from '@/lib/types'

interface Props {
  config: AvatarConfig
  size?: number
  className?: string
}

const SPECIAL_BACKGROUNDS = ['fire', 'ice', 'galaxy', 'rainbow']

function renderBackground(bg: string, gradId: string) {
  if (bg === 'fire') {
    return (
      <>
        <defs>
          <radialGradient id={gradId} cx="50%" cy="80%" r="70%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="40%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#dc2626" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill={`url(#${gradId})`} />
      </>
    )
  }
  if (bg === 'ice') {
    return (
      <>
        <defs>
          <radialGradient id={gradId} cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="50%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill={`url(#${gradId})`} />
      </>
    )
  }
  if (bg === 'galaxy') {
    const stars = [
      [15, 12], [80, 8], [25, 70], [88, 65], [60, 20],
      [10, 45], [90, 35], [50, 80], [35, 25], [75, 55],
      [20, 88], [70, 15], [45, 60], [85, 80], [30, 50],
    ]
    return (
      <>
        <defs>
          <radialGradient id={gradId} cx="60%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#6d28d9" />
            <stop offset="60%" stopColor="#1e1b4b" />
            <stop offset="100%" stopColor="#0f0a1e" />
          </radialGradient>
          <clipPath id={`clip-${gradId}`}>
            <circle cx="50" cy="50" r="50" />
          </clipPath>
        </defs>
        <circle cx="50" cy="50" r="50" fill={`url(#${gradId})`} />
        <g clipPath={`url(#clip-${gradId})`}>
          {stars.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.2 : 0.7} fill="white" opacity={0.6 + (i % 3) * 0.1} />
          ))}
        </g>
      </>
    )
  }
  if (bg === 'rainbow') {
    return (
      <>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"    stopColor="#f87171" />
            <stop offset="20%"   stopColor="#fb923c" />
            <stop offset="40%"   stopColor="#facc15" />
            <stop offset="60%"   stopColor="#4ade80" />
            <stop offset="80%"   stopColor="#60a5fa" />
            <stop offset="100%"  stopColor="#c084fc" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill={`url(#${gradId})`} />
      </>
    )
  }
  return <circle cx="50" cy="50" r="50" fill={bg} />
}

// ── Hair ─────────────────────────────────────────────────────────────────────

function renderHair(config: AvatarConfig) {
  const { hairStyle, hairColor } = config
  const fill = hairColor

  if (hairStyle === 'bald') return null

  if (hairStyle === 'short') {
    return (
      <g>
        <ellipse cx="50" cy="30" rx="22" ry="13" fill={fill} />
        <rect x="28" y="30" width="44" height="10" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'medium') {
    return (
      <g>
        <ellipse cx="50" cy="28" rx="23" ry="14" fill={fill} />
        <rect x="27" y="28" width="46" height="12" fill={fill} />
        <rect x="27" y="38" width="8" height="18" rx="3" fill={fill} />
        <rect x="65" y="38" width="8" height="18" rx="3" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'long') {
    return (
      <g>
        <ellipse cx="50" cy="28" rx="23" ry="14" fill={fill} />
        <rect x="27" y="28" width="46" height="12" fill={fill} />
        <rect x="27" y="38" width="8" height="31" rx="4" fill={fill} />
        <rect x="65" y="38" width="8" height="31" rx="4" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'curly') {
    return (
      <g>
        <path
          d="M 28 36 Q 28 20 50 20 Q 72 20 72 36 Q 66 26 62 32 Q 58 22 54 32 Q 50 22 46 32 Q 42 22 38 32 Q 34 26 28 36 Z"
          fill={fill}
        />
        <rect x="28" y="32" width="44" height="10" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'wavy') {
    return (
      <g>
        <path
          d="M 28 36 C 28 18 72 18 72 36 C 68 29 62 33 58 29 C 54 25 46 25 42 29 C 38 33 32 29 28 36 Z"
          fill={fill}
        />
        <rect x="27" y="32" width="46" height="10" fill={fill} />
        <rect x="27" y="40" width="8" height="20" rx="4" fill={fill} />
        <rect x="65" y="40" width="8" height="20" rx="4" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'mohawk') {
    return (
      <g>
        <rect x="46" y="12" width="8" height="22" rx="4" fill={fill} />
        <ellipse cx="50" cy="34" rx="6" ry="4" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'ponytail') {
    return (
      <g>
        <ellipse cx="50" cy="29" rx="22" ry="12" fill={fill} />
        <rect x="28" y="29" width="44" height="10" fill={fill} />
        <ellipse cx="71" cy="36" rx="7" ry="5" fill={fill} />
        <rect x="65" y="33" width="8" height="6" rx="3" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'bun') {
    return (
      <g>
        <ellipse cx="50" cy="30" rx="22" ry="13" fill={fill} />
        <rect x="28" y="30" width="44" height="10" fill={fill} />
        {/* bun on top */}
        <circle cx="50" cy="19" r="8" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'topknot') {
    return (
      <g>
        <ellipse cx="50" cy="30" rx="22" ry="13" fill={fill} />
        <rect x="28" y="30" width="44" height="10" fill={fill} />
        {/* tall topknot */}
        <ellipse cx="50" cy="16" rx="5" ry="10" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'afro') {
    return (
      <g>
        {/* large puffy dome */}
        <ellipse cx="50" cy="26" rx="28" ry="22" fill={fill} />
        <rect x="22" y="30" width="56" height="12" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'braids') {
    return (
      <g>
        {/* hair cap */}
        <ellipse cx="50" cy="28" rx="23" ry="14" fill={fill} />
        <rect x="27" y="28" width="46" height="12" fill={fill} />
        {/* left braid */}
        <rect x="27" y="38" width="8" height="32" rx="4" fill={fill} />
        <line x1="27" y1="44" x2="35" y2="44" stroke={hairColor === '#1a1a1a' ? '#555' : '#0008'} strokeWidth="1.5" />
        <line x1="27" y1="50" x2="35" y2="50" stroke={hairColor === '#1a1a1a' ? '#555' : '#0008'} strokeWidth="1.5" />
        <line x1="27" y1="56" x2="35" y2="56" stroke={hairColor === '#1a1a1a' ? '#555' : '#0008'} strokeWidth="1.5" />
        <line x1="27" y1="62" x2="35" y2="62" stroke={hairColor === '#1a1a1a' ? '#555' : '#0008'} strokeWidth="1.5" />
        {/* right braid */}
        <rect x="65" y="38" width="8" height="32" rx="4" fill={fill} />
        <line x1="65" y1="44" x2="73" y2="44" stroke={hairColor === '#1a1a1a' ? '#555' : '#0008'} strokeWidth="1.5" />
        <line x1="65" y1="50" x2="73" y2="50" stroke={hairColor === '#1a1a1a' ? '#555' : '#0008'} strokeWidth="1.5" />
        <line x1="65" y1="56" x2="73" y2="56" stroke={hairColor === '#1a1a1a' ? '#555' : '#0008'} strokeWidth="1.5" />
        <line x1="65" y1="62" x2="73" y2="62" stroke={hairColor === '#1a1a1a' ? '#555' : '#0008'} strokeWidth="1.5" />
      </g>
    )
  }

  return null
}

// ── Eyes ──────────────────────────────────────────────────────────────────────

function renderEyes(config: AvatarConfig) {
  const { eyeStyle } = config
  const pupil = '#1a1a1a'
  const white = '#ffffff'
  const skinColor = SKIN_TONES[config.skinTone]

  if (eyeStyle === 'normal') {
    return (
      <g>
        <circle cx="42" cy="42" r="3" fill={white} />
        <circle cx="42" cy="42" r="1.4" fill={pupil} />
        <circle cx="58" cy="42" r="3" fill={white} />
        <circle cx="58" cy="42" r="1.4" fill={pupil} />
      </g>
    )
  }

  if (eyeStyle === 'happy') {
    return (
      <g>
        <path d="M 39 44 Q 42 39 45 44" stroke={pupil} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M 55 44 Q 58 39 61 44" stroke={pupil} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </g>
    )
  }

  if (eyeStyle === 'cool') {
    return (
      <g>
        <ellipse cx="42" cy="42" rx="3" ry="1.8" fill={white} />
        <ellipse cx="42" cy="42" rx="1.4" ry="1.2" fill={pupil} />
        <ellipse cx="58" cy="42" rx="3" ry="1.8" fill={white} />
        <ellipse cx="58" cy="42" rx="1.4" ry="1.2" fill={pupil} />
      </g>
    )
  }

  if (eyeStyle === 'sleepy') {
    return (
      <g>
        <circle cx="42" cy="42" r="3" fill={white} />
        <path d="M 39 42 Q 42 46 45 42" fill={skinColor} />
        <circle cx="42" cy="41" r="1.2" fill={pupil} />
        <circle cx="58" cy="42" r="3" fill={white} />
        <path d="M 55 42 Q 58 46 61 42" fill={skinColor} />
        <circle cx="58" cy="41" r="1.2" fill={pupil} />
      </g>
    )
  }

  if (eyeStyle === 'star') {
    // 4-pointed star pupils
    const star = (cx: number, cy: number) => {
      const s = 3.2
      return `M${cx},${cy - s} L${cx + 1},${cy - 1} L${cx + s},${cy} L${cx + 1},${cy + 1} L${cx},${cy + s} L${cx - 1},${cy + 1} L${cx - s},${cy} L${cx - 1},${cy - 1}Z`
    }
    return (
      <g>
        <circle cx="42" cy="42" r="4" fill={white} />
        <path d={star(42, 42)} fill="#facc15" />
        <circle cx="58" cy="42" r="4" fill={white} />
        <path d={star(58, 42)} fill="#facc15" />
      </g>
    )
  }

  if (eyeStyle === 'heart') {
    // small heart pupils
    const heart = (cx: number, cy: number) => {
      const s = 2.5
      return `M${cx},${cy + s * 0.6} C${cx - s * 1.5},${cy - s * 0.5} ${cx - s * 1.5},${cy - s * 1.5} ${cx},${cy - s * 0.5} C${cx + s * 1.5},${cy - s * 1.5} ${cx + s * 1.5},${cy - s * 0.5} ${cx},${cy + s * 0.6}Z`
    }
    return (
      <g>
        <circle cx="42" cy="42" r="4" fill={white} />
        <path d={heart(42, 42)} fill="#f43f5e" />
        <circle cx="58" cy="42" r="4" fill={white} />
        <path d={heart(58, 42)} fill="#f43f5e" />
      </g>
    )
  }

  return null
}

// ── Mouth ─────────────────────────────────────────────────────────────────────

function renderMouth(config: AvatarConfig) {
  const { mouthStyle } = config
  const color = '#1a1a1a'

  if (mouthStyle === 'smile') {
    return (
      <path d="M 43 53 Q 50 59 57 53" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    )
  }

  if (mouthStyle === 'grin') {
    return (
      <g>
        <path d="M 41 52 Q 50 61 59 52" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M 43 53 Q 50 59 57 53" fill="white" stroke="none" />
      </g>
    )
  }

  if (mouthStyle === 'neutral') {
    return (
      <line x1="44" y1="55" x2="56" y2="55" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    )
  }

  if (mouthStyle === 'smirk') {
    return (
      <path d="M 44 56 Q 51 56 57 52" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    )
  }

  return null
}

// ── Accessory ─────────────────────────────────────────────────────────────────

function renderAccessory(config: AvatarConfig) {
  const { accessory } = config

  if (accessory === 'none') return null

  if (accessory === 'glasses') {
    return (
      <g stroke="#333" strokeWidth="1.4" fill="none">
        <circle cx="42" cy="42" r="5" />
        <circle cx="58" cy="42" r="5" />
        <line x1="47" y1="42" x2="53" y2="42" />
        <line x1="37" y1="42" x2="33" y2="43" />
        <line x1="63" y1="42" x2="67" y2="43" />
      </g>
    )
  }

  if (accessory === 'sunglasses') {
    return (
      <g stroke="#333" strokeWidth="1.4">
        <circle cx="42" cy="42" r="5" fill="#1a1a1a" fillOpacity="0.7" />
        <circle cx="58" cy="42" r="5" fill="#1a1a1a" fillOpacity="0.7" />
        <line x1="47" y1="42" x2="53" y2="42" fill="none" />
        <line x1="37" y1="42" x2="33" y2="43" fill="none" />
        <line x1="63" y1="42" x2="67" y2="43" fill="none" />
      </g>
    )
  }

  if (accessory === 'hat') {
    return (
      <g>
        <ellipse cx="50" cy="26" rx="26" ry="5" fill="#1a1a1a" />
        <rect x="30" y="10" width="40" height="18" rx="8" fill="#222" />
        <circle cx="50" cy="10" r="2.5" fill="#444" />
      </g>
    )
  }

  if (accessory === 'crown') {
    return (
      <g fill="#F5D033" stroke="#C9A800" strokeWidth="0.8">
        <rect x="31" y="23" width="38" height="6" rx="1" />
        <polygon points="33,23 36,12 39,23" />
        <polygon points="41,23 44,14 47,23" />
        <polygon points="49,23 52,11 55,23" />
        <polygon points="57,23 60,14 63,23" />
        <polygon points="65,23 68,12 71,23" />
        <circle cx="50" cy="18" r="2" fill="#EC4899" stroke="none" />
        <circle cx="37" cy="20" r="1.4" fill="#3B82F6" stroke="none" />
        <circle cx="63" cy="20" r="1.4" fill="#22C55E" stroke="none" />
      </g>
    )
  }

  if (accessory === 'headband') {
    return (
      <path d="M 28 36 Q 50 28 72 36" stroke="#EC4899" strokeWidth="5" fill="none" strokeLinecap="round" />
    )
  }

  if (accessory === 'monocle') {
    return (
      <g>
        <circle cx="58" cy="42" r="6" fill="none" stroke="#8B6914" strokeWidth="1.8" />
        <line x1="64" y1="46" x2="68" y2="52" stroke="#8B6914" strokeWidth="1.2" />
      </g>
    )
  }

  if (accessory === 'bunny_ears') {
    return (
      <g>
        {/* left ear */}
        <ellipse cx="37" cy="16" rx="5" ry="12" fill="white" stroke="#e0e0e0" strokeWidth="0.8" />
        <ellipse cx="37" cy="17" rx="2.5" ry="8" fill="#f9a8d4" />
        {/* right ear */}
        <ellipse cx="63" cy="16" rx="5" ry="12" fill="white" stroke="#e0e0e0" strokeWidth="0.8" />
        <ellipse cx="63" cy="17" rx="2.5" ry="8" fill="#f9a8d4" />
      </g>
    )
  }

  if (accessory === 'flower_crown') {
    return (
      <g>
        {/* green vine arc */}
        <path d="M 28 32 Q 50 22 72 32" stroke="#4ade80" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* flowers */}
        {[
          [33, 29, '#fb7185'],
          [42, 24, '#fbbf24'],
          [50, 22, '#f472b6'],
          [58, 24, '#a78bfa'],
          [67, 29, '#34d399'],
        ].map(([cx, cy, color], i) => (
          <g key={i}>
            <circle cx={cx as number} cy={cy as number} r="4" fill={color as string} />
            <circle cx={cx as number} cy={cy as number} r="1.5" fill="white" />
          </g>
        ))}
      </g>
    )
  }

  if (accessory === 'horns') {
    return (
      <g fill="#ef4444" stroke="#b91c1c" strokeWidth="0.8">
        {/* left horn */}
        <polygon points="34,30 28,12 42,26" />
        {/* right horn */}
        <polygon points="66,30 72,12 58,26" />
      </g>
    )
  }

  if (accessory === 'halo') {
    return (
      <ellipse cx="50" cy="14" rx="16" ry="5" fill="none" stroke="#fbbf24" strokeWidth="3.5" />
    )
  }

  if (accessory === 'wizard_hat') {
    return (
      <g>
        {/* brim */}
        <ellipse cx="50" cy="26" rx="24" ry="5" fill="#6d28d9" />
        {/* cone */}
        <polygon points="50,3 30,26 70,26" fill="#7c3aed" />
        {/* star on hat */}
        <path
          d="M50,8 L51.2,11.6 L55,11.6 L52,13.8 L53.1,17.4 L50,15.2 L46.9,17.4 L48,13.8 L45,11.6 L48.8,11.6Z"
          fill="#fbbf24"
        />
      </g>
    )
  }

  return null
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AvatarDisplay({ config, size = 80, className }: Props) {
  const uid = useId()
  const gradId = `bg-grad-${uid.replace(/:/g, '')}`
  const skinColor = SKIN_TONES[config.skinTone]
  const isSpecial = SPECIAL_BACKGROUNDS.includes(config.backgroundColor)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-label="Avatar"
    >
      {/* 1. Background */}
      {isSpecial
        ? renderBackground(config.backgroundColor, gradId)
        : <circle cx="50" cy="50" r="50" fill={config.backgroundColor} />
      }

      {/* 2. Shirt / body */}
      <ellipse cx="50" cy="92" rx="30" ry="16" fill={config.shirtColor} />
      <rect x="20" y="86" width="60" height="14" fill={config.shirtColor} />

      {/* 3. Hair (behind head) */}
      {renderHair(config)}

      {/* 4. Neck */}
      <rect x="43" y="58" width="14" height="12" rx="4" fill={skinColor} />

      {/* 5. Head */}
      <ellipse cx="50" cy="44" rx="22" ry="24" fill={skinColor} />

      {/* 6. Eyes */}
      {renderEyes(config)}

      {/* 7. Mouth */}
      {renderMouth(config)}

      {/* 8. Accessory */}
      {renderAccessory(config)}
    </svg>
  )
}
