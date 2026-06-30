// ══════════════════════════════════════════════════
//  Prastab Gamification — Badge Engine
//  All badge definitions + evaluation helpers
// ══════════════════════════════════════════════════

/** @typedef {{ id: string, tier: number, title: string, hindi: string, emoji: string,
 *   description: string, color: string, xpReward: number, criteria: (p: object) => boolean }} Badge */

/** @type {Badge[]} */
export const BADGES = [
  // ── TIER 1 — Onboarding ─────────────────────────
  {
    id: 'citizen_starter',
    tier: 1,
    title: 'Citizen Starter',
    hindi: 'लालटेन',
    emoji: '🏮',
    description: 'Welcome to Prastab! First report submitted.',
    color: '#43D9AD',
    xpReward: 50,
    criteria: (p) => (p.reportCount || 0) >= 1,
  },
  {
    id: 'first_verifier',
    tier: 1,
    title: 'Community Eye',
    hindi: 'नज़र',
    emoji: '👁️',
    description: 'Cast your first community vote on an issue.',
    color: '#64B5F6',
    xpReward: 30,
    criteria: (p) => (p.verifyCount || 0) >= 1,
  },

  // ── TIER 2 — Action Badges ───────────────────────
  {
    id: 'pothole_patroller',
    tier: 2,
    title: 'Pothole Patroller',
    hindi: 'सड़क रक्षक',
    emoji: '🛣️',
    description: 'Submitted 10 pothole reports validated by AI.',
    color: '#FFB347',
    xpReward: 200,
    criteria: (p) => (p.potholeCount || 0) >= 10,
  },
  {
    id: 'water_warrior',
    tier: 2,
    title: 'Water Warrior',
    hindi: 'जल रक्षक',
    emoji: '💧',
    description: '5 water/drainage issues reported.',
    color: '#64B5F6',
    xpReward: 150,
    criteria: (p) => (p.waterCount || 0) >= 5,
  },
  {
    id: 'ten_reporter',
    tier: 2,
    title: 'Active Reporter',
    hindi: 'सक्रिय रिपोर्टर',
    emoji: '📋',
    description: 'Submitted 10 total reports.',
    color: '#6C63FF',
    xpReward: 150,
    criteria: (p) => (p.reportCount || 0) >= 10,
  },
  {
    id: 'twenty_five_reporter',
    tier: 2,
    title: 'Civic Journalist',
    hindi: 'नागरिक पत्रकार',
    emoji: '📰',
    description: 'Submitted 25 reports.',
    color: '#8B85FF',
    xpReward: 300,
    criteria: (p) => (p.reportCount || 0) >= 25,
  },

  // ── TIER 3 — Impact ──────────────────────────────
  {
    id: 'fixers_friend',
    tier: 3,
    title: "Fixer's Friend",
    hindi: 'समस्या समाधानकर्ता',
    emoji: '🔧',
    description: '5 of your reports led to verified resolution.',
    color: '#FF8C42',
    xpReward: 500,
    criteria: (p) => (p.resolvedCount || 0) >= 5,
  },
  {
    id: 'certified_reporter',
    tier: 3,
    title: 'Certified Reporter',
    hindi: 'प्रमाणित रिपोर्टर',
    emoji: '🎖️',
    description: 'AI trust score above 0.8 — reports auto-prioritized.',
    color: '#FFB347',
    xpReward: 400,
    criteria: (p) => (p.trustScore || 0) >= 0.8,
  },
  {
    id: 'community_pillar',
    tier: 3,
    title: 'Community Pillar',
    hindi: 'समुदाय स्तंभ',
    emoji: '🏛️',
    description: '50 community votes cast.',
    color: '#6C63FF',
    xpReward: 350,
    criteria: (p) => (p.verifyCount || 0) >= 50,
  },

  // ── TIER 4 — Hero Status ─────────────────────────
  {
    id: 'neighborhood_guardian',
    tier: 4,
    title: 'Neighborhood Guardian',
    hindi: 'मोहल्ला रक्षक',
    emoji: '🦸',
    description: '50 reports + 100 votes in 6 months. True civic hero.',
    color: '#FF4D6D',
    xpReward: 1000,
    criteria: (p) => (p.reportCount || 0) >= 50 && (p.verifyCount || 0) >= 100,
  },
  {
    id: 'civic_hero',
    tier: 4,
    title: 'Civic Hero',
    hindi: 'नागरिक नायक',
    emoji: '⭐',
    description: '5000+ XP and a legend in your community.',
    color: '#FFD700',
    xpReward: 0,
    criteria: (p) => (p.points || 0) >= 5000,
  },
]

/**
 * Evaluates which new badges a profile has earned.
 * @param {object} profile - User profile from Firestore
 * @returns {string[]} Array of newly unlocked badge IDs
 */
export function evaluateBadges(profile) {
  const alreadyHas = new Set(profile?.badges || [])
  return BADGES.filter((b) => !alreadyHas.has(b.id) && b.criteria(profile)).map((b) => b.id)
}

/**
 * Get a single badge definition by ID.
 * @param {string} id
 * @returns {Badge | undefined}
 */
export function getBadge(id) {
  return BADGES.find((b) => b.id === id)
}

/**
 * Get full badge objects for all badge IDs in a profile.
 * @param {object} profile
 * @returns {Badge[]}
 */
export function getBadgesForProfile(profile) {
  return (profile?.badges || [])
    .map((id) => BADGES.find((b) => b.id === id))
    .filter(Boolean)
}

/**
 * Human-readable tier names.
 * @param {number} tier
 * @returns {string}
 */
export function getTierName(tier) {
  return ['', 'Starter', 'Active', 'Impact', 'Hero'][tier] || ''
}

/**
 * Tier metadata for UI styling — color, label, frame style.
 * @param {number} tier
 */
export function getTierMeta(tier) {
  const map = {
    1: { label: 'Starter',  color: '#43D9AD', frameClass: 'bronze'   },
    2: { label: 'Active',   color: '#64B5F6', frameClass: 'silver'   },
    3: { label: 'Impact',   color: '#FFB347', frameClass: 'gold'     },
    4: { label: 'Hero',     color: '#FF4D6D', frameClass: 'platinum' },
  }
  return map[tier] || map[1]
}
