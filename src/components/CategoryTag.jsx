import React from 'react';

export default function CategoryTag({ name, size = 'sm', className = '' }) {
  if (!name) return null;

  const sizeClass = size === 'xs'
    ? 'px-1.5 py-[1px] text-[8px]'
    : 'px-2 py-0.5 text-[9px]';

  return (
    <span
      className={[
        'inline-flex max-w-full shrink-0 items-center gap-1 border border-[#1A1A1A] bg-transparent font-mono font-[700] uppercase tracking-[0.08em] leading-none text-[#1A1A1A]',
        sizeClass,
        className
      ].join(' ')}
      title={name}
    >
      <span className="opacity-50">#</span>
      <span className="truncate">{name}</span>
    </span>
  );
}
