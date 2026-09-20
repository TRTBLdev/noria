import { refreshDebtInTransaction } from './transactionApplications.js';

/**
 * Compensate (net out) a receivable debt (COBRAR) with a payable debt (PAGAR)
 * belonging to the same third party without modifying bank or cash balances.
 */
export async function compensateDebts(db, {
  receivableDebtId,
  payableDebtId,
  receivableAmount,
  payableAmount,
  rate = 1,
  rateSource = 'SAME_CURRENCY',
  note = '',
  date = new Date(),
}) {
  const recId = Number(receivableDebtId);
  const payId = Number(payableDebtId);
  const recAmt = Number(receivableAmount);
  const payAmt = Number(payableAmount);

  if (!Number.isFinite(recAmt) || recAmt <= 0) {
    throw new Error('El monto a cobrar debe ser mayor a cero.');
  }
  if (!Number.isFinite(payAmt) || payAmt <= 0) {
    throw new Error('El monto a pagar debe ser mayor a cero.');
  }

  return db.transaction('rw', [db.debts, db.transaction_applications, db.anchors], async () => {
    const receivableDebt = await db.debts.get(recId);
    const payableDebt = await db.debts.get(payId);

    if (!receivableDebt || !payableDebt) {
      throw new Error('Una de las deudas ya no existe.');
    }
    if (receivableDebt.type !== 'COBRAR') {
      throw new Error('La deuda a cobrar debe ser de tipo COBRAR.');
    }
    if (payableDebt.type !== 'PAGAR') {
      throw new Error('La deuda a pagar debe ser de tipo PAGAR.');
    }
    if (receivableDebt.thirdPartyId !== payableDebt.thirdPartyId) {
      throw new Error('Ambas deudas deben pertenecer a la misma persona.');
    }

    const compensationGroupId = `COMP-${Date.now()}`;
    const txDate = date instanceof Date ? date : new Date(date + 'T12:00:00');

    // 1. Application for Receivable debt (COBRAR)
    const recNote = note.trim()
      ? `Compensado con deuda por pagar: ${payableDebt.description} — ${note.trim()}`
      : `Compensado con deuda por pagar: ${payableDebt.description}`;

    await db.transaction_applications.add({
      transactionId: `${compensationGroupId}-REC`,
      targetType: 'DEBT',
      targetId: recId,
      kind: 'DEBT_PAYMENT',
      sourceAmount: payAmt,
      sourceCurrency: payableDebt.currency,
      targetAmount: recAmt,
      targetCurrency: receivableDebt.currency,
      rateSource,
      note: recNote,
      compensationGroupId,
      createdAt: txDate,
    });

    // 2. Application for Payable debt (PAGAR)
    const payNote = note.trim()
      ? `Compensado con deuda por cobrar: ${receivableDebt.description} — ${note.trim()}`
      : `Compensado con deuda por cobrar: ${receivableDebt.description}`;

    await db.transaction_applications.add({
      transactionId: `${compensationGroupId}-PAY`,
      targetType: 'DEBT',
      targetId: payId,
      kind: 'DEBT_PAYMENT',
      sourceAmount: recAmt,
      sourceCurrency: receivableDebt.currency,
      targetAmount: payAmt,
      targetCurrency: payableDebt.currency,
      rateSource,
      note: payNote,
      compensationGroupId,
      createdAt: txDate,
    });

    // 3. Refresh both debts and installment anchors
    await refreshDebtInTransaction(db, recId);
    await refreshDebtInTransaction(db, payId);

    return {
      compensationGroupId,
      receivableDebtId: recId,
      payableDebtId: payId,
    };
  });
}
