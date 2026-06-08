'use client'

import { SKIN_TONES } from '@/lib/avatarDefaults'
import type { AvatarConfig } from '@/lib/types'

interface Props {
  config: AvatarConfig
  size?: number
  className?: string
}

// ── Hair ─────────────────────────────────────────────────────────────────────

function renderHair(config: AvatarConfig) {
  const { hairStyle, hairColor } = config
  const fill = hairColor

  if (hairStyle === 'bald') return null

  if (hairStyle === 'short') {
    return (
      <g>
        {/* cap sitting on top of head */}
        <ellipse cx="50" cy="30" rx="22" ry="13" fill={fill} />
        {/* fill in between cap bottom and head top so no gap */}
        <rect x="28" y="30" width="44" height="10" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'medium') {
    return (
      <g>
        {/* top */}
        <ellipse cx="50" cy="28" rx="23" ry="14" fill={fill} />
        <rect x="27" y="28" width="46" height="12" fill={fill} />
        {/* side pieces down to ear level */}
        <rect x="27" y="38" width="8" height="18" rx="3" fill={fill} />
        <rect x="65" y="38" width="8" height="18" rx="3" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'long') {
    return (
      <g>
        {/* top */}
        <ellipse cx="50" cy="28" rx="23" ry="14" fill={fill} />
        <rect x="27" y="28" width="46" height="12" fill={fill} />
        {/* long side pieces */}
        <rect x="27" y="38" width="8" height="31" rx="4" fill={fill} />
        <rect x="65" y="38" width="8" height="31" rx="4" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'curly') {
    // bumpy top edge using a path with small arcs
    return (
      <g>
        <path
          d="
            M 28 36
            Q 28 20 50 20
            Q 72 20 72 36
            Q 66 26 62 32
            Q 58 22 54 32
            Q 50 22 46 32
            Q 42 22 38 32
            Q 34 26 28 36
            Z
          "
          fill={fill}
        />
        {/* fill the lower part behind the head */}
        <rect x="28" y="32" width="44" height="10" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'wavy') {
    return (
      <g>
        {/* wavy top band */}
        <path
          d="
            M 28 36
            C 28 18 72 18 72 36
            C 68 29 62 33 58 29
            C 54 25 46 25 42 29
            C 38 33 32 29 28 36
            Z
          "
          fill={fill}
        />
        <rect x="27" y="32" width="46" height="10" fill={fill} />
        {/* medium-length side pieces */}
        <rect x="27" y="40" width="8" height="20" rx="4" fill={fill} />
        <rect x="65" y="40" width="8" height="20" rx="4" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'mohawk') {
    return (
      <g>
        {/* narrow tall strip centered on top */}
        <rect x="46" y="12" width="8" height="22" rx="4" fill={fill} />
        {/* widen at the base to meet the head */}
        <ellipse cx="50" cy="34" rx="6" ry="4" fill={fill} />
      </g>
    )
  }

  if (hairStyle === 'ponytail') {
    return (
      <g>
        {/* top hair */}
        <ellipse cx="50" cy="29" rx="22" ry="12" fill={fill} />
        <rect x="28" y="29" width="44" height="10" fill={fill} />
        {/* ponytail bun — behind head to the right side */}
        <ellipse cx="71" cy="36" rx="7" ry="5" fill={fill} />
        {/* connector from head to bun */}
        <rect x="65" y="33" width="8" height="6" rx="3" fill={fill} />
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
        {/* left eye */}
        <circle cx="42" cy="42" r="3" fill={white} />
        <circle cx="42" cy="42" r="1.4" fill={pupil} />
        {/* right eye */}
        <circle cx="58" cy="42" r="3" fill={white} />
        <circle cx="58" cy="42" r="1.4" fill={pupil} />
      </g>
    )
  }

  if (eyeStyle === 'happy') {
    // happy squinted arcs — ^^ shape
    return (
      <g>
        <path d="M 39 44 Q 42 39 45 44" stroke={pupil} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M 55 44 Q 58 39 61 44" stroke={pupil} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </g>
    )
  }

  if (eyeStyle === 'cool') {
    // slightly squinted ovals
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
    // half-closed: full white circle clipped to top half only
    return (
      <g>
        {/* left eye */}
        <circle cx="42" cy="42" r="3" fill={white} />
        {/* droopy lid covering bottom half */}
        <path d="M 39 42 Q 42 46 45 42" fill={skinColor} />
        <circle cx="42" cy="41" r="1.2" fill={pupil} />
        {/* right eye */}
        <circle cx="58" cy="42" r="3" fill={white} />
        <path d="M 55 42 Q 58 46 61 42" fill={skinColor} />
        <circle cx="58" cy="41" r="1.2" fill={pupil} />
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
      <path
        d="M 43 53 Q 50 59 57 53"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    )
  }

  if (mouthStyle === 'grin') {
    return (
      <g>
        <path
          d="M 41 52 Q 50 61 59 52"
          stroke={color}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
        {/* teeth */}
        <path
          d="M 43 53 Q 50 59 57 53"
          fill="white"
          stroke="none"
        />
      </g>
    )
  }

  if (mouthStyle === 'neutral') {
    return (
      <line
        x1="44" y1="55" x2="56" y2="55"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    )
  }

  if (mouthStyle === 'smirk') {
    // curve up only on the right side
    return (
      <path
        d="M 44 56 Q 51 56 57 52"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
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
        {/* left lens */}
        <circle cx="42" cy="42" r="5" />
        {/* right lens */}
        <circle cx="58" cy="42" r="5" />
        {/* bridge */}
        <line x1="47" y1="42" x2="53" y2="42" />
        {/* temples */}
        <line x1="37" y1="42" x2="33" y2="43" />
        <line x1="63" y1="42" x2="67" y2="43" />
      </g>
    )
  }

  if (accessory === 'sunglasses') {
    return (
      <g stroke="#333" strokeWidth="1.4">
        {/* left lens */}
        <circle cx="42" cy="42" r="5" fill="#1a1a1a" fillOpacity="0.7" />
        {/* right lens */}
        <circle cx="58" cy="42" r="5" fill="#1a1a1a" fillOpacity="0.7" />
        {/* bridge */}
        <line x1="47" y1="42" x2="53" y2="42" fill="none" />
        {/* temples */}
        <line x1="37" y1="42" x2="33" y2="43" fill="none" />
        <line x1="63" y1="42" x2="67" y2="43" fill="none" />
      </g>
    )
  }

  if (accessory === 'hat') {
    return (
      <g>
        {/* brim */}
        <ellipse cx="50" cy="26" rx="26" ry="5" fill="#1a1a1a" />
        {/* cap body */}
        <rect x="30" y="10" width="40" height="18" rx="8" fill="#222" />
        {/* button on top */}
        <circle cx="50" cy="10" r="2.5" fill="#444" />
      </g>
    )
  }

  if (accessory === 'crown') {
    return (
      <g fill="#F5D033" stroke="#C9A800" strokeWidth="0.8">
        {/* crown base band */}
        <rect x="31" y="23" width="38" height="6" rx="1" />
        {/* 5 points */}
        <polygon points="33,23 36,12 39,23" />
        <polygon points="41,23 44,14 47,23" />
        <polygon points="49,23 52,11 55,23" />
        <polygon points="57,23 60,14 63,23" />
        <polygon points="65,23 68,12 71,23" />
        {/* gem dots */}
        <circle cx="50" cy="18" r="2" fill="#EC4899" stroke="none" />
        <circle cx="37" cy="20" r="1.4" fill="#3B82F6" stroke="none" />
        <circle cx="63" cy="20" r="1.4" fill="#22C55E" stroke="none" />
      </g>
    )
  }

  if (accessory === 'headband') {
    return (
      <path
        d="M 28 36 Q 50 28 72 36"
        stroke="#EC4899"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    )
  }

  return null
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AvatarDisplay({ config, size = 80, className }: Props) {
  const skinColor = SKIN_TONES[config.skinTone]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-label="Avatar"
    >
      {/* 1. Background circle */}
      <circle cx="50" cy="50" r="50" fill={config.backgroundColor} />

      {/* 2. Shirt / body — visible at bottom of circle */}
      <ellipse cx="50" cy="92" rx="30" ry="16" fill={config.shirtColor} />
      <rect x="20" y="86" width="60" height="14" fill={config.shirtColor} />

      {/* 3a. Hair (drawn behind head for styles that go under) */}
      {renderHair(config)}

      {/* 3b. Neck */}
      <rect x="43" y="58" width="14" height="12" rx="4" fill={skinColor} />

      {/* 3c. Head */}
      <ellipse cx="50" cy="44" rx="22" ry="24" fill={skinColor} />

      {/* Hair on top (re-render on top of head for top-of-head styles) —
          handled by renderHair drawing everything; hair is drawn twice for
          styles where we need it behind the head, but since SVG paints
          in order the second pass (below) would be on top. Instead we
          handle ordering in a single pass above and accept slight overlap. */}

      {/* 4. Eyes */}
      {renderEyes(config)}

      {/* 5. Mouth */}
      {renderMouth(config)}

      {/* 6. Accessory */}
      {renderAccessory(config)}
    </svg>
  )
}
