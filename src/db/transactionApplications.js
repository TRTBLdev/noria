import { convertAmountToBase, getParityUnitsPerBase } from '../utils/currency.js';
import { validateMultiDebtAllocation } from '../utils/debtAllocation.js';
import { allocateAmount, distributeLotConsumptions, getCurrencyDecimals, roundMoney } from '../utils/moneyAllocation.js';
import { consumeCurrencyLots, parseLotConsumption, stringifyLotConsumption } from './currencyLots.js';
import { findGoalPeriodForDate, refreshGoalPeriodInTransaction } from './spendingGoals.js';

export const APPLICATION_TARGETS = {
  DEBT: 'DEBT',
  SPENDING_GOAL: 'SPENDING_GOAL',
};

export const APPLICATION_KINDS = {
  DEBT_ORIGIN: 'DEBT_ORIGIN',
  DEBT_PAYMENT: 'DEBT_PAYMENT',
  GOAL_PROGRESS: 'GOAL_PROGRESS',
};

const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;

export function isPersonalExpenseTransaction(transaction) {
  return transaction?.type === 'OUT'
    && !['DEBT_PAYMENT', 'RECEIVABLE_ADVANCE', 'LOAN_DISBURSEMENT'].includes(transaction.cashflowKind);
}

export function getImplicitRate(application) {
  if (positive(application?.appliedRate)) return Number(application.appliedRate);
  const source = Number(application?.sourceAmount);
  const target = Number(application?.targetAmount);
  return positive(source) && positive(target) ? source / target : null;
}

export function resolveApplicationEquivalent({
  transaction,
  targetCurrency,
  baseCurrency,
  currencies = [],
  manualTargetAmount = null,
}) {
  if (!transaction || !positive(transaction.amount) || !transaction.currency) {
    throw new Error('La transacción no contiene un monto aplicable.');
  }
  if (!targetCurrency) throw new Error('El destino no tiene una moneda configurada.');

  const sourceAmount = Number(transaction.amount);
  const sourceCurrency = transaction.currency;
  if (sourceCurrency === targetCurrency) {
    return { sourceAmount, sourceCurrency, targetAmount: sourceAmount, targetCurrency, rateSource: 'SAME_CURRENCY' };
  }

  if (positive(manualTargetAmount)) {
    return {
      sourceAmount,
      sourceCurrency,
      targetAmount: Number(manualTargetAmount),
      targetCurrency,
      rateSource: 'MANUAL',
    };
  }

  if (transaction.invoiceCurrency === targetCurrency && positive(transaction.invoiceSettlementAmount)) {
    return {
      sourceAmount,
      sourceCurrency,
      targetAmount: Number(transaction.invoiceSettlementAmount),
      targetCurrency,
      rateSource: 'INVOICE',
    };
  }

  const storedBaseAmount = transaction.baseCurrency === baseCurrency && positive(transaction.baseAmount)
    ? Number(transaction.baseAmount)
    : null;
  const calculatedBaseAmount = storedBaseAmount ?? convertAmountToBase(
    sourceAmount,
    sourceCurrency,
    baseCurrency,
    [],
    currencies
  );

  if (targetCurrency === baseCurrency && positive(calculatedBaseAmount)) {
    return {
      sourceAmount,
      sourceCurrency,
      targetAmount: calculatedBaseAmount,
      targetCurrency,
      rateSource: transaction.lotConsumption ? 'FIFO' : 'PARITY',
    };
  }

  const targetUnitsPerBase = getParityUnitsPerBase(targetCurrency, currencies);
  if (targetUnitsPerBase && positive(calculatedBaseAmount)) {
    return {
      sourceAmount,
      sourceCurrency,
      targetAmount: calculatedBaseAmount * targetUnitsPerBase,
      targetCurrency,
      rateSource: transaction.lotConsumption ? 'FIFO_PARITY' : 'PARITY',
    };
  }

  throw new Error(`Indica el equivalente de ${sourceAmount} ${sourceCurrency} en ${targetCurrency}.`);
}

export async function getDebtPaidAmountInTransaction(database, debtId) {
  const applications = await database.transaction_applications
    .where('[targetType+targetId]').equals(['DEBT', debtId])
    .filter(application => application.kind === 'DEBT_PAYMENT')
    .toArray();
  return applications.reduce((sum, application) => sum + (Number(application.targetAmount) || 0), 0);
}

