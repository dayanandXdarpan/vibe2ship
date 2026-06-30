import './XpBar.css'

const XP_MILESTONES = [0, 50, 150, 400, 1000, 2500, 5000]
const MILESTONE_LABELS = ['Newcomer', 'Helper', 'Advocate', 'Crusader', 'Champion', 'Hero', 'Legend']
const MILESTONE_COLORS = ['#8B949E', '#43D9AD', '#64B5F6', '#6C63FF', '#FFB347', '#FF8C42', '#FFD700']

/**
 * XpBar — animated XP progress bar with milestone markers.
 * @param {{ currentXp?: number }} props
 */
export default function XpBar({ currentXp = 0 }) {
  const maxXp = 5000
  const pct = Math.min((currentXp / maxXp) * 100, 100)

  // Determine current rank index (0-based)
  const rankIdx = [...XP_MILESTONES]
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => currentXp >= m)
    .slice(-1)[0]?.i ?? 0

  const currentLabel = MILESTONE_LABELS[rankIdx]
  const currentColor = MILESTONE_COLORS[rankIdx]

  // Next milestone
  const nextMilestone = XP_MILESTONES.find((m) => m > currentXp)
  const xpToNext = nextMilestone ? nextMilestone - currentXp : 0

  return (
    <div className="xp-bar-container">
      {/* Header */}
      <div className="xp-bar-header">
        <div className="xp-bar-rank-info">
          <span className="xp-bar-label">Civic XP</span>
          <span
            className="xp-bar-rank-badge"
            style={{ '--rank-color': currentColor }}
          >
            {currentLabel}
          </span>
        </div>
        <div className="xp-bar-value-group">
          <span className="xp-bar-value">⚡ {currentXp.toLocaleString()}</span>
          {nextMilestone && (
            <span className="xp-bar-next">
              {xpToNext.toLocaleString()} XP to {MILESTONE_LABELS[rankIdx + 1]}
            </span>
          )}
        </div>
      </div>

      {/* Track */}
      <div className="xp-bar-track" role="progressbar" aria-valuenow={currentXp} aria-valuemax={maxXp}>
        {/* Animated fill */}
        <div
          className="xp-bar-fill"
          style={{
            width: `${pct}%`,
            '--fill-color-start': '#6C63FF',
            '--fill-color-end': currentColor,
          }}
        />

        {/* Milestone markers (skip index 0 = Newcomer at 0 XP) */}
        {XP_MILESTONES.slice(1).map((m, i) => {
          const reached = currentXp >= m
          const leftPct = (m / maxXp) * 100
          return (
            <div
              key={m}
              className={`xp-milestone ${reached ? 'xp-milestone--reached' : ''}`}
              style={{
                left: `${leftPct}%`,
                '--milestone-color': MILESTONE_COLORS[i + 1],
              }}
              title={`${MILESTONE_LABELS[i + 1]} · ${m.toLocaleString()} XP`}
            >
              <div className="xp-milestone__dot" />
              <span className="xp-milestone__label">{MILESTONE_LABELS[i + 1]}</span>
            </div>
          )
        })}
      </div>

      {/* Range row */}
      <div className="xp-bar-range">
        <span className="xp-bar-range__start">0</span>
        <span className="xp-bar-range__end">5,000 XP</span>
      </div>
    </div>
  )
}
