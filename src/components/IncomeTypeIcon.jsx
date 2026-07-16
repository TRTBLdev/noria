import React from 'react';
import CategoryIcon from './CategoryIcon.jsx';

export function getIncomeType(incomeTypes, incomeTypeId, legacyType) {
  const byId = incomeTypes.find(type => type.id === incomeTypeId);
  if (byId) return byId;
  if (legacyType) {
    const byLegacy = incomeTypes.find(type => type.legacyKey === legacyType);
    if (byLegacy) return byLegacy;
  }
  return incomeTypes.find(type => type.legacyKey === 'OTHER') || null;
}

export default function IncomeTypeIcon({ incomeTypes = [], incomeTypeId, legacyType, size = 16, className = '' }) {
  const incomeType = getIncomeType(incomeTypes, incomeTypeId, legacyType);
  return <CategoryIcon iconKey={incomeType?.iconKey || 'money'} size={size} className={className} title={incomeType?.name || 'Tipo de ingreso'} />;
}