export async function refreshDebtInTransaction(database, debtId) {
  const debt = await database.debts.get(debtId);
  if (!debt) return null;
  const applications = await database.transaction_applications
    .where('[targetType+targetId]').equals(['DEBT', debtId])
    .toArray();
  const paidAmount = applications
    .filter(application => application.kind === 'DEBT_PAYMENT')
    .reduce((sum, application) => sum + (Number(application.targetAmount) || 0), 0);
  const originTotal = applications
    .filter(application => application.kind === 'DEBT_ORIGIN')
    .reduce((sum, application) => sum + (Number(application.targetAmount) || 0), 0);
  const totalAmount = debt.generatedFromReceipt ? originTotal : Number(debt.totalAmount || debt.amount || 0);
  const status = totalAmount > 0 && paidAmount >= totalAmount - 0.001
    ? 'SETTLED'
    : (debt.status === 'WRITTEN_OFF' ? 'WRITTEN_OFF' : 'ACTIVE');
  await database.debts.update(debtId, {
    amount: totalAmount,
    totalAmount,
    paidAmount,
    status,
    settledDate: status === 'SETTLED' ? (debt.settledDate || new Date()) : null,
  });

  const anchors = await database.anchors.filter(anchor => anchor.debtId === debtId).toArray();
  const ordered = anchors.sort((left, right) => (left.installmentNumber ?? 0) - (right.installmentNumber ?? 0));
  let coveredBefore = 0;
  for (const anchor of ordered) {
    const anchorAmount = Number(anchor.amount) || 0;
    const appliedAmount = Math.max(0, Math.min(anchorAmount, paidAmount - coveredBefore));
    await database.anchors.update(anchor.id, {
      appliedAmount,
      status: anchorAmount > 0 && appliedAmount >= anchorAmount - 0.001 ? 'PAID' : 'PENDING',
    });
    coveredBefore += anchorAmount;
  }
  return { ...debt, totalAmount, paidAmount, status };
}

