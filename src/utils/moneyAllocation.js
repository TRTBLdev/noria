const assertFiniteNonNegative = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} debe ser un número no negativo.`);
  return number;
};

export function getCurrencyDecimals(currencyCode, currencies = [], fallback = 2) {
  const configured = Number(currencies.find(item => item.code === currencyCode)?.decimalPlaces);
  return Number.isInteger(configured) && configured >= 0 ? configured : fallback;
}

export function roundMoney(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function allocateAmount(total, weights, decimals = 2) {
  const safeTotal = assertFiniteNonNegative(total, 'El total');
  const safeWeights = weights.map((weight, index) => assertFiniteNonNegative(weight, `El peso #${index + 1}`));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (safeWeights.length === 0) return [];
  if (weightTotal <= 0) {
    if (safeTotal === 0) return safeWeights.map(() => 0);
    throw new Error('No se puede repartir un monto positivo entre partes vacías.');
  }

  const factor = 10 ** decimals;
  const totalUnits = Math.round(safeTotal * factor);
  const rawUnits = safeWeights.map(weight => (weight / weightTotal) * totalUnits);
  const allocatedUnits = rawUnits.map(value => Math.floor(value));
  let remainder = totalUnits - allocatedUnits.reduce((sum, value) => sum + value, 0);
  const priority = rawUnits
    .map((value, index) => ({ index, fraction: value - allocatedUnits[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  for (let index = 0; index < remainder; index += 1) {
    allocatedUnits[priority[index % priority.length].index] += 1;
  }
  return allocatedUnits.map(value => value / factor);
}

export function assertAmountsEqual(left, right, decimals = 2, message = 'Los montos no coinciden.') {
  const factor = 10 ** decimals;
  if (Math.round(Number(left) * factor) !== Math.round(Number(right) * factor)) throw new Error(message);
}

export function distributeLotConsumptions(consumptions = [], weights = []) {
  const result = weights.map(() => []);
  for (const consumption of consumptions) {
    const amountShares = allocateAmount(Number(consumption.amountConsumed) || 0, weights, 6);
    const costShares = allocateAmount(Number(consumption.costConsumed) || 0, weights, 6);
    for (let index = 0; index < result.length; index += 1) {
      if (amountShares[index] === 0 && costShares[index] === 0) continue;
      result[index].push({
        lotId: consumption.lotId,
        amountConsumed: amountShares[index],
        costConsumed: costShares[index],
        costCurrency: consumption.costCurrency,
      });
    }
  }
  return result;
}
