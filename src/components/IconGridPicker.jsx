import React from 'react';
import { CATEGORY_ICON_OPTIONS } from './CategoryIcon.jsx';

export default function IconGridPicker({ value, onChange, className = '' }) {
  return (
    <div className={`grid grid-cols-6 gap-1.5 ${className}`}>
      {CATEGORY_ICON_OPTIONS.map(({ key, label, Icon }) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="flex h-9 w-full items-center justify-center border bg-transparent text-noria-muted focus:outline-none"
            style={{
              borderColor: selected ? '#647C78' : 'rgba(26,26,26,0.24)',
              color: selected ? '#647C78' : 'rgba(26,26,26,0.58)'
            }}
            title={label}
            aria-label={label}
            aria-pressed={selected}
          >
            <Icon size={15} strokeWidth={1.7} />
          </button>
        );
      })}
    </div>
  );
}
