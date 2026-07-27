const EPSILON = 0.005;

function assertPositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} debe ser mayor a cero.`);
}

export function parseLotConsumption(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error('El detalle de consumo de lotes está dañado.');
  }
}

export async function getActiveCurrencyLots(db, accountId, currency) {
  if (!currency) return [];
  const lots = await db.lots
    .where('currency').equals(currency)
    .filter(lot => lot.accountId === accountId && lot.remainingAmount > EPSILON)
    .toArray();
  return lots.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);
}

export async function consumeCurrencyLots(db, { accountId, currency, amount }) {
  assertPositiveNumber(amount, 'El monto a consumir');
  if (!currency) throw new Error('La divisa de lotes no está configurada.');
  const lots = await getActiveCurrencyLots(db, accountId, currency);
  const available = lots.reduce((sum, lot) => sum + lot.remainingAmount, 0);
  if (available + EPSILON < amount) {
    throw new Error(`Los lotes no concilian. Requerido: ${amount.toFixed(2)} ${currency}; disponible: ${available.toFixed(2)} ${currency}.`);
  }

  let pending = amount;
  let baseAmount = 0;
  let baseCurrency = null;
  const consumptions = [];
  for (const lot of lots) {
    if (pending <= EPSILON) break;
    if (!Number.isFinite(lot.remainingCostAmount) || lot.remainingCostAmount < 0 || !lot.costCurrency) {
      throw new Error(`El lote #${lot.id} no conserva un costo base válido.`);
    }
    if (baseCurrency && baseCurrency !== lot.costCurrency) {
      throw new Error('Los lotes activos mezclan monedas base y no pueden consumirse juntos.');
    }
    const previousRemaining = lot.remainingAmount;
    const consumed = Math.min(previousRemaining, pending);
    const costConsumed = lot.remainingCostAmount * (consumed / previousRemaining);
    const remainingAmount = Math.max(0, previousRemaining - consumed);
    const remainingCostAmount = Math.max(0, lot.remainingCostAmount - costConsumed);
    baseCurrency = lot.costCurrency;
    baseAmount += costConsumed;
    consumptions.push({ lotId: lot.id, amountConsumed: consumed, costConsumed, costCurrency: lot.costCurrency });
    pending -= consumed;
    await db.lots.update(lot.id, {
      remainingAmount,
      remainingCostAmount,
      status: remainingAmount <= EPSILON ? 'EXHAUSTED' : 'ACTIVE',
    });
  }
  return { consumptions, baseAmount: Number(baseAmount.toFixed(6)), baseCurrency };
}

export async function restoreCurrencyLots(db, consumptionValue) {
  for (const consumption of parseLotConsumption(consumptionValue)) {
    const lot = await db.lots.get(consumption.lotId);
    if (!lot) throw new Error(`No existe el lote #${consumption.lotId} que debe restaurarse.`);
    const amountConsumed = Number(consumption.amountConsumed);
    const costConsumed = Number.isFinite(consumption.costConsumed)
      ? Number(consumption.costConsumed)
      : amountConsumed / lot.effectiveRate;
    const restoredAmount = lot.remainingAmount + amountConsumed;
    const restoredCost = lot.remainingCostAmount + costConsumed;
    if (restoredAmount > lot.amount + EPSILON || restoredCost > lot.costAmount + EPSILON) {
      throw new Error(`Restaurar la operación excedería el lote original #${lot.id}.`);
    }
    await db.lots.update(lot.id, {
      remainingAmount: Math.min(lot.amount, restoredAmount),
      remainingCostAmount: Math.min(lot.costAmount, restoredCost),
      status: 'ACTIVE',
    });
  }
}

export async function createCurrencyLot(db, {
  transactionId = null, accountId, currency, amount, costCurrency, costAmount, date, sourceType,
}) {
  assertPositiveNumber(amount, 'El monto del lote');
  assertPositiveNumber(costAmount, 'El costo del lote');
  if (!currency || !costCurrency) throw new Error('El lote debe indicar sus dos divisas.');
  if (currency === costCurrency) throw new Error('La divisa de lotes debe ser distinta de la moneda base.');
  return db.lots.add({
    transactionId, accountId, currency, amount, remainingAmount: amount,
    costCurrency, costAmount, remainingCostAmount: costAmount,
    effectiveRate: amount / costAmount,
    status: 'ACTIVE', date, sourceType: sourceType || null,
  });
}

export async function deleteUnconsumedCurrencyLots(db, transactionId) {
  const lots = await db.lots.where('transactionId').equals(transactionId).toArray();
  for (const lot of lots) {
    if (Math.abs(lot.remainingAmount - lot.amount) > EPSILON
      || Math.abs(lot.remainingCostAmount - lot.costAmount) > EPSILON) {
      throw new Error(`El lote #${lot.id} ya fue consumido. No se puede borrar su operación de origen.`);
    }
  }
  await db.lots.bulkDelete(lots.map(lot => lot.id));
  return lots.length;
}

export function stringifyLotConsumption(consumptions) {
  return consumptions.length > 0 ? JSON.stringify(consumptions) : null;
}

export function sumActiveLots(lots, accountId, currency) {
  return lots
    .filter(lot => lot.currency === currency && lot.accountId === accountId && lot.remainingAmount > EPSILON)
    .reduce((sum, lot) => sum + lot.remainingAmount, 0);
}

export { EPSILON as LOT_EPSILON };