export async function addApplicationInTransaction(database, {
  transaction,
  targetType,
  targetId,
  kind,
  manualTargetAmount = null,
  targetAmountOverride = null,
  sourceAmountOverride = null,
  rateSourceOverride = null,
  appliedRate = null,
  allocationOrder = null,
  allowMultiple = false,
  note = null,
  baseCurrency,
  currencies = [],
  periodId = null,
}) {
  if (!transaction?.id) throw new Error('La transacción debe guardarse antes de vincularla.');
  const existingApps = await database.transaction_applications.where('transactionId').equals(transaction.id).toArray();

  if (!allowMultiple && existingApps.length > 0) {
    throw new Error('Esta transacción ya tiene un destino. Divídela para usar otro.');
  }
  if (targetType === APPLICATION_TARGETS.SPENDING_GOAL && existingApps.length > 0) {
    throw new Error('Esta transacción ya tiene un destino. Divídela para usar otro.');
  }
  if (existingApps.some(item => item.targetType === APPLICATION_TARGETS.SPENDING_GOAL)) {
    throw new Error('Esta transacción ya tiene un destino. Divídela para usar otro.');
  }

  if (targetType === APPLICATION_TARGETS.DEBT) {
    const debt = await database.debts.get(targetId);
    if (!debt) throw new Error('La deuda seleccionada ya no existe.');
    if (existingApps.some(item => item.targetType === targetType && item.targetId === debt.id && item.kind === kind)) {
      throw new Error('Esta deuda ya está vinculada a la transacción.');
    }
    if (kind === APPLICATION_KINDS.DEBT_PAYMENT) {
      const compatible = (debt.type === 'PAGAR' && transaction.type === 'OUT')
        || (debt.type === 'COBRAR' && transaction.type === 'IN');
      if (!compatible) throw new Error('El sentido de la transacción no corresponde con el tipo de deuda.');
    }
    if (kind === APPLICATION_KINDS.DEBT_ORIGIN) {
      const compatibleOrigin = (debt.type === 'COBRAR' && transaction.type === 'OUT')
        || (debt.type === 'PAGAR' && transaction.type === 'IN');
      if (!compatibleOrigin) throw new Error('El sentido de la transacción no corresponde con el origen de la deuda.');
    }

    const equivalent = positive(targetAmountOverride)
      ? {
          sourceAmount: positive(sourceAmountOverride) ? Number(sourceAmountOverride) : Number(transaction.amount),
          sourceCurrency: transaction.currency,
          targetAmount: Number(targetAmountOverride),
          targetCurrency: debt.currency,
          rateSource: rateSourceOverride || 'RECOGNIZED_AMOUNT',
        }
      : resolveApplicationEquivalent({
          transaction,
          targetCurrency: debt.currency,
          baseCurrency,
          currencies,
          manualTargetAmount,
        });

    if (allowMultiple) {
      const existingSourceSum = existingApps.reduce((sum, item) => sum + (Number(item.sourceAmount) || 0), 0);
      const capacity = positive(transaction.paymentPrincipalAmount)
        ? Number(transaction.paymentPrincipalAmount)
        : Number(transaction.amount);
      if (existingSourceSum + equivalent.sourceAmount > capacity + 0.005) {
        throw new Error('La suma asignada a las deudas excede el monto disponible de la fracción.');
      }
    }

    if (kind === APPLICATION_KINDS.DEBT_PAYMENT) {
      const paid = await getDebtPaidAmountInTransaction(database, debt.id);
      const remaining = Math.max(0, Number(debt.totalAmount || debt.amount || 0) - paid);
      if (equivalent.targetAmount > remaining + 0.001) {
        const error = new Error(`El equivalente excede el saldo de la deuda por ${(equivalent.targetAmount - remaining).toFixed(2)} ${debt.currency}. Divide la transacción.`);
        error.code = 'DEBT_OVERPAYMENT';
        error.remainingAmount = remaining;
        throw error;
      }
    }

    const resolvedAppliedRate = positive(appliedRate)
      ? Number(appliedRate)
      : (equivalent.sourceCurrency === equivalent.targetCurrency
        ? 1
        : (positive(equivalent.targetAmount) ? Number((equivalent.sourceAmount / equivalent.targetAmount).toFixed(6)) : null));

    const firstPrev = existingApps[0];
    const applicationId = await database.transaction_applications.add({
      transactionId: transaction.id,
      targetType,
      targetId: debt.id,
      kind,
      ...equivalent,
      appliedRate: resolvedAppliedRate,
      allocationOrder,
      previousCashflowKind: firstPrev?.previousCashflowKind ?? (transaction.cashflowKind || null),
      previousTagId: firstPrev?.previousTagId ?? (transaction.tagId ?? null),
      previousPillar: firstPrev?.previousPillar ?? (transaction.pillar ?? null),
      note: note || null,
      createdAt: transaction.date || new Date(),
    });

    const totalCount = existingApps.length + 1;
    const hasPaymentApp = kind === APPLICATION_KINDS.DEBT_PAYMENT
      || existingApps.some(item => item.kind === APPLICATION_KINDS.DEBT_PAYMENT);

    if (hasPaymentApp) {
      await database.transactions.update(transaction.id, {
        applicationId: totalCount === 1 ? applicationId : null,
        debtId: totalCount === 1 ? debt.id : null,
        applicationCount: totalCount,
        cashflowKind: 'DEBT_PAYMENT',
        tagId: null,
        pillar: null,
      });
    } else {
      const originCashflowKind = transaction.receiptId
        ? 'RECEIVABLE_ADVANCE'
        : (transaction.cashflowKind || (debt.type === 'PAGAR' ? 'LOAN_PROCEEDS' : 'LOAN_DISBURSEMENT'));
      await database.transactions.update(transaction.id, {
        applicationId,
        debtId: debt.id,
        applicationCount: totalCount,
        cashflowKind: originCashflowKind,
      });
    }

    await refreshDebtInTransaction(database, debt.id);
    return database.transaction_applications.get(applicationId);
  }

  if (targetType === APPLICATION_TARGETS.SPENDING_GOAL) {
    if (transaction.type !== 'OUT') throw new Error('Solo los gastos pueden avanzar un objetivo de gasto.');
    const goal = await database.spending_goals.get(targetId);
    if (!goal || goal.status === 'ARCHIVED') throw new Error('El objetivo de gasto no está disponible.');
    const period = periodId
      ? await database.spending_goal_periods.get(periodId)
      : await findGoalPeriodForDate(database, goal, transaction.date);
    if (!period) throw new Error('La fecha de la transacción no pertenece a un período del objetivo.');
    const equivalent = resolveApplicationEquivalent({
      transaction,
      targetCurrency: goal.currency,
      baseCurrency,
      currencies,
      manualTargetAmount,
    });
    const applicationId = await database.transaction_applications.add({
      transactionId: transaction.id,
      targetType,
      targetId: goal.id,
      kind: APPLICATION_KINDS.GOAL_PROGRESS,
      periodId: period.id,
      ...equivalent,
      appliedRate: equivalent.sourceCurrency === equivalent.targetCurrency
        ? 1
        : (positive(equivalent.targetAmount) ? Number((equivalent.sourceAmount / equivalent.targetAmount).toFixed(6)) : null),
      previousCashflowKind: transaction.cashflowKind || null,
      previousTagId: transaction.tagId ?? null,
      previousPillar: transaction.pillar ?? null,
      note: note || null,
      createdAt: transaction.date || new Date(),
    });
    await database.transactions.update(transaction.id, { applicationId, applicationCount: 1 });
    await refreshGoalPeriodInTransaction(database, period.id);
    return database.transaction_applications.get(applicationId);
  }
  throw new Error('El tipo de destino no es compatible.');
}

