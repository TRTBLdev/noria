import React from 'react';

export default function NoriaSwitch({ id, checked, onChange, disabled = false }) {
  return (
    <button
      id={id}
      type="button"
      onClick={onChange}
      disabled={disabled}
      aria-pressed={checked}
      className="relative h-7 w-14 border-2 border-[#1A1A1A] focus:outline-none disabled:opacity-40"
      style={{ background: checked ? '#647C78' : '#F5F2ED' }}
    >
      {!checked && (
        <span className="absolute bottom-[3px] right-[3px] top-[3px] w-[21px] bg-[#1A1A1A]" />
      )}
      <span
        className="absolute bottom-[3px] top-[3px] z-10 w-[21px] border-2 border-[#1A1A1A] bg-[#F5F2ED]"
        style={{ left: checked ? 'calc(100% - 24px)' : '3px' }}
      />
    </button>
  );
}
