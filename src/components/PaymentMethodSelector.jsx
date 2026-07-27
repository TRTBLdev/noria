import React from 'react';
import { FormField, SelectInput } from './FormSystem.jsx';

export default function PaymentMethodSelector({
  value,
  onChange,
  isCobrar,
  activeAccounts = [],
  instruments = [],
  required = true,
}) {
  const selectorLabel = isCobrar ? 'Cuenta de depósito' : 'Medio de pago';
  
  const getAccountLabel = (acc) => {
    return acc.name;
  };

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
          ? activeAccounts.map(acc => (
              <option key={`acc-${acc.id}`} value={`acc-${acc.id}`}>
                {getAccountLabel(acc)} — {acc.currency}
              </option>
            ))
          : activeAccounts.map(acc => {
              const acctInsts = instruments.filter(i => i.accountId === acc.id);
              const label = getAccountLabel(acc);
              if (acctInsts.length === 0) {
                return (
                  <option key={`acc-${acc.id}`} value={`acc-${acc.id}`}>
                    {label} — {acc.currency} (Saldo)
                  </option>
                );
              }
              return (
                <optgroup key={acc.id} label={`${label} (${acc.currency})`}>
                  {acctInsts.map(i => (
                    <option key={`inst-${i.id}`} value={`inst-${i.id}`}>
                      {i.alias || i.type}
                    </option>
                  ))}
                  <option value={`acc-${acc.id}`}>Saldo de cuenta</option>
                </optgroup>
              );
            })
        }
      </SelectInput>
    </FormField>
  );
}
