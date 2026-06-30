import React from 'react';
import { TrendingUp } from 'lucide-react';
import Card from '../common/Card';

export default function StatCard({ icon: Icon, label, value, sub, color, trend }) {
  return (
    <Card className="dash-stat-card">
      <div className="dash-stat-icon" style={{ background: `${color}22`, color }}>
        {Icon && <Icon size={20} />}
      </div>
      <div>
        <p className="caption">{label}</p>
        <p className="display-md" style={{ color }}>{value}</p>
        {sub && <p className="caption" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
      {trend !== undefined && (
        <div className={`dash-stat-trend ${trend >= 0 ? 'up' : 'down'}`}>
          <TrendingUp size={14} />
          <span>{Math.abs(trend)}%</span>
        </div>
      )}
    </Card>
  );
}
