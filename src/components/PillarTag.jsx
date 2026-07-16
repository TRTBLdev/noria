import React from 'react';

const PILLAR_TAGS = {
  NEED: { label: 'NECESIDAD', color: '#4F8F58' },
  WANT: { label: 'DESEO', color: '#3F7F9C' },
  SAVE: { label: 'AHORRO', color: '#C58A14' }
};

export default function PillarTag({ pillar, size = 'sm', className = '' }) {
  const meta = PILLAR_TAGS[pillar];
  if (!meta) return null;

  const sizeClass = size === 'xs'
    ? 'px-1.5 py-[1px] text-[8px]'
    : 'px-1.5 py-0.5 text-[9px]';

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center border font-mono font-[700] uppercase tracking-[0.08em] leading-none bg-transparent',
        sizeClass,
        className
      ].join(' ')}
      style={{ borderColor: meta.color, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}
