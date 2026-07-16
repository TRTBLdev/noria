import React from 'react';

export default function IncomeTypeTag({ name, size = 'xs', className = '' }) {
  if (!name) return null;

  const sizeClass = size === 'sm'
    ? 'px-1.5 py-[2px] text-[9px]'
    : 'px-1 py-[1px] text-[8px]';

  return (
    <span
      className={`inline-flex max-w-full items-center border border-[#647C78] bg-transparent font-mono font-[700] uppercase leading-none tracking-[0.08em] text-[#647C78] ${sizeClass} ${className}`}
      title={name}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}
