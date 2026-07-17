export const formatNumber = (amount, decimals = 2) => {
  if (typeof amount !== 'number') amount = Number(amount) || 0;
  return amount.toLocaleString('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

export const formatCurrency = (amount, currencyCode = 'USD', dbCurrencies = []) => {
  let decimals = 2;
  if (dbCurrencies && dbCurrencies.length > 0) {
    const currency = dbCurrencies.find(c => c.code === currencyCode);
    if (currency && currency.decimalPlaces !== undefined) {
      decimals = currency.decimalPlaces;
    }
  }
  return formatNumber(amount, decimals);
};

export const getCurrencySymbol = (code) => {
  if (code === 'VES') return 'Bs';
  if (code === 'EUR') return '€';
  if (code === 'USDT' || code === 'USDC') return code;
  return '$';
};

export const formatAmountWithSymbol = (amt, code, dbCurrencies = []) => {
  const symbol = getCurrencySymbol(code);
  const formatted = formatCurrency(amt, code, dbCurrencies);
  if (code === 'VES') return `${formatted} ${symbol}`;
  return `${symbol}${formatted}`;
};
