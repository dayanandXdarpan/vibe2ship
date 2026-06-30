import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, limit, onSnapshot, updateDoc, doc, writeBatch } from 'firebase/firestore'
import { Bell, CheckCircle, AlertTriangle, Info, Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Link } from 'react-router-dom'
import { db } from '../services/firebase'
import useAuthStore from '../store/authStore'
import './Notifications.css'

const NOTIF_ICONS = {
  issue_resolved: { icon: '🎉', color: 'var(--success)' },
  hitl_approved: { icon: '✅', color: 'var(--success)' },
  hitl_rejected: { icon: 'ℹ️', color: 'var(--warning)' },
  default: { icon: '🔔', color: 'var(--primary-light)' },
}

export default function Notifications() {
  const { user } = useAuthStore()
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'notifications'),
      where('user_id', '==', user.uid),
      orderBy('created_at', 'desc'),
      limit(50)
    )
    const unsub = onSnapshot(q, snap => {
      setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [user])

  const markRead = async (notifId) => {
    await updateDoc(doc(db, 'notifications', notifId), { read: true })
  }

  const markAllRead = async () => {
    const batch = writeBatch(db)
    notifs.filter(n => !n.read).forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { read: true })
    })
    await batch.commit()
  }

  const unreadCount = notifs.filter(n => !n.read).length

  return (
    <div className="notif-page page">
      <div className="container--narrow">
        <div className="page-header flex items-center justify-between">
          <div>
            <h1 className="display-md flex items-center gap-sm">
              <Bell size={28} /> Notifications
            </h1>
            {unreadCount > 0 && <p className="body-sm" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>{unreadCount} unread</p>}
          </div>
          {unreadCount > 0 && (
            <button className="btn btn--secondary btn--sm" onClick={markAllRead}>
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col gap-sm stagger">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card notif-item">
                <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                <div style={{ flex: 1 }}><div className="skeleton" style={{ height: '14px', width: '70%', marginBottom: '8px' }} /><div className="skeleton" style={{ height: '12px', width: '50%' }} /></div>
              </div>
            ))}
          </div>
        ) : notifs.length === 0 ? (
          <div className="notif-empty">
            <span style={{ fontSize: '3rem' }}>🔔</span>
            <h3 className="heading-lg">All caught up!</h3>
            <p className="body-sm" style={{ color: 'var(--text-secondary)' }}>No notifications yet. Start by reporting an issue!</p>
            <Link to="/report" className="btn btn--primary">Report Issue</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-sm stagger">
            {notifs.map(n => {
              const style = NOTIF_ICONS[n.type] || NOTIF_ICONS.default
              const time = n.created_at?.toDate?.() || n.created_at
              return (
                <div
                  key={n.id}
                  className={`card notif-item ${!n.read ? 'notif-item--unread' : ''}`}
                  onClick={() => markRead(n.id)}
                >
                  <div className="notif-icon" style={{ background: `${style.color}22`, color: style.color }}>
                    {style.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p className="body-sm" style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</p>
                    <p className="caption" style={{ color: 'var(--text-secondary)', marginTop: '3px' }}>{n.body}</p>
                    {time && <p className="caption" style={{ color: 'var(--text-muted)', marginTop: '4px' }}>{formatDistanceToNow(time, { addSuffix: true })}</p>}
                  </div>
                  {n.issue_id && (
                    <Link to={`/issues/${n.issue_id}`} className="btn btn--ghost btn--sm" onClick={e => e.stopPropagation()}>
                      View →
                    </Link>
                  )}
                  {!n.read && <div className="notif-dot" />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
