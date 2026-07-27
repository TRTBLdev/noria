export const formatNumber = (amount, decimals = 2) => {
  if (typeof amount !== 'number') amount = Number(amount) || 0;
  return amount.toLocaleString('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

export const formatCurrency = (amount, currencyCode = '', dbCurrencies = []) => {
  let decimals = 2;
  if (dbCurrencies && dbCurrencies.length > 0) {
    const currency = dbCurrencies.find(c => c.code === currencyCode);
    if (currency && currency.decimalPlaces !== undefined) {
      decimals = currency.decimalPlaces;
    }
  }
  return formatNumber(amount, decimals);
};

export const getCurrencySymbol = (code, dbCurrencies = []) => {
  if (dbCurrencies && dbCurrencies.length > 0) {
    const currency = dbCurrencies.find(c => c.code === code);
    if (currency && currency.symbol) return currency.symbol;
  }
  return code || '';
};

export const formatAmountWithSymbol = (amt, code, dbCurrencies = []) => {
  const currency = dbCurrencies.find(item => item.code === code);
  const symbol = getCurrencySymbol(code, dbCurrencies);
  const formatted = formatCurrency(amt, code, dbCurrencies);
  return currency?.symbolPosition === 'after'
    ? `${formatted} ${symbol}`
    : `${symbol}${formatted}`;
};
