import React from 'react';
import { FormField, SelectInput } from './FormSystem.jsx';

const groupAccountsByInstitution = (accounts, institutions) => {
  const instMap = new Map();
  institutions.forEach(inst => {
    instMap.set(inst.id, { institution: inst, accounts: [] });
  });
  const noInstAccounts = [];
  accounts.forEach(acc => {
    if (acc.institutionId && instMap.has(acc.institutionId)) {
      instMap.get(acc.institutionId).accounts.push(acc);
    } else {
      noInstAccounts.push(acc);
    }
  });
  const groups = Array.from(instMap.values())
    .filter(g => g.accounts.length > 0)
    .sort((a, b) => (a.institution.name || '').localeCompare(b.institution.name || '', 'es', { sensitivity: 'base' }));
  groups.forEach(g => {
    g.accounts.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
  });
  if (noInstAccounts.length > 0) {
    noInstAccounts.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
    groups.push({
      institution: { id: 'other', name: 'Otras cuentas / Efectivo' },
      accounts: noInstAccounts,
    });
  }
  return groups;
};

export default function PaymentMethodSelector({
  value,
  onChange,
  isCobrar,
  activeAccounts = [],
  institutions = [],
  instruments = [],
  required = true,
}) {
  const selectorLabel = isCobrar ? 'Cuenta de depósito' : 'Medio de pago';
  const groups = groupAccountsByInstitution(activeAccounts, institutions);

  return (
    <FormField label={selectorLabel} htmlFor="payment-method">
      <SelectInput
        id="payment-method"
        value={value}
        onChange={onChange}
        required={required}
      >
        <option value="" disabled>
          {isCobrar ? 'Selecciona cuenta...' : 'Selecciona medio de pago...'}
        </option>
        {isCobrar
          ? groups.map(group => (
              <optgroup key={`inst-${group.institution.id}`} label={group.institution.name}>
                {group.accounts.map(acc => (
                  <option key={`acc-${acc.id}`} value={`acc-${acc.id}`}>
                    {acc.name} — {acc.currency}
                  </option>
                ))}
              </optgroup>
            ))
          : groups.map(group => (
              <optgroup key={`inst-${group.institution.id}`} label={group.institution.name}>
                {group.accounts.map(acc => {
                  const acctInsts = instruments.filter(i => i.accountId === acc.id);
                  if (acctInsts.length === 0) {
                    return (
                      <option key={`acc-${acc.id}`} value={`acc-${acc.id}`}>
                        {acc.name} — {acc.currency} (Saldo)
                      </option>
                    );
                  }
                  return (
                    <React.Fragment key={`acc-frag-${acc.id}`}>
                      <option value={`acc-${acc.id}`}>
                        {acc.name} — Saldo de cuenta ({acc.currency})
                      </option>
                      {acctInsts.map(i => (
                        <option key={`inst-${i.id}`} value={`inst-${i.id}`}>
                          {acc.name} — {i.alias || i.type} ({acc.currency})
                        </option>
                      ))}
                    </React.Fragment>
                  );
                })}
              </optgroup>
            ))
        }
      </SelectInput>
    </FormField>
  );
}
