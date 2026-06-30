import './BadgeCard.css'

/**
 * BadgeCard — displays a single gamification badge.
 * @param {{ badge: object, earned?: boolean, size?: 'sm'|'md'|'lg' }} props
 */
export default function BadgeCard({ badge, earned = true, size = 'md' }) {
  if (!badge) return null

  const tierFrames = { 1: 'bronze', 2: 'silver', 3: 'gold', 4: 'platinum' }
  const frameClass = tierFrames[badge.tier] || 'bronze'

  return (
    <div
      className={[
        'badge-card',
        `badge-card--${size}`,
        `badge-card--frame-${frameClass}`,
        earned ? 'badge-card--earned' : 'badge-card--locked',
      ].join(' ')}
      title={`${badge.title} — ${badge.description}`}
      style={{ '--badge-color': badge.color }}
    >
      {/* Animated background glow */}
      <div className="badge-card__glow" />

      {/* Emoji icon */}
      <div
        className="badge-card__emoji"
        style={{ filter: earned ? 'none' : 'grayscale(1) opacity(0.35)' }}
        aria-label={badge.title}
      >
        {badge.emoji}
      </div>

      {/* Text body */}
      <div className="badge-card__body">
        <p className="badge-card__name">{badge.title}</p>
        <p className="badge-card__hindi">{badge.hindi}</p>

        {size !== 'sm' && (
          <p className="badge-card__desc">{badge.description}</p>
        )}

        {size !== 'sm' && (
          <div className="badge-card__footer">
            <span className="badge-card__tier">T{badge.tier} · {['', 'Starter', 'Active', 'Impact', 'Hero'][badge.tier]}</span>
            {earned ? (
              <span className="badge-card__xp">+{badge.xpReward} XP</span>
            ) : (
              <span className="badge-card__locked-label">🔒 Locked</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
