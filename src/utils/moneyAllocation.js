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

const toMinorUnits = (value, decimals) => Math.round(assertFiniteNonNegative(value, 'El monto') * (10 ** decimals));
const fromMinorUnits = (value, decimals) => value / (10 ** decimals);

export function getReceiptAllocationBuckets({
  hasTaxBreakdown,
  invoiceTotal,
  taxableBase,
  exemptBase,
  parts = [],
  decimals = 2,
}) {
  const definitions = hasTaxBreakdown
    ? [
        { key: 'TAXABLE', taxTreatment: 'TAXABLE', total: taxableBase },
        { key: 'EXEMPT', taxTreatment: 'EXEMPT', total: exemptBase },
      ]
    : [{ key: 'GROSS', taxTreatment: null, total: invoiceTotal }];

  return definitions.map(definition => {
    const totalUnits = toMinorUnits(Math.max(0, Number(definition.total) || 0), decimals);
    const assignedUnits = parts
      .filter(part => !hasTaxBreakdown || part.taxTreatment === definition.taxTreatment)
      .reduce((sum, part) => sum + toMinorUnits(Math.max(0, Number(part.amount) || 0), decimals), 0);
    const differenceUnits = totalUnits - assignedUnits;
    return {
      ...definition,
      total: fromMinorUnits(totalUnits, decimals),
      assigned: fromMinorUnits(assignedUnits, decimals),
      remaining: fromMinorUnits(Math.max(0, differenceUnits), decimals),
      overage: fromMinorUnits(Math.max(0, -differenceUnits), decimals),
    };
  });
}

export function getSharedConsumptionShares({ subtotal, participantAmounts = [], splitMethod, decimals = 2 }) {
  const subtotalUnits = toMinorUnits(Math.max(0, Number(subtotal) || 0), decimals);
  if (splitMethod !== 'MANUAL') {
    return {
      shares: allocateAmount(fromMinorUnits(subtotalUnits, decimals), participantAmounts.map(() => 1), decimals),
      overage: 0,
    };
  }

  const otherUnits = participantAmounts.slice(1).map(value => toMinorUnits(Math.max(0, Number(value) || 0), decimals));
  const otherTotalUnits = otherUnits.reduce((sum, value) => sum + value, 0);
  return {
    shares: [fromMinorUnits(Math.max(0, subtotalUnits - otherTotalUnits), decimals), ...otherUnits.map(value => fromMinorUnits(value, decimals))],
    overage: fromMinorUnits(Math.max(0, otherTotalUnits - subtotalUnits), decimals),
  };
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
