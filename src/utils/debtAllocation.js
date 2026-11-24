import { getCurrencyDecimals, roundMoney } from './moneyAllocation.js';

const EPSILON = 0.001;

const toNumber = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function getDebtRemainingAmount(debt) {
  if (!debt) return 0;
  if (Number.isFinite(Number(debt.remaining))) {
    return Math.max(0, Number(debt.remaining));
  }
  const total = toNumber(debt.totalAmount ?? debt.amount);
  const paid = toNumber(debt.paidAmount);
  return Math.max(0, total - paid);
}

/**
 * Filters open payable debts and orders them FIFO (oldest createdAt first, id asc tie-breaker).
 */
export function sortDebtsFifo(debts = []) {
  return [...debts]
    .filter(debt => (
      debt
      && debt.type === 'PAGAR'
      && !['SETTLED', 'WRITTEN_OFF', 'CANCELLED'].includes(debt.status)
      && getDebtRemainingAmount(debt) > EPSILON
    ))
    .sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
      const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
      if (safeLeft !== safeRight) return safeLeft - safeRight;
      return (Number(left.id) || 0) - (Number(right.id) || 0);
    });
}

/**
 * Computes FIFO allocation across selected (or all open) debts using minor integer units.
 * Supports same-currency 1:1 nominal deductions and per-debt negotiated rates for foreign currencies.
 */
export function computeFifoAllocation({
  availableAmount,
  sourceCurrency,
  debts = [],
  selectedDebtIds = null,
  manualRows = {},
  currencies = [],
}) {
  const sourceDecimals = getCurrencyDecimals(sourceCurrency, currencies);
  const sourceFactor = 10 ** sourceDecimals;
  const availableUnits = Math.round(Math.max(0, toNumber(availableAmount)) * sourceFactor);
  let poolUnits = availableUnits;

  const sorted = sortDebtsFifo(debts);
  const selectedSet = Array.isArray(selectedDebtIds)
    ? new Set(selectedDebtIds.map(id => Number(id)))
    : null;
  const activeDebts = selectedSet
    ? sorted.filter(debt => selectedSet.has(Number(debt.id)))
    : sorted;

  let totalAllocatedUnits = 0;

  const rows = activeDebts.map(debt => {
    const debtId = Number(debt.id);
    const sameCurrency = debt.currency === sourceCurrency;
    const targetDecimals = getCurrencyDecimals(debt.currency, currencies);
    const remaining = roundMoney(getDebtRemainingAmount(debt), targetDecimals);
    const manual = manualRows[debtId] || manualRows[String(debtId)] || null;

    let sourceAmount = 0;
    let targetAmount = 0;
    let appliedRate = sameCurrency ? 1 : null;
    let rateSource = sameCurrency ? 'SAME_CURRENCY' : 'NEGOTIATED_RATE';
    let needsRate = false;
    let isManual = Boolean(manual?.isManual);

    if (sameCurrency) {
      if (isManual && manual?.sourceAmount !== undefined && manual?.sourceAmount !== '' && Number.isFinite(Number(manual.sourceAmount))) {
        sourceAmount = roundMoney(Math.max(0, Number(manual.sourceAmount)), sourceDecimals);
      } else {
        const remainingUnits = Math.round(remaining * sourceFactor);
        const assignedUnits = Math.min(poolUnits, remainingUnits);
        sourceAmount = assignedUnits / sourceFactor;
        isManual = false;
      }
      targetAmount = roundMoney(sourceAmount, targetDecimals);
      appliedRate = 1;
    } else {
      const explicitRate = Number(manual?.appliedRate);
      const hasExplicitSource = manual?.sourceAmount !== undefined && manual?.sourceAmount !== '' && Number.isFinite(Number(manual.sourceAmount));
      const hasExplicitTarget = manual?.targetAmount !== undefined && manual?.targetAmount !== '' && Number.isFinite(Number(manual.targetAmount));

      if (isManual && (hasExplicitSource || hasExplicitTarget)) {
        sourceAmount = hasExplicitSource ? roundMoney(Math.max(0, Number(manual.sourceAmount)), sourceDecimals) : 0;
        targetAmount = hasExplicitTarget ? roundMoney(Math.max(0, Number(manual.targetAmount)), targetDecimals) : 0;
        if (sourceAmount > 0 && targetAmount > 0) {
          appliedRate = Number((sourceAmount / targetAmount).toFixed(6));
        } else if (Number.isFinite(explicitRate) && explicitRate > 0) {
          appliedRate = explicitRate;
          if (sourceAmount > 0 && !hasExplicitTarget) {
            targetAmount = roundMoney(sourceAmount / appliedRate, targetDecimals);
          } else if (targetAmount > 0 && !hasExplicitSource) {
            sourceAmount = roundMoney(targetAmount * appliedRate, sourceDecimals);
          }
        }
      } else if (Number.isFinite(explicitRate) && explicitRate > 0) {
        appliedRate = explicitRate;
        const maxSourceUnits = Math.round(remaining * appliedRate * sourceFactor);
        const assignedUnits = Math.min(poolUnits, maxSourceUnits);
        sourceAmount = assignedUnits / sourceFactor;
        targetAmount = sourceAmount > 0
          ? Math.min(remaining, roundMoney(sourceAmount / appliedRate, targetDecimals))
          : 0;
        isManual = false;
      } else {
        needsRate = true;
      }
    }

    const allocatedUnits = Math.round(sourceAmount * sourceFactor);
    poolUnits = Math.max(0, poolUnits - allocatedUnits);
    totalAllocatedUnits += allocatedUnits;

    const projectedRemaining = roundMoney(Math.max(0, remaining - targetAmount), targetDecimals);
    const exceedsDebt = targetAmount > remaining + EPSILON;
    const willSettle = !exceedsDebt && targetAmount > 0 && projectedRemaining <= EPSILON;

    return {
      debtId,
      debtDescription: debt.description || 'Deuda',
      debtCurrency: debt.currency,
      debtRemaining: remaining,
      sourceAmount,
      targetAmount,
      appliedRate,
      rateSource,
      projectedRemaining,
      willSettle,
      exceedsDebt,
      needsRate,
      isManual,
    };
  });

  const totalAllocatedSource = totalAllocatedUnits / sourceFactor;
  const remainderUnits = Math.max(0, availableUnits - totalAllocatedUnits);
  const overageUnits = Math.max(0, totalAllocatedUnits - availableUnits);

  return {
    rows,
    totalAllocatedSource,
    remainderSource: remainderUnits / sourceFactor,
    overageSource: overageUnits / sourceFactor,
  };
}

