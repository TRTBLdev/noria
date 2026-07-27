import React from 'react';
import { X } from 'lucide-react';

export function FormSheet({ title, onClose, children, footer, className = '', showHandle = false, maxHeight = '88vh' }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-[rgba(26,26,26,0.14)]" onClick={onClose} />
      <div
        className={[
          'fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md animate-slide-up overflow-y-auto border-l-2 border-r-2 border-t-2 border-[#1A1A1A] bg-[#F5F2ED]',
          className
        ].join(' ')}
        style={{ maxHeight }}
      >
        <div className="sticky top-0 z-10 border-b border-[#1A1A1A] bg-[#F5F2ED] px-6 py-4">
          {showHandle && (
            <div className="mb-3 flex justify-center">
              <div className="h-[3px] w-8 bg-[rgba(26,26,26,0.12)]" />
            </div>
          )}
          <div className="flex items-center justify-between">
            <h4 className="text-[17px] font-[600] leading-tight text-noria-text">{title}</h4>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-noria-muted hover:text-noria-text focus:outline-none"
              aria-label="Cerrar"
            >
              <X size={16} strokeWidth={1.6} />
            </button>
          </div>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 border-t border-[#1A1A1A] bg-[#F5F2ED] px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

export function FormField({ label, htmlFor, hint, error, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="muji-header mb-1 block">
          {label}
        </label>
      )}
      {children}
      {hint && <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-noria-muted">{hint}</p>}
      {error && <p className="mt-1 text-[11px] font-[500] text-[#9F2F2D]">{error}</p>}
    </div>
  );
}

const inputClass = 'muji-input';

export function TextInput(props) {
  return <input type="text" className={inputClass} {...props} />;
}

export function NumberInput(props) {
  return <input type="number" className={inputClass} {...props} />;
}

export function DateInput(props) {
  return <input type="date" className={inputClass} {...props} />;
}

export function SelectInput({ children, ...props }) {
  return (
    <select className={inputClass} {...props}>
      {children}
    </select>
  );
}

export function SegmentedChoice({ label, value, onChange, options, disabledValues = [], className = '' }) {
  return (
    <FormField label={label} className={className}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(option => {
          const isSelected = value === option.value;
          const isDisabled = disabledValues.includes(option.value) || option.disabled;
          const color = option.color || '#1A1A1A';
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              disabled={isDisabled}
              className="border px-2 py-2.5 font-mono text-[10px] font-[700] uppercase tracking-[0.12em] transition-colors focus:outline-none disabled:opacity-30"
              style={{
                borderColor: isSelected ? color : 'rgba(26,26,26,0.18)',
                color: isSelected ? color : 'rgba(26,26,26,0.48)',
                background: 'transparent'
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </FormField>
  );
}

export function FormActions({ primaryLabel, secondaryLabel, onSecondary, primaryDisabled = false, primaryColor, danger = false, className = '' }) {
  const actionColor = danger ? '#9F2F2D' : (primaryColor || '#1A1A1A');

  return (
    <div className={['grid gap-2', secondaryLabel ? 'grid-cols-2' : 'grid-cols-1', className].join(' ')}>
      {secondaryLabel && (
        <button
          type="button"
          onClick={onSecondary}
          className="border border-[#1A1A1A] px-3 py-3 font-mono text-[11px] font-[700] uppercase tracking-[0.12em] text-noria-text"
        >
          {secondaryLabel}
        </button>
      )}
      <button
        type="submit"
        disabled={primaryDisabled}
        className="border px-3 py-3 font-mono text-[11px] font-[700] uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-30"
        style={{
          borderColor: actionColor,
          color: actionColor,
          background: 'transparent'
        }}
      >
        {primaryLabel}
      </button>
    </div>
  );
}
