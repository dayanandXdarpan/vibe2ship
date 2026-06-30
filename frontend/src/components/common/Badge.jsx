import React from 'react';

export default function Badge({
  children,
  variant = 'default',
  className = '',
  ...props
}) {
  return (
    <span
      className={`chip chip--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}
