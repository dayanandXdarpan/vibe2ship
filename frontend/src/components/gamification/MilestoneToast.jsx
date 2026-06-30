import { useEffect, useState } from 'react'
import './MilestoneToast.css'

/**
 * MilestoneToast — animated badge-unlock notification.
 * Auto-dismisses after 4 seconds. Click to dismiss early.
 * @param {{ badge: object, onDismiss: () => void }} props
 */
export default function MilestoneToast({ badge, onDismiss }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!badge) return
    // Small delay so CSS transition fires after mount
    const showTimer = setTimeout(() => setVisible(true), 80)
    // Auto-dismiss after 4 s
    const hideTimer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 420)
    }, 4000)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [badge])

  const handleClick = () => {
    setVisible(false)
    setTimeout(onDismiss, 420)
  }

  if (!badge) return null

  return (
    <div
      className={`milestone-toast ${visible ? 'milestone-toast--visible' : ''}`}
      style={{ '--badge-color': badge.color }}
      onClick={handleClick}
      role="alert"
      aria-live="polite"
    >
      {/* Decorative confetti-glow layer */}
      <div className="milestone-toast__glow" />
      <div className="milestone-toast__confetti" aria-hidden="true">
        {['✦', '✧', '✦', '✧', '✦'].map((c, i) => (
          <span key={i} className={`milestone-toast__confetti-piece milestone-toast__confetti-piece--${i}`}>
            {c}
          </span>
        ))}
      </div>

      {/* Emoji */}
      <div className="milestone-toast__emoji" aria-hidden="true">
        {badge.emoji}
      </div>

      {/* Text content */}
      <div className="milestone-toast__body">
        <p className="milestone-toast__headline">🎉 Badge Unlocked!</p>
        <p className="milestone-toast__title">{badge.title}</p>
        <p className="milestone-toast__hindi">{badge.hindi}</p>
        <p className="milestone-toast__xp">+{badge.xpReward} XP earned</p>
      </div>

      {/* Dismiss hint */}
      <button className="milestone-toast__close" aria-label="Dismiss">✕</button>

      {/* Timer strip */}
      <div className="milestone-toast__timer" />
    </div>
  )
}
