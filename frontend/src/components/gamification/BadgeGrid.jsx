import BadgeCard from './BadgeCard'
import { BADGES } from '../../utils/badgeEngine'
import './BadgeGrid.css'

const TIER_META = {
  1: { label: 'Starter',  emoji: '🌱', color: '#43D9AD' },
  2: { label: 'Active',   emoji: '⚡', color: '#64B5F6' },
  3: { label: 'Impact',   emoji: '🔥', color: '#FFB347' },
  4: { label: 'Hero',     emoji: '🦸', color: '#FF4D6D' },
}

/**
 * BadgeGrid — renders all badges grouped by tier, earned vs locked.
 * @param {{ profile: object }} props
 */
export default function BadgeGrid({ profile }) {
  const earned = new Set(profile?.badges || [])

  const byTier = [1, 2, 3, 4].map((t) => ({
    tier: t,
    meta: TIER_META[t],
    badges: BADGES.filter((b) => b.tier === t),
  }))

  const totalEarned = (profile?.badges || []).length
  const totalBadges = BADGES.length

  return (
    <div className="badge-grid">
      {byTier.map(({ tier, meta, badges }) => {
        const tierEarned = badges.filter((b) => earned.has(b.id)).length
        const allEarned = tierEarned === badges.length

        return (
          <div key={tier} className="badge-tier-section">
            {/* Tier header */}
            <div className="badge-tier-header">
              <div className="badge-tier-title">
                <span
                  className={`badge-tier-label badge-tier-label--${tier}`}
                  style={{ '--tier-color': meta.color }}
                >
                  {meta.emoji} Tier {tier} · {meta.label}
                </span>
                {allEarned && (
                  <span className="badge-tier-complete" title="Tier complete!">✨ Complete</span>
                )}
              </div>
              <div className="badge-tier-progress-wrap">
                <span className="badge-tier-count">
                  {tierEarned}/{badges.length}
                </span>
                <div className="badge-tier-mini-bar">
                  <div
                    className="badge-tier-mini-fill"
                    style={{
                      width: `${(tierEarned / badges.length) * 100}%`,
                      background: meta.color,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Badge cards */}
            <div className="badge-tier-cards">
              {badges.map((b) => (
                <BadgeCard key={b.id} badge={b} earned={earned.has(b.id)} size="sm" />
              ))}
            </div>
          </div>
        )
      })}

      {/* Summary footer */}
      <div className="badge-grid-summary">
        <span className="badge-grid-summary__text">
          {totalEarned === 0
            ? 'Start reporting to earn your first badge! 🚀'
            : totalEarned === totalBadges
            ? '🏆 All badges collected! You are a true Civic Hero!'
            : `${totalEarned} of ${totalBadges} badges earned — keep going!`}
        </span>
        <div className="badge-grid-overall-bar">
          <div
            className="badge-grid-overall-fill"
            style={{ width: `${(totalEarned / totalBadges) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
