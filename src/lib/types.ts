export type AvatarConfig = {
  backgroundColor: string
  skinTone: 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark'
  hairStyle: 'bald' | 'short' | 'medium' | 'long' | 'curly' | 'wavy' | 'mohawk' | 'ponytail' | 'bun' | 'topknot' | 'afro' | 'braids'
  hairColor: string
  eyeStyle: 'normal' | 'happy' | 'cool' | 'sleepy' | 'star' | 'heart'
  mouthStyle: 'smile' | 'grin' | 'neutral' | 'smirk'
  accessory: 'none' | 'glasses' | 'sunglasses' | 'hat' | 'crown' | 'headband' | 'monocle' | 'bunny_ears' | 'horns' | 'halo' | 'wizard_hat' | 'flower_crown'
  shirtColor: string
  pantsColor: string
  shoesColor: string
  bodyColor?:  string
  bodyHeight?: number
  bodyWidth?:  number
  armLength?:  number
  legLength?:  number
}

export type User = {
  uid: string
  email: string
  displayName: string
  avatar: AvatarConfig
  createdAt: Date
  groups: string[]
  coins?: number
  unlockedItems?: string[]
}

export type PlazaPreset = {
  id: string
  emoji: string
  label: string
  points: number   // positive = give, negative = take
}

export type Group = {
  id: string
  name: string
  description: string
  createdBy: string
  inviteCode: string
  createdAt: Date
  memberCount: number
  emoji?: string
  dailyGiveLimit?: number   // default 100
  dailyTakeLimit?: number   // default 20
  timezone?: string
  presets?: PlazaPreset[]
}

export type GroupMember = {
  uid: string
  displayName: string
  avatar: AvatarConfig
  totalPoints: number
  dailyPointsGiven: number
  dailyPointsTaken: number
  lastResetDate: string
  joinedAt: Date
  isAdmin?: boolean
  currentStreak?: number
  longestStreak?: number
  lastActiveDate?: string
  badges?: string[]
}

export type Transaction = {
  id: string
  fromUid: string
  fromName: string
  toUid: string
  toName: string
  points: number
  reason: string
  caption?: string
  reactions?: Record<string, string[]>
  createdAt: Date
}

export type PointsAllocation = {
  toUid: string
  points: number
  reason: string
  caption?: string
}

export type NotificationType =
  | 'points_received'
  | 'points_taken'
  | 'appeal_filed'
  | 'appeal_accepted'
  | 'appeal_denied'
  | 'court_opened'
  | 'court_resolved'
  | 'wall_comment'
  | 'member_joined'
  | 'feed_reaction'

export type GroupNotification = {
  id: string
  forUid: string
  type: NotificationType
  transactionId: string
  caseId?: string
  fromUid: string
  fromName: string
  toName: string
  points: number
  reason?: string
  appealComment?: string
  userComment?: string
  outcome?: 'innocent' | 'guilty'
  read: boolean
  cleared: boolean
  createdAt: Date
}

export type WallPost = {
  id: string
  uid: string
  displayName: string
  avatarConfig?: AvatarConfig
  text: string
  reactions?: Record<string, string[]>
  commentCount?: number
  createdAt: Date
}

export type WallComment = {
  id: string
  uid: string
  displayName: string
  avatarConfig?: AvatarConfig
  text: string
  createdAt: Date
}

export type CaseStatus =
  | 'pending_review'
  | 'accepted'
  | 'denied'
  | 'in_court'
  | 'resolved_innocent'
  | 'resolved_guilty'
  | 'dismissed'

export type CourtCase = {
  id: string
  transactionId: string
  defendantUid: string
  defendantName: string
  accuserUid: string
  accuserName: string
  points: number
  reason?: string
  appealComment: string
  status: CaseStatus
  createdAt: Date
  courtDeadline?: Date
  votes: Record<string, 'innocent' | 'guilty'>
  chiefVoterUid?: string
  resolvedAt?: Date
}
