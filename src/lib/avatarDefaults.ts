import type { AvatarConfig } from './types'

export const SKIN_TONES = {
  'light': '#FDDBB4',
  'medium-light': '#E8B88A',
  'medium': '#C68642',
  'medium-dark': '#8D5524',
  'dark': '#4A2C17',
}

export const HAIR_COLORS = [
  '#1C1C1C', // Black
  '#4A3728', // Dark Brown
  '#6B3A2A', // Brown
  '#A0522D', // Light Brown
  '#C4A35A', // Dirty Blonde
  '#F5D033', // Blonde
  '#E8735A', // Auburn/Red
  '#C0C0C0', // Gray
  '#FFFFFF', // White
  '#FF4B6E', // Pink
  '#7B2FBE', // Purple
  '#2196F3', // Blue
]

export const BACKGROUND_COLORS = [
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#EF4444', // Red
  '#F97316', // Orange
  '#EAB308', // Yellow
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#3B82F6', // Blue
  '#06B6D4', // Cyan
  '#64748B', // Slate
  '#78716C', // Stone
]

export const SHIRT_COLORS = [
  '#1E293B', // Dark
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#22C55E', // Green
  '#F97316', // Orange
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#FFFFFF', // White
  '#6B7280', // Gray
  '#92400E', // Brown
]

export const PANTS_COLORS = [
  '#1E293B', // Dark Navy
  '#111827', // Almost Black
  '#374151', // Charcoal
  '#6B7280', // Gray
  '#F9FAFB', // Off-white
  '#1D4ED8', // Denim Blue
  '#065F46', // Dark Green
  '#7F1D1D', // Maroon
  '#78350F', // Brown
  '#A3A07A', // Khaki
]

export const SHOES_COLORS = [
  '#111827', // Black
  '#F9FAFB', // White
  '#6B3A2A', // Brown
  '#C4956A', // Tan
  '#DC2626', // Red
  '#1D4ED8', // Blue
  '#15803D', // Green
  '#D97706', // Tan/Gold
  '#9CA3AF', // Light Gray
  '#374151', // Dark Gray
]

export const BODY_COLORS = [
  '#FF4757', // Red
  '#FF6B35', // Orange
  '#FFA502', // Yellow
  '#2ED573', // Mint
  '#1E90FF', // Blue
  '#5352ED', // Indigo
  '#FF6B9D', // Pink
  '#A29BFE', // Lavender
  '#00D2D3', // Cyan
  '#FFEAA7', // Pale Yellow
  '#55EFC4', // Turquoise
  '#FD79A8', // Hot Pink
  '#74B9FF', // Light Blue
  '#81ECEC', // Light Cyan
  '#B2BEC3', // Silver
  '#636E72', // Slate
]

export const DEFAULT_AVATAR: AvatarConfig = {
  backgroundColor: '#6366F1',
  skinTone: 'medium',
  hairStyle: 'short',
  hairColor: '#1C1C1C',
  eyeStyle: 'normal',
  mouthStyle: 'smile',
  accessory: 'none',
  shirtColor: '#3B82F6',
  pantsColor: '#1E293B',
  shoesColor: '#111827',
  bodyColor: '#1E90FF',
  bodyHeight: 0.5,
  bodyWidth: 0.5,
  armLength: 0.5,
  legLength: 0.5,
}
