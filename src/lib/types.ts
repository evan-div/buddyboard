/**
 * @file Type definitions for BuddyBoard
 * @mobile-shareable ✅ - Copy as-is to React Native projects
 * @description Complete type system for users, groups, transactions, court cases, notifications, etc.
 * No external dependencies. Safe to use in both web and mobile applications.
 */

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
  bodyColor?:   string
  bodyShape?:   'bean' | 'peanut' | 'gourd' | 'strawberry'
  bodyHeight?:  number
  bodyWidth?:   number
  armLength?:   number
  legLength?:   number
  eyeSize?:     number
  eyeSpacing?:  number
}

// Per-user UI personalization (Style tab). Applied as CSS variables.
export type AccentId = 'violet' | 'coral' | 'teal' | 'lime' | 'amber' | 'pink'

export type StylePrefs = {
  accent?: AccentId          // default 'violet'
  textSize?: 'small' | 'medium' | 'large'   // default 'medium'
  compact?: boolean          // tighter card padding/spacing
}

// Push-notification categories a user can independently mute
export type NotifCategory = 'points' | 'court' | 'social'

export type NotifPrefs = {
  muteAll?: boolean
  points?: boolean   // points received / taken (default on)
  court?: boolean    // court cases + verdicts (default on)
  social?: boolean   // thanks, wall comments, reactions (default on)
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
  notifPrefs?: NotifPrefs
  stylePrefs?: StylePrefs
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
  rules?: string            // freeform group rules, editable by the mayor
  // ── Living plaza ──
  // Group "vitality": a counter bumped once on the first check-in of each
  // active day. Plants' growth is gated by how much this has risen since they
  // were planted, so a quiet group's garden stalls (but never dies).
  plazaActiveDays?: number
  plazaLastActiveDay?: string   // dayKey of the most recent active day
  // Cumulative points the group has GIVEN each other (takes excluded). Drives
  // island unlocks — collective effort creates space, daily check-ins grow life.
  plazaPointsGiven?: number
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
  lastSeen?: Date   // presence heartbeat while the plaza is open
  // ── Living plaza ──
  seeds?: number                  // legacy: undifferentiated seeds, now read as commons
  seedsByRarity?: Partial<Record<SeedRarity, number>>   // seeds earned from commitments
  lastCheckinDate?: string        // dayKey of this member's last daily check-in
  checkinStreak?: number          // consecutive days checked in
  longestCheckinStreak?: number
}

// ── Living plaza ─────────────────────────────────────────────────────────────
// A member's daily "I showed up" check-in. One per member per day (the doc id is
// `${uid}_${dayKey}`, so it is naturally idempotent). Check-ins are the heartbeat
// that earns seeds and keeps the group's plants growing.
export type Checkin = {
  uid: string
  dayKey: string
  note?: string
  createdAt: Date
}

// A tile on the plaza's placement grid (see plazaMath.tileToWorld).
export type PlazaTile = { q: number; r: number }

// Persistent objects placed on the shared island. Today only 'plant'; 'kind' is
// carried so landmarks/buildings can join the same collection later.
export type PlazaObjectKind = 'plant'

export type PlazaObject = {
  id: string
  kind: PlazaObjectKind
  species: string
  tile: PlazaTile
  plantedBy: string
  plantedByName: string
  plantedAt: Date
  plantedAtVitality: number   // group vitality snapshot at planting time
  dedication?: string
  // ── Commitments ──
  rarity?: SeedRarity     // absent reads as 'common' (every pre-commitment plant)
  earnedFrom?: string     // id of the commitment whose seed grew this
}

// ── Commitments ──────────────────────────────────────────────────────────────
// A pact between group members: a goal, a window, and a payout. Seeds earned by
// checking in are always common; a rarer seed only ever comes from holding up
// your end of a longer commitment, which is what makes a rare plant legible as
// an achievement rather than decoration.

export type SeedRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

// 'forming' — open for sign-up, clock not running, creator can still Start it.
// 'active'  — roster locked, clock running, marks count.
// 'resolved'— deadline passed, per-person outcomes written, seeds paid out.
export type CommitmentStatus = 'forming' | 'active' | 'resolved' | 'cancelled'

// How often the goal repeats. The creator also picks how many marks a period
// needs (targetPerPeriod) and what share of periods must hit that (thresholdPct).
export type CommitmentCadence = 'daily' | 'weekly'

export type CommitmentParticipant = {
  uid: string
  displayName: string
  joinedAt: Date
  markedDays: string[]          // dayKeys tapped; arrayUnion keeps this idempotent
  outcome?: 'kept' | 'missed'   // written at resolution
  seedAwarded?: SeedRarity
  caseId?: string               // set if a co-participant disputed this outcome
}

export type Commitment = {
  id: string
  title: string                 // free text goal, like Transaction.reason
  createdBy: string
  createdByName: string
  status: CommitmentStatus
  durationDays: number          // one of COMMITMENT_TIERS; drives the payout
  rarity: SeedRarity            // derived from durationDays, stored so the cron can read it
  cadence: CommitmentCadence
  targetPerPeriod: number       // marks needed for a period to count (e.g. 3 a week)
  thresholdPct: number          // share of periods that must count, 50-100
  createdAt: Date
  startedAt?: Date
  deadline?: Date
  resolvedAt?: Date
  // Keyed by uid rather than an array so one member's mark is a single field-path
  // write and can never clobber another's — same reason CourtCase.votes is a map.
  participants: Record<string, CommitmentParticipant>
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
  | 'thanks_received'
  | 'commitment_started'
  | 'commitment_resolved'
  | 'commitment_disputed'

export type GroupNotification = {
  id: string
  forUid: string
  type: NotificationType
  transactionId: string
  caseId?: string
  commitmentId?: string
  rarity?: SeedRarity   // which seed a commitment_resolved notification paid out
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
  thanked?: boolean   // recipient tapped "Say thanks" on a points_received notif
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

// Ephemeral plaza physics events broadcast to other members' clients
export type PlazaVec = { x: number; y: number; z: number }

export type PlazaEvent = {
  id: string
  type: 'pickup' | 'drop' | 'throw'
  uid: string        // the character being manhandled
  by: string         // the member doing it
  pos: PlazaVec
  vel?: PlazaVec
  angVel?: PlazaVec
  at: Date
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
  // What is on trial. Absent means 'transaction' — every case written before
  // commitments existed. A commitment case carries points: 0 and skips the
  // points-restoration path entirely; what it restores or revokes is a seed.
  subject?: 'transaction' | 'commitment'
  commitmentId?: string
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
  resolvedAt?: Date
}
