export const getParityUnitsPerBase = (currency, currencies = []) => {
  const definition = currencies.find(item => item.code === currency);
  const unitsPerBase = Number(definition?.unitsPerBase);
  return definition?.baseRelation === 'PARITY' && Number.isFinite(unitsPerBase) && unitsPerBase > 0
    ? unitsPerBase
    : null;
};

export const convertAmountToBase = (amt, currency, baseCurrency, lots = [], currencies = []) => {
  if (!currency || !baseCurrency) return null;
  if (currency === baseCurrency) return amt;
  const parityUnits = getParityUnitsPerBase(currency, currencies);
  if (parityUnits) return amt / parityUnits;
  const currencyLots = lots.filter(l => l.currency === currency && l.remainingAmount > 0);
  const totalRemaining = currencyLots.reduce((sum, l) => sum + l.remainingAmount, 0);
  const totalBaseCost = currencyLots
    .filter(l => l.costCurrency === baseCurrency)
    .reduce((sum, l) => sum + (Number(l.remainingCostAmount) || 0), 0);
  if (totalRemaining <= 0 || totalBaseCost <= 0) return null;
  return amt * (totalBaseCost / totalRemaining);
};