/**
 * Bidirectionally syncs sourceAmount, appliedRate, and targetAmount for a cross-currency debt row.
 */
export function syncCrossCurrencyRow({
  field,
  value,
  currentRow = {},
  sourceDecimals = 2,
  targetDecimals = 2,
}) {
  const numeric = value === '' || value === null || value === undefined ? NaN : Number(value);
  const safePositive = Number.isFinite(numeric) && numeric > 0 ? numeric : 0;

  let sourceAmount = Number(currentRow.sourceAmount) || 0;
  let targetAmount = Number(currentRow.targetAmount) || 0;
  let appliedRate = Number(currentRow.appliedRate) || 0;

  if (field === 'appliedRate') {
    appliedRate = safePositive;
    if (appliedRate > 0) {
      if (sourceAmount > 0) {
        targetAmount = roundMoney(sourceAmount / appliedRate, targetDecimals);
      } else if (targetAmount > 0) {
        sourceAmount = roundMoney(targetAmount * appliedRate, sourceDecimals);
      }
    }
  } else if (field === 'targetAmount') {
    targetAmount = safePositive;
    if (appliedRate > 0) {
      sourceAmount = roundMoney(targetAmount * appliedRate, sourceDecimals);
    } else if (sourceAmount > 0 && targetAmount > 0) {
      appliedRate = Number((sourceAmount / targetAmount).toFixed(6));
    }
  } else if (field === 'sourceAmount') {
    sourceAmount = safePositive;
    if (appliedRate > 0) {
      targetAmount = roundMoney(sourceAmount / appliedRate, targetDecimals);
    } else if (targetAmount > 0 && sourceAmount > 0) {
      appliedRate = Number((sourceAmount / targetAmount).toFixed(6));
    }
  }

  return {
    sourceAmount: field === 'sourceAmount' && value === '' ? '' : sourceAmount,
    targetAmount: field === 'targetAmount' && value === '' ? '' : targetAmount,
    appliedRate: field === 'appliedRate' && value === '' ? '' : (appliedRate > 0 ? appliedRate : ''),
    isManual: true,
  };
}

