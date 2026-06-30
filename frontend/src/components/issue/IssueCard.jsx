import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, ThumbsUp, MessageSquare, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Badge from '../common/Badge';
import Card from '../common/Card';

const SEV_LABELS = { 5: 'Critical', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Minimal' };
const SEV_CLASSES = { 5: 'sev-chip-5', 4: 'sev-chip-4', 3: 'sev-chip-3', 2: 'sev-chip-2', 1: 'sev-chip-1' };
const STATUS_CHIP_CLASSES = {
  processing: 'info', triage: 'info', in_review: 'warning',
  validated: 'primary', assigned: 'primary', in_progress: 'warning',
  resolved: 'success', closed: 'default', escalated: 'danger',
  rejected: 'danger', duplicate_found: 'default',
};
const CAT_EMOJIS = {
  pothole: '🕳️', water_leak: '💧', streetlight: '💡', garbage: '🗑️',
  tree_hazard: '🌳', road_damage: '🚧', other: '🏙️', default: '⚠️',
};

const IssueCard = memo(function IssueCard({ issue, onUpvote }) {
  const createdAt = issue.created_at?.toDate?.() || issue.created_at;
  const timeAgo = createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : 'recently';
  const emoji = CAT_EMOJIS[issue.category] || CAT_EMOJIS.default;
  const statusVariant = STATUS_CHIP_CLASSES[issue.status] || 'default';

  return (
    <Link to={`/issues/${issue.id}`} className="issue-card card animate-fade-in" id={`issue-${issue.id}`}>
      {/* Media */}
      {issue.image_url ? (
        <div className="issue-card__media" style={{ position: 'relative' }}>
          <img 
            src={issue.image_url} 
            alt={issue.category} 
            loading="lazy" 
            style={issue.pii_detected ? { filter: 'blur(3px)' } : {}}
          />
          {issue.pii_detected && (
            <Badge variant="warning" style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '0.65rem', zIndex: 2, display: 'flex', alignItems: 'center', gap: '4px' }}>
              🛡️ Privacy Masked
            </Badge>
          )}
          {issue.severity && (
            <span className={`chip ${SEV_CLASSES[issue.severity]} issue-card__sev-badge`}>
              {SEV_LABELS[issue.severity]}
            </span>
          )}
        </div>
      ) : (
        <div className="issue-card__media-placeholder">
          <span style={{ fontSize: '3rem' }}>{emoji}</span>
        </div>
      )}

      <div className="issue-card__body">
        {/* Header */}
        <div className="flex items-center justify-between gap-sm">
          <span className="issue-card__category">
            {emoji} {(issue.category || 'Unknown').replace('_', ' ')}
          </span>
          <Badge variant={statusVariant} style={{ fontSize: '0.7rem' }}>
            {(issue.status || '').replace('_', ' ')}
          </Badge>
        </div>

        {/* Description */}
        <p className="issue-card__desc">
          {issue.ai_description || issue.user_description || 'No description available'}
        </p>

        {/* Location */}
        {issue.geo_address && (
          <div className="issue-card__location">
            <MapPin size={12} />
            <span className="caption" style={{ color: 'var(--text-muted)' }}>
              {issue.geo_address.split(',').slice(0, 2).join(',')}
            </span>
          </div>
        )}

        {/* Tags */}
        {issue.tags?.length > 0 && (
          <div className="flex flex-wrap gap-xs">
            {issue.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="default" style={{ fontSize: '0.68rem' }}>#{tag}</Badge>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="issue-card__footer">
          <button
            className="issue-card__action"
            onClick={e => { e.preventDefault(); onUpvote(issue.id); }}
          >
            <ThumbsUp size={13} />
            <span>{issue.upvotes || 0}</span>
          </button>
          <span className="issue-card__action">
            <MessageSquare size={13} />
            <span>{issue.comment_count || 0}</span>
          </span>
          {issue.urgency_weight != null && (
            <span className="issue-card__urgency" title={`Urgency Score: ${(issue.urgency_weight * 100).toFixed(0)}%`}>
              <Zap size={11} />
              <span>{(issue.urgency_weight * 100).toFixed(0)}%</span>
              <span
                className="issue-card__urgency-bar"
                style={{ width: `${issue.urgency_weight * 100}%` }}
              />
            </span>
          )}
          <span className="issue-card__time">
            <Clock size={12} /> {timeAgo}
          </span>
        </div>
      </div>
    </Link>
  );
});

export const SkeletonCard = memo(function SkeletonCard() {
  return (
    <Card className="issue-card">
      <div className="skeleton" style={{ height: '160px', borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }} />
      <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div className="skeleton" style={{ height: '14px', width: '60%' }} />
        <div className="skeleton" style={{ height: '12px', width: '90%' }} />
        <div className="skeleton" style={{ height: '12px', width: '75%' }} />
      </div>
    </Card>
  );
});

export default IssueCard;
