import { consumeCurrencyLots, createCurrencyLot, stringifyLotConsumption } from './currencyLots.js';
import { convertAmountToBase } from '../utils/currency.js';

const EPSILON = 0.005;

export async function reconcileAccountBalance(db, {
  accountId,
  actualBalance,
  date,
  description,
  positiveLotCostAmount = null,
}) {
  if (!Number.isFinite(actualBalance)) throw new Error('El saldo real no es válido.');
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('Selecciona la fecha de conciliación.');

  const baseCurrency = (await db.app_config.get('baseCurrency'))?.value || '';
  const lotCurrency = (await db.app_config.get('lotCurrency'))?.value || '';
  const currencies = await db.currencies.toArray();

  return db.transaction('rw', [db.accounts, db.transactions, db.lots], async () => {
    const account = await db.accounts.get(accountId);
    if (!account) throw new Error('La cuenta ya no existe.');

    const adjustmentAmount = actualBalance - account.balance;
    if (Math.abs(adjustmentAmount) <= EPSILON) throw new Error('La cuenta ya está conciliada con ese saldo.');

    let baseAmount = convertAmountToBase(Math.abs(adjustmentAmount), account.currency, baseCurrency, [], currencies);
    let transactionBaseCurrency = baseAmount === null ? null : baseCurrency;
    let lotConsumption = null;

    if (account.currency === lotCurrency && adjustmentAmount < 0) {
      const consumed = await consumeCurrencyLots(db, {
        accountId: account.id,
        currency: lotCurrency,
        amount: Math.abs(adjustmentAmount),
      });
      baseAmount = consumed.baseAmount;
      transactionBaseCurrency = consumed.baseCurrency;
      lotConsumption = stringifyLotConsumption(consumed.consumptions);
    }

    if (account.currency === lotCurrency && adjustmentAmount > 0) {
      if (!Number.isFinite(positiveLotCostAmount) || positiveLotCostAmount <= 0) {
        throw new Error(`Indica el costo total de la diferencia en ${baseCurrency}.`);
      }
      baseAmount = positiveLotCostAmount;
      transactionBaseCurrency = baseCurrency;
    }

    const transactionId = await db.transactions.add({
      date,
      type: 'BALANCE_ADJUSTMENT',
      amount: Math.abs(adjustmentAmount),
      adjustmentAmount,
      balanceBefore: account.balance,
      balanceAfter: actualBalance,
      currency: account.currency,
      accountId: account.id,
      description: description?.trim() || 'Conciliación de saldo',
      cashflowKind: 'BALANCE_ADJUSTMENT',
      baseAmount,
      baseCurrency: transactionBaseCurrency,
      lotConsumption,
    });

    if (account.currency === lotCurrency && adjustmentAmount > 0) {
      await createCurrencyLot(db, {
        transactionId,
        accountId: account.id,
        currency: lotCurrency,
        amount: adjustmentAmount,
        costCurrency: baseCurrency,
        costAmount: positiveLotCostAmount,
        date,
        sourceType: 'BALANCE_ADJUSTMENT',
      });
    }

    await db.accounts.update(account.id, { balance: actualBalance });
    return transactionId;
  });
}