export async function applyExistingTransaction(database, options) {
  const transaction = await database.transactions.get(options.transactionId);
  if (!transaction) throw new Error('La transacción ya no existe.');
  const tables = [
    database.transactions,
    database.transaction_applications,
    database.debts,
    database.anchors,
    database.spending_goals,
    database.spending_goal_periods,
  ];
  return database.transaction('rw', tables, () => addApplicationInTransaction(database, { ...options, transaction }));
}

export async function unlinkApplicationsInTransaction(database, transactionId, { applicationId = null } = {}) {
  const allApps = await database.transaction_applications.where('transactionId').equals(transactionId).toArray();
  const toRemove = applicationId != null ? allApps.filter(item => item.id === applicationId) : allApps;
  if (toRemove.length === 0) return false;
  if (toRemove.some(item => item.isLegacy)) {
    throw new Error('Este vínculo heredado no puede separarse de forma segura.');
  }

  for (const app of toRemove) {
    if (app.kind === APPLICATION_KINDS.DEBT_ORIGIN) {
      const payments = await database.transaction_applications
        .where('[targetType+targetId]').equals(['DEBT', app.targetId])
        .filter(item => item.kind === APPLICATION_KINDS.DEBT_PAYMENT)
        .count();
      if (payments > 0) {
        throw new Error('La deuda originada ya tiene pagos. Reviértelos antes de separar su origen.');
      }
    }
  }

  for (const app of toRemove) {
    await database.transaction_applications.delete(app.id);
  }

  const affectedDebtIds = [...new Set(
    toRemove.filter(item => item.targetType === APPLICATION_TARGETS.DEBT).map(item => item.targetId)
  )];
  for (const debtId of affectedDebtIds) {
    const refreshed = await refreshDebtInTransaction(database, debtId);
    if (refreshed?.generatedFromReceipt && refreshed.totalAmount <= 0.001) {
      await database.anchors.filter(anchor => anchor.debtId === debtId).delete();
      await database.debts.delete(debtId);
    }
  }

  const affectedPeriodIds = [...new Set(toRemove.map(item => item.periodId).filter(Boolean))];
  for (const periodId of affectedPeriodIds) {
    await refreshGoalPeriodInTransaction(database, periodId);
  }

  const remaining = await database.transaction_applications.where('transactionId').equals(transactionId).toArray();
  const tx = await database.transactions.get(transactionId);
  if (tx) {
    if (remaining.length === 0) {
      const first = toRemove[0];
      let restoredCashflowKind = null;
      if (first.kind === APPLICATION_KINDS.GOAL_PROGRESS) {
        restoredCashflowKind = 'EXPENSE';
      } else if (first.kind === APPLICATION_KINDS.DEBT_ORIGIN) {
        restoredCashflowKind = first.previousCashflowKind || null;
      } else {
        restoredCashflowKind = first.previousCashflowKind && first.previousCashflowKind !== 'DEBT_PAYMENT'
          ? first.previousCashflowKind
          : (tx.receiptId ? 'EXPENSE' : null);
      }
      await database.transactions.update(transactionId, {
        applicationId: null,
        debtId: null,
        applicationCount: 0,
        cashflowKind: restoredCashflowKind,
        tagId: first.previousTagId ?? tx.tagId ?? null,
        pillar: first.previousPillar ?? tx.pillar ?? null,
      });
    } else if (remaining.length === 1) {
      const sole = remaining[0];
      const hasPayment = sole.kind === APPLICATION_KINDS.DEBT_PAYMENT;
      await database.transactions.update(transactionId, {
        applicationId: sole.id,
        debtId: sole.targetType === APPLICATION_TARGETS.DEBT ? sole.targetId : null,
        applicationCount: 1,
        cashflowKind: hasPayment
          ? 'DEBT_PAYMENT'
          : (sole.kind === APPLICATION_KINDS.DEBT_ORIGIN
            ? (tx.receiptId ? 'RECEIVABLE_ADVANCE' : (sole.previousCashflowKind || 'LOAN_DISBURSEMENT'))
            : tx.cashflowKind),
      });
    } else {
      await database.transactions.update(transactionId, {
        applicationId: null,
        debtId: null,
        applicationCount: remaining.length,
        cashflowKind: 'DEBT_PAYMENT',
      });
    }
  }

  return true;
}

