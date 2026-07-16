import React from 'react';

export default function NoriaSwitch({ id, checked, onChange, disabled = false }) {
  return (
    <button
      id={id}
      type="button"
      onClick={onChange}
      disabled={disabled}
      aria-pressed={checked}
      className="relative h-7 w-14 border-2 bg-[#F5F2ED] focus:outline-none disabled:opacity-40"
      style={{ borderColor: checked ? '#647C78' : '#1A1A1A' }}
    >
      <span
        className="absolute bottom-[4px] top-[4px] w-[4px]"
        style={{
          left: checked ? 'calc(100% - 9px)' : '5px',
          background: checked ? '#647C78' : '#1A1A1A'
        }}
      />
    </button>
  );
}
