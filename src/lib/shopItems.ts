import type { AvatarConfig } from './types'

export type ShopCategory = 'hair' | 'accessory' | 'eyes' | 'background'

export type ShopItem = {
  id: string
  category: ShopCategory
  label: string
  emoji: string
  cost: number
  apply: (config: AvatarConfig) => AvatarConfig
}

export const SHOP_ITEMS: ShopItem[] = [
  // ── Hair ──────────────────────────────────────────────────────────────────
  {
    id: 'hair_bun',
    category: 'hair',
    label: 'Bun',
    emoji: '🩹',
    cost: 100,
    apply: (c) => ({ ...c, hairStyle: 'bun' }),
  },
  {
    id: 'hair_topknot',
    category: 'hair',
    label: 'Topknot',
    emoji: '🎋',
    cost: 150,
    apply: (c) => ({ ...c, hairStyle: 'topknot' }),
  },
  {
    id: 'hair_afro',
    category: 'hair',
    label: 'Afro',
    emoji: '⭕',
    cost: 250,
    apply: (c) => ({ ...c, hairStyle: 'afro' }),
  },
  {
    id: 'hair_braids',
    category: 'hair',
    label: 'Braids',
    emoji: '〰️',
    cost: 350,
    apply: (c) => ({ ...c, hairStyle: 'braids' }),
  },

  // ── Accessories ───────────────────────────────────────────────────────────
  {
    id: 'accessory_monocle',
    category: 'accessory',
    label: 'Monocle',
    emoji: '🧐',
    cost: 150,
    apply: (c) => ({ ...c, accessory: 'monocle' }),
  },
  {
    id: 'accessory_bunny_ears',
    category: 'accessory',
    label: 'Bunny Ears',
    emoji: '🐰',
    cost: 200,
    apply: (c) => ({ ...c, accessory: 'bunny_ears' }),
  },
  {
    id: 'accessory_flower_crown',
    category: 'accessory',
    label: 'Flower Crown',
    emoji: '🌸',
    cost: 200,
    apply: (c) => ({ ...c, accessory: 'flower_crown' }),
  },
  {
    id: 'accessory_wizard_hat',
    category: 'accessory',
    label: 'Wizard Hat',
    emoji: '🧙',
    cost: 400,
    apply: (c) => ({ ...c, accessory: 'wizard_hat' }),
  },
  {
    id: 'accessory_horns',
    category: 'accessory',
    label: 'Devil Horns',
    emoji: '😈',
    cost: 350,
    apply: (c) => ({ ...c, accessory: 'horns' }),
  },
  {
    id: 'accessory_halo',
    category: 'accessory',
    label: 'Halo',
    emoji: '😇',
    cost: 500,
    apply: (c) => ({ ...c, accessory: 'halo' }),
  },

  // ── Eyes ──────────────────────────────────────────────────────────────────
  {
    id: 'eyes_star',
    category: 'eyes',
    label: 'Star Eyes',
    emoji: '🌟',
    cost: 200,
    apply: (c) => ({ ...c, eyeStyle: 'star' }),
  },
  {
    id: 'eyes_heart',
    category: 'eyes',
    label: 'Heart Eyes',
    emoji: '😍',
    cost: 200,
    apply: (c) => ({ ...c, eyeStyle: 'heart' }),
  },

  // ── Backgrounds ───────────────────────────────────────────────────────────
  {
    id: 'bg_fire',
    category: 'background',
    label: 'Fire',
    emoji: '🔥',
    cost: 400,
    apply: (c) => ({ ...c, backgroundColor: 'fire' }),
  },
  {
    id: 'bg_ice',
    category: 'background',
    label: 'Ice',
    emoji: '❄️',
    cost: 400,
    apply: (c) => ({ ...c, backgroundColor: 'ice' }),
  },
  {
    id: 'bg_galaxy',
    category: 'background',
    label: 'Galaxy',
    emoji: '🌌',
    cost: 600,
    apply: (c) => ({ ...c, backgroundColor: 'galaxy' }),
  },
  {
    id: 'bg_rainbow',
    category: 'background',
    label: 'Rainbow',
    emoji: '🌈',
    cost: 700,
    apply: (c) => ({ ...c, backgroundColor: 'rainbow' }),
  },
]

export const SHOP_ITEM_MAP = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i]))