/**
 * Validates a multi-debt allocation plan before writing to Dexie.
 */
export function validateMultiDebtAllocation({
  availableAmount,
  sourceCurrency,
  allocations = [],
  remainderAction = '',
  remainderTagId = null,
  debtsById,
  currencies = [],
}) {
  const sourceDecimals = getCurrencyDecimals(sourceCurrency, currencies);
  const tolerance = 0.5 / (10 ** sourceDecimals);
  const safeAvailable = roundMoney(Math.max(0, toNumber(availableAmount)), sourceDecimals);

  if (safeAvailable <= 0) {
    throw new Error('El monto disponible para asignar a deudas debe ser mayor a cero.');
  }
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new Error('Selecciona al menos una deuda abierta para aplicar el monto.');
  }

  const seenDebtIds = new Set();
  const normalizedAllocations = [];
  let totalSource = 0;

  for (let index = 0; index < allocations.length; index += 1) {
    const item = allocations[index];
    const debtId = Number(item.debtId);
    if (!debtId) throw new Error(`Selecciona una deuda válida en la posición #${index + 1}.`);
    if (seenDebtIds.has(debtId)) throw new Error('Una deuda no puede aparecer dos veces en el mismo reparto.');
    seenDebtIds.add(debtId);

    const debt = debtsById instanceof Map ? debtsById.get(debtId) : debtsById?.[debtId];
    if (!debt) throw new Error('Una de las deudas seleccionadas ya no existe.');
    if (debt.type !== 'PAGAR') throw new Error(`La deuda "${debt.description}" no es una deuda por pagar.`);

    const targetDecimals = getCurrencyDecimals(debt.currency, currencies);
    const remaining = roundMoney(getDebtRemainingAmount(debt), targetDecimals);
    const sourceAmount = roundMoney(toNumber(item.sourceAmount), sourceDecimals);
    const sameCurrency = debt.currency === sourceCurrency;
    const targetAmount = sameCurrency
      ? roundMoney(sourceAmount, targetDecimals)
      : roundMoney(toNumber(item.targetAmount), targetDecimals);

    if (sourceAmount <= 0) {
      throw new Error(`El monto aplicado a "${debt.description}" debe ser mayor a cero.`);
    }
    if (targetAmount <= 0) {
      throw new Error(`Indica la tasa o el monto reconocido para "${debt.description}".`);
    }
    if (targetAmount > remaining + EPSILON) {
      throw new Error(
        `El abono (${targetAmount.toFixed(targetDecimals)} ${debt.currency}) excede el saldo de "${debt.description}" (${remaining.toFixed(targetDecimals)} ${debt.currency}).`
      );
    }

    const appliedRate = sameCurrency
      ? 1
      : (Number.isFinite(Number(item.appliedRate)) && Number(item.appliedRate) > 0
        ? Number(item.appliedRate)
        : Number((sourceAmount / targetAmount).toFixed(6)));
    const rateSource = sameCurrency
      ? 'SAME_CURRENCY'
      : (item.rateSource || 'NEGOTIATED_RATE');

    totalSource += sourceAmount;
    normalizedAllocations.push({
      debtId,
      sourceAmount,
      targetAmount,
      targetCurrency: debt.currency,
      appliedRate,
      rateSource,
      allocationOrder: index + 1,
    });
  }

  totalSource = roundMoney(totalSource, sourceDecimals);
  if (totalSource > safeAvailable + tolerance) {
    throw new Error('La suma asignada a las deudas excede el monto disponible de la fracción.');
  }

  const remainder = roundMoney(Math.max(0, safeAvailable - totalSource), sourceDecimals);
  if (remainder > tolerance) {
    if (!['CREATE_RECEIVABLE', 'PERSONAL_EXPENSE'].includes(remainderAction)) {
      throw new Error('Destina el remanente a una nueva deuda por cobrar o a gasto personal antes de confirmar.');
    }
    if (remainderAction === 'PERSONAL_EXPENSE' && !remainderTagId) {
      throw new Error('Selecciona una categoría para el remanente clasificado como gasto personal.');
    }
  }

  return {
    totalSource,
    remainder: remainder > tolerance ? remainder : 0,
    normalizedAllocations,
  };
}

