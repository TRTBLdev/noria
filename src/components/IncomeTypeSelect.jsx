import React from 'react';

export default function IncomeTypeSelect({
  id,
  value,
  onChange,
  incomeTypes = [],
  label = 'Tipo de ingreso',
  className = ''
}) {
  return (
    <div className={className}>
      <label className="muji-header block mb-1" htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="muji-input"
        required
      >
        <option value="" disabled>Selecciona tipo...</option>
        {incomeTypes.map(type => (
          <option key={type.id} value={type.id}>{type.name}</option>
        ))}
      </select>
    </div>
  );
}