export async function unlinkTransactionApplication(database, transactionId, options = {}) {
  return database.transaction('rw', [
    database.transactions,
    database.transaction_applications,
    database.debts,
    database.anchors,
    database.spending_goals,
    database.spending_goal_periods,
  ], () => unlinkApplicationsInTransaction(database, transactionId, options));
}

export async function applyTransactionToMultipleDebts(database, {
  transactionId,
  thirdPartyId = null,
  allocations = [],
  remainderAction = '',
  remainderTagId = null,
  remainderDescription = '',
  baseCurrency,
  currencies = [],
}) {
  return database.transaction('rw', [
    database.accounts,
    database.transactions,
    database.receipts,
    database.debts,
    database.anchors,
    database.transaction_applications,
    database.spending_goals,
    database.spending_goal_periods,
    database.tags,
  ], async () => {
    let transaction = await database.transactions.get(transactionId);
    if (!transaction) throw new Error('La transacción ya no existe.');
    if (transaction.type !== 'OUT') throw new Error('Solo los gastos salientes pueden aplicarse a deudas por pagar.');

    const existingApps = await database.transaction_applications.where('transactionId').equals(transactionId).toArray();
    if (existingApps.length > 0) {
      await unlinkApplicationsInTransaction(database, transactionId);
      transaction = await database.transactions.get(transactionId);
    }

    const debtIds = [...new Set(allocations.map(item => Number(item.debtId)).filter(Boolean))];
    const loadedDebts = await Promise.all(debtIds.map(id => database.debts.get(id)));
    const debtsById = new Map();
    for (const debt of loadedDebts) {
      if (!debt) continue;
      const paid = await getDebtPaidAmountInTransaction(database, debt.id);
      debtsById.set(debt.id, { ...debt, paidAmount: paid });
    }

    const firstDebt = loadedDebts.find(Boolean);
    const resolvedThirdPartyId = Number(thirdPartyId || transaction.beneficiaryThirdPartyId || transaction.thirdPartyId || firstDebt?.thirdPartyId) || null;
    if (!resolvedThirdPartyId) throw new Error('Selecciona la persona titular de las deudas.');

    for (const debt of debtsById.values()) {
      if (debt.thirdPartyId !== resolvedThirdPartyId) {
        throw new Error('Todas las deudas del reparto deben pertenecer a la misma persona.');
      }
    }

    const capacity = positive(transaction.paymentPrincipalAmount)
      ? Number(transaction.paymentPrincipalAmount)
      : Number(transaction.amount);

    const { totalSource, remainder, normalizedAllocations } = validateMultiDebtAllocation({
      availableAmount: capacity,
      sourceCurrency: transaction.currency,
      allocations,
      remainderAction,
      remainderTagId,
      debtsById,
      currencies,
    });

    const decimals = getCurrencyDecimals(transaction.currency, currencies);
    let targetDebtTx = transaction;

    if (remainder > 0 && remainderAction === 'PERSONAL_EXPENSE') {
      const tag = await database.tags.get(Number(remainderTagId));
      if (!tag) throw new Error('Selecciona una categoría válida para el gasto personal.');

      const originalFee = Math.max(0, Number(transaction.fee) || 0);
      const debtAmount = roundMoney(totalSource, decimals);
      const personalAmount = roundMoney(remainder + originalFee, decimals);
      const weights = [debtAmount, personalAmount];
      const baseShares = positive(transaction.baseAmount)
        ? allocateAmount(Number(transaction.baseAmount), weights, 6)
        : [null, null];
      const lotsByPart = distributeLotConsumptions(parseLotConsumption(transaction.lotConsumption), weights);

      let receiptId = transaction.receiptId;
      if (!receiptId) {
        receiptId = `RCP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        await database.receipts.add({
          id: receiptId,
          splitGroupId: receiptId,
          groupKind: 'SHARED_EXPENSE',
          date: transaction.date,
          description: transaction.description || 'Movimiento dividido',
          accountId: transaction.accountId,
          instrumentId: transaction.instrumentId || null,
          counterpartyThirdPartyId: resolvedThirdPartyId,
          merchantThirdPartyId: resolvedThirdPartyId,
          hasTaxBreakdown: false,
          invoiceCurrency: null,
          taxableBase: null,
          exemptBase: null,
          taxAmount: null,
          invoiceTotal: null,
          paymentCurrency: transaction.currency,
          paymentAmount: capacity,
          feeAmount: originalFee,
          paymentTotal: transaction.amount,
          implicitRate: null,
          createdAt: new Date(),
          convertedFromTransactionId: transaction.id,
        });
      }

      const { id: _ignoredId, applicationId: _a, debtId: _d, applicationCount: _c, ...baseFields } = transaction;
      await database.transactions.update(transaction.id, {
        amount: debtAmount,
        fee: 0,
        paymentPrincipalAmount: totalSource,
        receiptId,
        splitGroupId: receiptId,
        groupKind: transaction.groupKind || 'SHARED_EXPENSE',
        beneficiaryThirdPartyId: resolvedThirdPartyId,
        baseAmount: baseShares[0],
        lotConsumption: stringifyLotConsumption(lotsByPart[0]),
      });

      await database.transactions.add({
        ...baseFields,
        amount: personalAmount,
        fee: originalFee,
        paymentPrincipalAmount: remainder,
        receiptId,
        splitGroupId: receiptId,
        groupKind: transaction.groupKind || 'SHARED_EXPENSE',
        tagId: Number(remainderTagId),
        pillar: tag.pillar || null,
        description: remainderDescription?.trim() || `${transaction.description || 'Movimiento'} (gasto personal)`,
        beneficiaryThirdPartyId: null,
        isRemainderExpense: true,
        remainderOriginThirdPartyId: resolvedThirdPartyId,
        cashflowKind: 'EXPENSE',
        baseAmount: baseShares[1],
        lotConsumption: stringifyLotConsumption(lotsByPart[1]),
      });

      targetDebtTx = await database.transactions.get(transaction.id);
    } else {
      await database.transactions.update(transaction.id, {
        beneficiaryThirdPartyId: resolvedThirdPartyId,
        paymentPrincipalAmount: capacity,
      });
      targetDebtTx = await database.transactions.get(transaction.id);
    }

    for (const alloc of normalizedAllocations) {
      targetDebtTx = await database.transactions.get(targetDebtTx.id);
      await addApplicationInTransaction(database, {
        transaction: targetDebtTx,
        targetType: APPLICATION_TARGETS.DEBT,
        targetId: alloc.debtId,
        kind: APPLICATION_KINDS.DEBT_PAYMENT,
        sourceAmountOverride: alloc.sourceAmount,
        targetAmountOverride: alloc.targetAmount,
        rateSourceOverride: alloc.rateSource,
        appliedRate: alloc.appliedRate,
        allocationOrder: alloc.allocationOrder,
        allowMultiple: true,
        baseCurrency,
        currencies,
      });
    }

    if (remainder > 0 && remainderAction === 'CREATE_RECEIVABLE') {
      const generatedDebtId = await database.debts.add({
        description: remainderDescription?.trim() || `${transaction.description || 'Compensación'} (por cobrar)`,
        thirdPartyId: resolvedThirdPartyId,
        type: 'COBRAR',
        amount: remainder,
        totalAmount: remainder,
        paidAmount: 0,
        currency: transaction.currency,
        status: 'ACTIVE',
        dueDate: null,
        receiptId: targetDebtTx.receiptId || null,
        splitGroupId: targetDebtTx.splitGroupId || null,
        generatedFromReceipt: true,
        createdAt: transaction.date || new Date(),
      });
      targetDebtTx = await database.transactions.get(targetDebtTx.id);
      await addApplicationInTransaction(database, {
        transaction: targetDebtTx,
        targetType: APPLICATION_TARGETS.DEBT,
        targetId: generatedDebtId,
        kind: APPLICATION_KINDS.DEBT_ORIGIN,
        sourceAmountOverride: remainder,
        targetAmountOverride: remainder,
        rateSourceOverride: 'SAME_CURRENCY',
        appliedRate: 1,
        allocationOrder: normalizedAllocations.length + 1,
        allowMultiple: true,
        baseCurrency,
        currencies,
      });
    }

    return {
      transactionId: targetDebtTx.id,
      receiptId: targetDebtTx.receiptId || null,
      totalAllocated: totalSource,
      remainder,
    };
  });
}
