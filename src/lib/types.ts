export type AvatarConfig = {
  backgroundColor: string  // hex color for background circle
  skinTone: 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark'
  hairStyle: 'bald' | 'short' | 'medium' | 'long' | 'curly' | 'wavy' | 'mohawk' | 'ponytail'
  hairColor: string  // hex color
  eyeStyle: 'normal' | 'happy' | 'cool' | 'sleepy'
  mouthStyle: 'smile' | 'grin' | 'neutral' | 'smirk'
  accessory: 'none' | 'glasses' | 'sunglasses' | 'hat' | 'crown' | 'headband'
  shirtColor: string  // hex color
  pantsColor: string  // hex color
  shoesColor: string  // hex color
}

export type User = {
  uid: string
  email: string
  displayName: string
  avatar: AvatarConfig
  createdAt: Date
  groups: string[]  // groupIds
}

export type Group = {
  id: string
  name: string
  description: string
  createdBy: string  // uid
  inviteCode: string  // 6-char uppercase code
  createdAt: Date
  memberCount: number
}

export type GroupMember = {
  uid: string
  displayName: string
  avatar: AvatarConfig
  totalPoints: number
  dailyPointsGiven: number   // resets daily, max 100
  dailyPointsTaken: number   // resets daily, max 20
  lastResetDate: string      // YYYY-MM-DD
  joinedAt: Date
}

export type Transaction = {
  id: string
  fromUid: string
  fromName: string
  toUid: string
  toName: string
  points: number   // positive = give, negative = take
  reason: string
  createdAt: Date
}

export type PointsAllocation = {
  toUid: string
  points: number   // positive = give, negative = take
  reason: string
}
