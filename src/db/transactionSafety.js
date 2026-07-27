import {
  deleteUnconsumedCurrencyLots,
  parseLotConsumption,
  restoreCurrencyLots,
} from './currencyLots.js';
import { convertAmountToBase } from '../utils/currency.js';

export async function deleteTransactionSafely(db, transaction) {
  const lotCurrency = (await db.app_config.get('lotCurrency'))?.value || '';
  if (transaction.debtId) {
    throw new Error('Los movimientos de deuda deben revertirse desde la pestaña Deudas.');
  }
  if (transaction.splitGroupId) {
    throw new Error('Los movimientos divididos deben revertirse como un grupo completo.');
  }
  if (transaction.type === 'OPENING_BALANCE') {
    throw new Error('El saldo inicial no se elimina como una transacción normal.');
  }

  await db.transaction('rw', [db.accounts, db.transactions, db.anchors, db.lots], async () => {
    if (transaction.type === 'BALANCE_ADJUSTMENT') {
      const adjustmentAmount = Number(transaction.adjustmentAmount);
      if (!Number.isFinite(adjustmentAmount)) throw new Error('La conciliación no conserva una diferencia válida.');

      if (transaction.currency === lotCurrency) {
        if (adjustmentAmount > 0) {
          const deleted = await deleteUnconsumedCurrencyLots(db, transaction.id);
          if (deleted === 0) throw new Error(`La conciliación ${lotCurrency} no tiene un lote reversible.`);
        } else if (adjustmentAmount < 0) {
          if (parseLotConsumption(transaction.lotConsumption).length === 0) {
            throw new Error(`La conciliación ${lotCurrency} no conserva el consumo de lotes.`);
          }
          await restoreCurrencyLots(db, transaction.lotConsumption);
        }
      }

      const account = await db.accounts.get(transaction.accountId);
      if (!account) throw new Error('La cuenta de la conciliación ya no existe.');
      await db.accounts.update(transaction.accountId, { balance: account.balance - adjustmentAmount });
      await db.transactions.delete(transaction.id);
      return;
    }

    if (transaction.type === 'TRANSFER_OUT' || transaction.type === 'TRANSFER_IN') {
      const linked = await db.transactions.where('transferId').equals(transaction.transferId).toArray();
      const outLeg = linked.find(tx => tx.type === 'TRANSFER_OUT');
      const inLeg = linked.find(tx => tx.type === 'TRANSFER_IN');
      if (!outLeg || !inLeg) throw new Error('La transferencia no tiene sus dos movimientos vinculados.');
      if (/ahorro meta|ahorro asignado/i.test(`${outLeg.description} ${inLeg.description}`)) {
        throw new Error('Las transferencias asignadas a una meta deben revertirse desde Presupuesto.');
      }

      if (inLeg.currency === lotCurrency) {
        const deleted = await deleteUnconsumedCurrencyLots(db, transaction.transferId);
        if (deleted === 0) throw new Error(`La transferencia ${lotCurrency} no tiene lotes de destino reversibles.`);
      }
      if (outLeg.currency === lotCurrency) {
        if (parseLotConsumption(outLeg.lotConsumption).length === 0) {
          throw new Error(`La transferencia ${lotCurrency} no conserva su detalle de lotes.`);
        }
        await restoreCurrencyLots(db, outLeg.lotConsumption);
      }

      for (const leg of linked) {
        const account = await db.accounts.get(leg.accountId);
        if (!account) throw new Error('Una cuenta de la transferencia ya no existe.');
        const delta = leg.type === 'TRANSFER_OUT' ? leg.amount : -leg.amount;
        await db.accounts.update(leg.accountId, { balance: account.balance + delta });
      }
      await db.transactions.bulkDelete(linked.map(tx => tx.id));
      return;
    }

    if (transaction.currency === lotCurrency) {
      if (transaction.type === 'OUT') {
        if (parseLotConsumption(transaction.lotConsumption).length === 0) {
          throw new Error('La transacción no conserva el detalle necesario para restaurar sus lotes.');
        }
        await restoreCurrencyLots(db, transaction.lotConsumption);
      } else if (transaction.type === 'IN') {
        const deleted = await deleteUnconsumedCurrencyLots(db, transaction.id);
        if (deleted === 0) throw new Error(`El ingreso ${lotCurrency} no tiene un lote de origen reversible.`);
      }
    }

    const account = await db.accounts.get(transaction.accountId);
    if (!account) throw new Error('La cuenta de la transacción ya no existe.');
    const delta = transaction.type === 'OUT' ? transaction.amount : -transaction.amount;
    await db.accounts.update(transaction.accountId, { balance: account.balance + delta });

    if (transaction.anchorId) await db.anchors.update(transaction.anchorId, { status: 'PENDING' });
    await db.transactions.delete(transaction.id);
  });
}

export async function updateTransactionSafely(db, transactionId, updatedFields) {
  const lotCurrency = (await db.app_config.get('lotCurrency'))?.value || '';
  const baseCurrency = (await db.app_config.get('baseCurrency'))?.value || '';
  await db.transaction('rw', [db.accounts, db.transactions, db.currencies], async () => {
    const original = await db.transactions.get(transactionId);
    if (!original) throw new Error('La transacción ya no existe.');
    if (original.type === 'BALANCE_ADJUSTMENT' && updatedFields.amount !== original.amount) {
      throw new Error('El monto de una conciliación no se edita; reviértela y registra una nueva.');
    }
    const fieldsToSave = { ...updatedFields };

    if (updatedFields.amount !== undefined && updatedFields.amount !== original.amount) {
      if (original.currency === lotCurrency) {
        throw new Error(`Para cambiar el monto de una operación ${lotCurrency}, elimínala y regístrala nuevamente.`);
      }
      if (original.debtId || original.splitGroupId || original.type.startsWith('TRANSFER_')) {
        throw new Error('El monto de una operación vinculada no se puede editar de forma aislada.');
      }
      const account = await db.accounts.get(original.accountId);
      if (!account) throw new Error('La cuenta de la transacción ya no existe.');
      const difference = updatedFields.amount - original.amount;
      const delta = original.type === 'OUT' ? -difference : difference;
      await db.accounts.update(original.accountId, { balance: account.balance + delta });
      const currencies = await db.currencies.toArray();
      const baseAmount = convertAmountToBase(updatedFields.amount, original.currency, baseCurrency, [], currencies);
      fieldsToSave.baseAmount = baseAmount;
      fieldsToSave.baseCurrency = baseAmount === null ? null : baseCurrency;
    }

    await db.transactions.update(transactionId, fieldsToSave);
  });
}
