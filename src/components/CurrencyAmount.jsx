import React from 'react';
import { getCurrencySymbol, formatCurrency } from '../utils/format';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';

export function CurrencyAmount({ amount, currencyCode, prefix = '', suffix = '', className = '', style = {} }) {
  const dbCurrencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const currency = dbCurrencies.find(item => item.code === currencyCode);
  const symbol = getCurrencySymbol(currencyCode, dbCurrencies);
  const formatted = formatCurrency(amount, currencyCode, dbCurrencies);
  const symbolAfter = currency?.symbolPosition === 'after';
  
  return (
    <span className={className} style={style}>
      {prefix}
      {!symbolAfter && <span className="font-mono">{symbol}</span>}
      {formatted}
      {symbolAfter && <span className="font-mono ml-1">{symbol}</span>}
      {suffix}
    </span>
  );
}

export default CurrencyAmount;