/**
 * Selects open debts in FIFO order until availableAmount is exhausted (preserving existing foreign rates).
 */
export function suggestFifoSelection({
  availableAmount,
  sourceCurrency,
  debts = [],
  existingManualRows = {},
  currencies = [],
}) {
  const sorted = sortDebtsFifo(debts);
  const sourceDecimals = getCurrencyDecimals(sourceCurrency, currencies);
  const sourceFactor = 10 ** sourceDecimals;
  const tolerance = 0.5 / sourceFactor;
  let pool = Math.max(0, toNumber(availableAmount));
  const selectedDebtIds = [];
  const manualRows = {};

  for (const debt of sorted) {
    const existing = existingManualRows[debt.id] || existingManualRows[String(debt.id)];
    const hasRate = debt.currency !== sourceCurrency && Number(existing?.appliedRate) > 0;
    if (debt.currency === sourceCurrency) {
      if (pool <= tolerance) break;
      selectedDebtIds.push(debt.id);
      const remaining = getDebtRemainingAmount(debt);
      pool = Math.max(0, roundMoney(pool - Math.min(pool, remaining), sourceDecimals));
    } else if (hasRate) {
      if (pool <= tolerance) break;
      selectedDebtIds.push(debt.id);
      const rate = Number(existing.appliedRate);
      manualRows[debt.id] = { appliedRate: rate, isManual: false };
      const maxSource = roundMoney(getDebtRemainingAmount(debt) * rate, sourceDecimals);
      pool = Math.max(0, roundMoney(pool - Math.min(pool, maxSource), sourceDecimals));
    } else {
      // Foreign currency without rate yet: include if pool still has funds so user can negotiate rate
      if (pool > tolerance) {
        selectedDebtIds.push(debt.id);
      }
    }
  }

  return { selectedDebtIds, manualRows };
}

/**
 * Converts UI multi-debt panel state + computed allocation into a validated destination payload.
 */
export function buildMultiDebtDestination({
  panelState,
  availableAmount,
  sourceCurrency,
  openDebts = [],
  currencies = [],
}) {
  const { rows, remainderSource, overageSource } = computeFifoAllocation({
    availableAmount,
    sourceCurrency,
    debts: openDebts,
    selectedDebtIds: panelState?.selectedDebtIds || [],
    manualRows: panelState?.manualRows || {},
    currencies,
  });

  const sourceDecimals = getCurrencyDecimals(sourceCurrency, currencies);
  const tolerance = 0.5 / (10 ** sourceDecimals);
  if (overageSource > tolerance) {
    throw new Error('La suma asignada a las deudas excede el monto disponible de la fracción.');
  }

  const activeRows = rows.filter(row => row.sourceAmount > 0 || row.targetAmount > 0 || row.needsRate);
  if (activeRows.length === 0) {
    throw new Error('Selecciona al menos una deuda abierta para aplicar el monto.');
  }
  const missingRateRow = activeRows.find(row => row.needsRate || !(row.targetAmount > 0));
  if (missingRateRow) {
    throw new Error(`Indica la tasa negociada o el monto reconocido para "${missingRateRow.debtDescription}".`);
  }
  const exceededRow = activeRows.find(row => row.exceedsDebt);
  if (exceededRow) {
    throw new Error(`El monto aplicado excede el saldo de "${exceededRow.debtDescription}".`);
  }

  const remainderAction = panelState?.remainderAction || '';
  if (remainderSource > tolerance && !remainderAction) {
    throw new Error('Destina el remanente a una nueva deuda por cobrar o a gasto personal antes de guardar.');
  }
  if (remainderSource > tolerance && remainderAction === 'PERSONAL_EXPENSE' && !panelState?.remainderTagId) {
    throw new Error('Selecciona una categoría para el remanente clasificado como gasto personal.');
  }

  return {
    type: 'MULTI_DEBT',
    allocations: activeRows.map(row => ({
      debtId: row.debtId,
      sourceAmount: row.sourceAmount,
      targetAmount: row.targetAmount,
      appliedRate: row.appliedRate,
      rateSource: row.rateSource,
    })),
    remainder: remainderSource > tolerance
      ? {
          type: remainderAction,
          tagId: remainderAction === 'PERSONAL_EXPENSE' ? Number(panelState.remainderTagId) : null,
          description: panelState?.remainderDescription?.trim() || '',
        }
      : null,
  };
}

