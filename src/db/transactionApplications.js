import { convertAmountToBase, getParityUnitsPerBase } from '../utils/currency.js';
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

  if (positive(manualTargetAmount)) {
    return {
      sourceAmount,
      sourceCurrency,
      targetAmount: Number(manualTargetAmount),
      targetCurrency,
      rateSource: 'MANUAL',
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
  const status = totalAmount > 0 && paidAmount >= totalAmount - 0.001 ? 'SETTLED' : 'ACTIVE';
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
  note = null,
  baseCurrency,
  currencies = [],
  periodId = null,
}) {
  if (!transaction?.id) throw new Error('La transacción debe guardarse antes de vincularla.');
  const existing = await database.transaction_applications.where('transactionId').equals(transaction.id).first();
  if (existing) throw new Error('Esta transacción ya tiene un destino. Divídela para usar otro.');

  if (targetType === APPLICATION_TARGETS.DEBT) {
    const debt = await database.debts.get(targetId);
    if (!debt) throw new Error('La deuda seleccionada ya no existe.');
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

    const applicationId = await database.transaction_applications.add({
      transactionId: transaction.id,
      targetType,
      targetId: debt.id,
      kind,
      ...equivalent,
      previousCashflowKind: transaction.cashflowKind || null,
      note: note || null,
      createdAt: transaction.date || new Date(),
    });
    const originCashflowKind = transaction.receiptId
      ? 'RECEIVABLE_ADVANCE'
      : (transaction.cashflowKind || (debt.type === 'PAGAR' ? 'LOAN_PROCEEDS' : 'LOAN_DISBURSEMENT'));
    await database.transactions.update(transaction.id, {
      applicationId,
      debtId: debt.id,
      cashflowKind: kind === APPLICATION_KINDS.DEBT_ORIGIN ? originCashflowKind : 'DEBT_PAYMENT',
    });
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
      note: note || null,
      createdAt: transaction.date || new Date(),
    });
    await database.transactions.update(transaction.id, { applicationId });
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

export async function unlinkTransactionApplication(database, transactionId) {
  return database.transaction('rw', [
    database.transactions,
    database.transaction_applications,
    database.debts,
    database.anchors,
    database.spending_goals,
    database.spending_goal_periods,
  ], async () => {
    const application = await database.transaction_applications.where('transactionId').equals(transactionId).first();
    if (!application) return false;
    if (application.isLegacy) throw new Error('Este vínculo heredado no puede separarse de forma segura.');

    if (application.kind === APPLICATION_KINDS.DEBT_ORIGIN) {
      const payments = await database.transaction_applications
        .where('[targetType+targetId]').equals(['DEBT', application.targetId])
        .filter(item => item.kind === APPLICATION_KINDS.DEBT_PAYMENT)
        .count();
      if (payments > 0) throw new Error('La deuda originada ya tiene pagos. Reviértelos antes de separar su origen.');
    }

    await database.transaction_applications.delete(application.id);
    await database.transactions.update(transactionId, {
      applicationId: null,
      debtId: null,
      cashflowKind: application.kind === APPLICATION_KINDS.GOAL_PROGRESS
        ? 'EXPENSE'
        : (application.kind === APPLICATION_KINDS.DEBT_ORIGIN ? (application.previousCashflowKind || null) : null),
    });

    if (application.targetType === APPLICATION_TARGETS.DEBT) {
      const refreshed = await refreshDebtInTransaction(database, application.targetId);
      if (refreshed?.generatedFromReceipt && refreshed.totalAmount <= 0.001) {
        await database.anchors.filter(anchor => anchor.debtId === application.targetId).delete();
        await database.debts.delete(application.targetId);
      }
    } else if (application.periodId) {
      await refreshGoalPeriodInTransaction(database, application.periodId);
    }
    return true;
  });
}
