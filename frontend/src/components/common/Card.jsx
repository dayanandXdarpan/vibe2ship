import React from 'react';

export default function Card({
  children,
  variant = 'default',
  className = '',
  ...props
}) {
  const variantClass = variant !== 'default' ? `card--${variant}` : '';
  
  return (
    <div
      className={`card ${variantClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
