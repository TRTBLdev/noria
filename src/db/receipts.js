import { allocateAmount, assertAmountsEqual, distributeLotConsumptions, getCurrencyDecimals, roundMoney } from '../utils/moneyAllocation.js';
import { convertAmountToBase } from '../utils/currency.js';
import { validateMultiDebtAllocation } from '../utils/debtAllocation.js';
import { consumeCurrencyLots, parseLotConsumption, restoreCurrencyLots, stringifyLotConsumption } from './currencyLots.js';
import {
  addApplicationInTransaction,
  APPLICATION_KINDS,
  APPLICATION_TARGETS,
  getDebtPaidAmountInTransaction,
  refreshDebtInTransaction,
} from './transactionApplications.js';
import { refreshGoalPeriodInTransaction } from './spendingGoals.js';

export const TRANSACTION_GROUP_KINDS = Object.freeze({
  RECEIPT: 'RECEIPT',
  SHARED_EXPENSE: 'SHARED_EXPENSE',
  DEBT_DISTRIBUTION: 'DEBT_DISTRIBUTION',
});

const makeReceiptId = () => `RCP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const toDate = value => value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00`);
const positiveNumber = value => Number.isFinite(Number(value)) && Number(value) > 0;

const assertPositive = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} debe ser mayor a cero.`);
  return number;
};

function normalizeParts(parts, groupKind, hasTaxBreakdown) {
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('Agrega al menos un fragmento al movimiento.');
  return parts.map((part, index) => {
    const destination = part.destination?.type === 'NONE' ? null : (part.destination || null);
    const normalized = { ...part, destination };
    const allowedDestinations = ['CREATE_RECEIVABLE', 'DEBT', 'MULTI_DEBT', 'GOAL'];
    if (destination?.type && !allowedDestinations.includes(destination.type)) {
      throw new Error(`El destino del fragmento #${index + 1} no es válido.`);
    }
    if (['DEBT', 'GOAL'].includes(destination?.type) && !destination.targetId) {
      throw new Error(`Selecciona el destino del fragmento #${index + 1}.`);
    }
    if (destination?.type === 'MULTI_DEBT') {
      if (!Array.isArray(destination.allocations) || destination.allocations.length === 0) {
        throw new Error(`Selecciona al menos una deuda en el fragmento #${index + 1}.`);
      }
      if (destination.remainder?.type === 'PERSONAL_EXPENSE' && !destination.remainder.tagId) {
        throw new Error(`Selecciona la categoría del remanente personal en el fragmento #${index + 1}.`);
      }
    }

    if (groupKind === TRANSACTION_GROUP_KINDS.RECEIPT) {
      if (hasTaxBreakdown) {
        normalized.baseAmount = assertPositive(part.baseAmount, `La base del fragmento #${index + 1}`);
        if (!['TAXABLE', 'EXEMPT'].includes(part.taxTreatment)) {
          throw new Error(`Indica si el fragmento #${index + 1} es gravado o exento.`);
        }
      } else {
        normalized.grossAmount = assertPositive(part.grossAmount ?? part.baseAmount, `El importe del fragmento #${index + 1}`);
        normalized.taxTreatment = null;
      }
    } else {
      normalized.paymentPrincipalAmount = assertPositive(
        part.paymentPrincipalAmount ?? part.amount,
        `El importe del fragmento #${index + 1}`
      );
      normalized.taxTreatment = null;
    }

    if (groupKind === TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION) {
      if (destination?.type === 'GOAL') {
        throw new Error('Un envío de deudas no puede aplicarse directamente a un objetivo.');
      }
      if (destination?.type === 'DEBT' && !positiveNumber(destination.recognizedTargetAmount)) {
        throw new Error(`Indica el monto reconocido para la deuda del fragmento #${index + 1}.`);
      }
    }

    const countsAsPersonalExpense = !destination || destination.type === 'GOAL';
    if (countsAsPersonalExpense && !part.tagId) {
      throw new Error(`Selecciona una categoría para el fragmento #${index + 1}.`);
    }
    if (part.ownerThirdPartyId && !destination?.type) {
      throw new Error(`El fragmento #${index + 1} corresponde a otra persona y necesita un destino.`);
    }
    if (destination?.type === 'CREATE_RECEIVABLE' && !part.ownerThirdPartyId) {
      throw new Error(`Selecciona la persona que asumirá el fragmento #${index + 1}.`);
    }
    return normalized;
  });
}

async function writeTransactionGroupInTransaction(database, input, { reuseReceiptId = null, preserveCreatedAt = null } = {}) {
  const groupKind = Object.values(TRANSACTION_GROUP_KINDS).includes(input.groupKind)
    ? input.groupKind
    : TRANSACTION_GROUP_KINDS.RECEIPT;
  const hasTaxBreakdown = groupKind === TRANSACTION_GROUP_KINDS.RECEIPT && input.hasTaxBreakdown !== false;
  const account = await database.accounts.get(Number(input.accountId));
  if (!account || account.isArchived) throw new Error('Selecciona una cuenta activa.');

  const currencies = await database.currencies.toArray();
  const tags = await database.tags.toArray();
  const baseCurrency = (await database.app_config.get('baseCurrency'))?.value || '';
  const lotCurrency = (await database.app_config.get('lotCurrency'))?.value || '';
  const paymentDecimals = getCurrencyDecimals(account.currency, currencies);
  const invoiceCurrency = groupKind === TRANSACTION_GROUP_KINDS.RECEIPT
    ? (input.invoiceCurrency || account.currency)
    : null;
  const invoiceDecimals = getCurrencyDecimals(invoiceCurrency || account.currency, currencies);
  const paymentAmount = roundMoney(assertPositive(input.paymentAmount, 'El monto del movimiento'), paymentDecimals);
  const feeAmount = roundMoney(Math.max(0, Number(input.feeAmount) || 0), paymentDecimals);
  const paymentTotal = roundMoney(paymentAmount + feeAmount, paymentDecimals);
  const parts = normalizeParts(input.parts, groupKind, hasTaxBreakdown);

  if (input.counterpartyThirdPartyId) {
    const counterparty = await database.third_parties.get(Number(input.counterpartyThirdPartyId));
    if (!counterparty) throw new Error('La contraparte seleccionada ya no existe.');
  }
  if (groupKind === TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION && !input.counterpartyThirdPartyId) {
    throw new Error('Selecciona la persona a la que enviaste el dinero.');
  }

  let taxableBase = null;
  let exemptBase = null;
  let taxAmount = null;
  let invoiceTotal = null;
  let invoiceGrossAmounts = parts.map(() => null);
  let taxShares = parts.map(() => null);
  let paymentShares;

  if (groupKind === TRANSACTION_GROUP_KINDS.RECEIPT) {
    if (hasTaxBreakdown) {
      taxableBase = Math.max(0, Number(input.taxableBase) || 0);
      exemptBase = Math.max(0, Number(input.exemptBase) || 0);
      taxAmount = Math.max(0, Number(input.taxAmount) || 0);
      invoiceTotal = taxableBase + exemptBase + taxAmount;
      if (invoiceTotal <= 0) throw new Error('Los totales de la factura no son válidos.');
      if (taxableBase <= 0 && taxAmount > 0) throw new Error('No puede existir IVA sin base gravada.');
      assertAmountsEqual(
        parts.filter(part => part.taxTreatment === 'TAXABLE').reduce((sum, part) => sum + part.baseAmount, 0),
        taxableBase,
        invoiceDecimals,
        'La suma de fragmentos gravados no coincide con la base gravada.'
      );
      assertAmountsEqual(
        parts.filter(part => part.taxTreatment === 'EXEMPT').reduce((sum, part) => sum + part.baseAmount, 0),
        exemptBase,
        invoiceDecimals,
        'La suma de fragmentos exentos no coincide con la base exenta.'
      );
      const taxableIndexes = parts
        .map((part, index) => part.taxTreatment === 'TAXABLE' ? index : -1)
        .filter(index => index >= 0);
      const taxableTaxShares = allocateAmount(taxAmount, taxableIndexes.map(index => parts[index].baseAmount), invoiceDecimals);
      taxShares = parts.map(() => 0);
      taxableIndexes.forEach((partIndex, index) => { taxShares[partIndex] = taxableTaxShares[index]; });
      invoiceGrossAmounts = parts.map((part, index) => part.baseAmount + taxShares[index]);
    } else {
      invoiceGrossAmounts = parts.map(part => part.grossAmount);
      invoiceTotal = positiveNumber(input.invoiceTotal)
        ? Number(input.invoiceTotal)
        : invoiceGrossAmounts.reduce((sum, amount) => sum + amount, 0);
      assertAmountsEqual(
        invoiceGrossAmounts.reduce((sum, amount) => sum + amount, 0),
        invoiceTotal,
        invoiceDecimals,
        'Los fragmentos deben sumar el total del ticket.'
      );
    }
    if (invoiceCurrency === account.currency) {
      assertAmountsEqual(invoiceTotal, paymentAmount, paymentDecimals, 'El monto pagado debe coincidir con el ticket cuando usan la misma moneda.');
    }
    paymentShares = allocateAmount(paymentAmount, invoiceGrossAmounts, paymentDecimals);
  } else {
    paymentShares = parts.map(part => part.paymentPrincipalAmount);
    assertAmountsEqual(
      paymentShares.reduce((sum, amount) => sum + amount, 0),
      paymentAmount,
      paymentDecimals,
      'Los fragmentos deben cubrir exactamente el monto del movimiento.'
    );
  }

  // Bank fee separation: when mixing personal/receivable parts with debt-payment parts, keep bank fee on personal parts so debts are never altered by bank fees.
  const isDebtPaymentPart = part => ['DEBT', 'MULTI_DEBT'].includes(part.destination?.type);
  const hasDebtPaymentPart = parts.some(isDebtPaymentPart);
  const nonDebtIndexes = parts.map((part, index) => (!isDebtPaymentPart(part) ? index : -1)).filter(index => index >= 0);
  let feeShares;
  if (feeAmount > 0 && hasDebtPaymentPart && nonDebtIndexes.length > 0) {
    const nonDebtFeeShares = allocateAmount(feeAmount, nonDebtIndexes.map(index => paymentShares[index]), paymentDecimals);
    feeShares = parts.map(() => 0);
    nonDebtIndexes.forEach((partIndex, idx) => { feeShares[partIndex] = nonDebtFeeShares[idx]; });
  } else {
    feeShares = allocateAmount(feeAmount, paymentShares, paymentDecimals);
  }

  const invoiceRate = groupKind === TRANSACTION_GROUP_KINDS.RECEIPT && paymentAmount > 0
    ? invoiceTotal / paymentAmount
    : null;
  const invoiceFeeShares = groupKind === TRANSACTION_GROUP_KINDS.RECEIPT
    ? allocateAmount(
        invoiceCurrency === account.currency ? feeAmount : feeAmount * invoiceRate,
        invoiceGrossAmounts,
        invoiceDecimals
      )
    : parts.map(() => null);
  const invoiceSettlementAmounts = groupKind === TRANSACTION_GROUP_KINDS.RECEIPT
    ? invoiceGrossAmounts.map((gross, index) => gross + invoiceFeeShares[index])
    : parts.map(() => null);

  const receiptId = reuseReceiptId || makeReceiptId();
  const date = toDate(input.date || new Date());

  // Validate MULTI_DEBT allocations and expand any PERSONAL_EXPENSE remainders before creating records
  const executionEntries = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const destination = part.destination || {};
    const principal = paymentShares[index];
    const fee = feeShares[index];

    if (destination.type === 'MULTI_DEBT') {
      const ownerId = Number(part.ownerThirdPartyId || input.counterpartyThirdPartyId);
      if (!ownerId) throw new Error(`Selecciona la persona titular de las deudas del fragmento #${index + 1}.`);
      const owner = await database.third_parties.get(ownerId);
      if (!owner) throw new Error('La persona asignada a un fragmento ya no existe.');

      const candidateDebts = await database.debts.where('thirdPartyId').equals(ownerId).toArray();
      const debtsById = new Map();
      for (const debt of candidateDebts) {
        const paid = await getDebtPaidAmountInTransaction(database, debt.id);
        debtsById.set(debt.id, { ...debt, paidAmount: paid });
      }

      const { totalSource, remainder, normalizedAllocations } = validateMultiDebtAllocation({
        availableAmount: principal,
        sourceCurrency: account.currency,
        allocations: destination.allocations,
        remainderAction: destination.remainder?.type || '',
        remainderTagId: destination.remainder?.tagId || null,
        debtsById,
        currencies,
      });

      if (remainder > 0 && destination.remainder?.type === 'PERSONAL_EXPENSE') {
        const remTagId = Number(destination.remainder.tagId);
        const remTag = tags.find(item => item.id === remTagId);
        if (!remTag) throw new Error('La categoría seleccionada para el remanente ya no existe.');

        const weights = [totalSource, remainder];
        const splitBase = hasTaxBreakdown ? allocateAmount(part.baseAmount, weights, invoiceDecimals) : [null, null];
        const splitTax = hasTaxBreakdown ? allocateAmount(taxShares[index] || 0, weights, invoiceDecimals) : [null, null];
        const splitGross = groupKind === TRANSACTION_GROUP_KINDS.RECEIPT
          ? allocateAmount(invoiceGrossAmounts[index] || 0, weights, invoiceDecimals)
          : [null, null];
        const splitSettlement = groupKind === TRANSACTION_GROUP_KINDS.RECEIPT
          ? allocateAmount(invoiceSettlementAmounts[index] || 0, weights, invoiceDecimals)
          : [null, null];

        executionEntries.push({
          part,
          ownerId,
          principal: totalSource,
          fee: 0,
          amount: totalSource,
          tagId: null,
          pillar: null,
          description: part.description?.trim() || input.description?.trim() || 'Compensación de deudas',
          invoiceBaseAmount: splitBase[0],
          invoiceTaxAmount: splitTax[0],
          invoiceGrossAmount: splitGross[0],
          invoiceSettlementAmount: splitSettlement[0],
          taxTreatment: hasTaxBreakdown ? part.taxTreatment : null,
          destinationType: 'MULTI_DEBT',
          multiDebtAllocations: normalizedAllocations,
          remainderReceivable: 0,
        });

        executionEntries.push({
          part,
          ownerId: null,
          remainderOriginThirdPartyId: ownerId,
          isRemainderExpense: true,
          principal: remainder,
          fee,
          amount: roundMoney(remainder + fee, paymentDecimals),
          tagId: remTagId,
          pillar: remTag.pillar || null,
          description: destination.remainder.description?.trim() || 'Remanente (gasto personal)',
          invoiceBaseAmount: splitBase[1],
          invoiceTaxAmount: splitTax[1],
          invoiceGrossAmount: splitGross[1],
          invoiceSettlementAmount: splitSettlement[1],
          taxTreatment: hasTaxBreakdown ? part.taxTreatment : null,
          destinationType: 'NONE',
        });
      } else {
        executionEntries.push({
          part,
          ownerId,
          principal,
          fee,
          amount: roundMoney(principal + fee, paymentDecimals),
          tagId: null,
          pillar: null,
          description: part.description?.trim() || input.description?.trim() || 'Compensación de deudas',
          invoiceBaseAmount: hasTaxBreakdown ? part.baseAmount : null,
          invoiceTaxAmount: hasTaxBreakdown ? taxShares[index] : null,
          invoiceGrossAmount: groupKind === TRANSACTION_GROUP_KINDS.RECEIPT ? invoiceGrossAmounts[index] : null,
          invoiceSettlementAmount: invoiceSettlementAmounts[index],
          taxTreatment: hasTaxBreakdown ? part.taxTreatment : null,
          destinationType: 'MULTI_DEBT',
          multiDebtAllocations: normalizedAllocations,
          remainderReceivable: remainder > 0 && destination.remainder?.type === 'CREATE_RECEIVABLE' ? remainder : 0,
          remainderReceivableDescription: destination.remainder?.description?.trim() || '',
        });
      }
    } else {
      const tag = tags.find(item => item.id === Number(part.tagId));
      const countsAsDebtPayment = destination.type === 'DEBT';
      executionEntries.push({
        part,
        ownerId: part.ownerThirdPartyId ? Number(part.ownerThirdPartyId) : null,
        principal,
        fee,
        amount: roundMoney(principal + fee, paymentDecimals),
        tagId: countsAsDebtPayment ? null : (Number(part.tagId) || null),
        pillar: countsAsDebtPayment ? null : (tag?.pillar || null),
        description: part.description?.trim() || input.description?.trim() || 'Fragmento del movimiento',
        invoiceBaseAmount: hasTaxBreakdown ? part.baseAmount : null,
        invoiceTaxAmount: hasTaxBreakdown ? taxShares[index] : null,
        invoiceGrossAmount: groupKind === TRANSACTION_GROUP_KINDS.RECEIPT ? invoiceGrossAmounts[index] : null,
        invoiceSettlementAmount: invoiceSettlementAmounts[index],
        taxTreatment: hasTaxBreakdown ? part.taxTreatment : null,
        destinationType: destination.type || 'NONE',
        destination,
      });
    }
  }

  let totalBaseAmount = convertAmountToBase(paymentTotal, account.currency, baseCurrency, [], currencies);
  let transactionBaseCurrency = totalBaseAmount === null ? null : baseCurrency;
  let lotConsumptions = [];
  if (account.currency === lotCurrency) {
    const consumed = await consumeCurrencyLots(database, {
      accountId: account.id,
      currency: lotCurrency,
      amount: paymentTotal,
    });
    totalBaseAmount = consumed.baseAmount;
    transactionBaseCurrency = consumed.baseCurrency;
    lotConsumptions = consumed.consumptions;
  }

  const entryAmounts = executionEntries.map(entry => entry.amount);
  const baseShares = totalBaseAmount === null ? executionEntries.map(() => null) : allocateAmount(totalBaseAmount, entryAmounts, 6);
  const lotsByEntry = distributeLotConsumptions(lotConsumptions, entryAmounts);

  await database.receipts.add({
    id: receiptId,
    splitGroupId: receiptId,
    groupKind,
    date,
    description: input.description?.trim() || 'Movimiento dividido',
    accountId: account.id,
    instrumentId: input.instrumentId || null,
    counterpartyThirdPartyId: input.counterpartyThirdPartyId ? Number(input.counterpartyThirdPartyId) : null,
    merchantThirdPartyId: input.counterpartyThirdPartyId ? Number(input.counterpartyThirdPartyId) : null,
    hasTaxBreakdown,
    invoiceCurrency,
    taxableBase,
    exemptBase,
    taxAmount,
    invoiceTotal,
    paymentCurrency: account.currency,
    paymentAmount,
    tipAmount: Math.max(0, Number(input.tipAmount) || 0),
    feeAmount,
    paymentTotal,
    implicitRate: invoiceRate,
    createdAt: preserveCreatedAt || new Date(),
  });

  const receivableGroups = new Map();
  for (let index = 0; index < executionEntries.length; index += 1) {
    const entry = executionEntries[index];
    if (entry.destinationType !== 'CREATE_RECEIVABLE') continue;
    const ownerId = Number(entry.ownerId);
    if (!ownerId) throw new Error('Selecciona la persona que asumirá la deuda.');
    const owner = await database.third_parties.get(ownerId);
    if (!owner) throw new Error('La persona asignada a un fragmento ya no existe.');
    if (!receivableGroups.has(ownerId)) receivableGroups.set(ownerId, []);
    receivableGroups.get(ownerId).push(index);
  }

  const generatedDebtIds = new Map();
  for (const [thirdPartyId, indexes] of receivableGroups.entries()) {
    const totalAmount = indexes.reduce((sum, index) => sum + executionEntries[index].amount, 0);
    const debtId = await database.debts.add({
      description: `${input.description?.trim() || 'Gasto compartido'} (por cobrar)`,
      thirdPartyId,
      type: 'COBRAR',
      amount: totalAmount,
      totalAmount,
      paidAmount: 0,
      currency: account.currency,
      status: 'ACTIVE',
      dueDate: null,
      receiptId,
      splitGroupId: receiptId,
      generatedFromReceipt: true,
      createdAt: date,
    });
    generatedDebtIds.set(thirdPartyId, debtId);
  }

  const savedTransactions = [];
  for (let index = 0; index < executionEntries.length; index += 1) {
    const entry = executionEntries[index];
    const destination = entry.destination || {};
    const txId = await database.transactions.add({
      date,
      type: 'OUT',
      amount: entry.amount,
      fee: entry.fee,
      currency: account.currency,
      accountId: account.id,
      instrumentId: input.instrumentId || null,
      tagId: entry.tagId,
      pillar: entry.pillar,
      description: entry.description,
      thirdPartyId: input.counterpartyThirdPartyId ? Number(input.counterpartyThirdPartyId) : null,
      beneficiaryThirdPartyId: entry.ownerId ? Number(entry.ownerId) : null,
      isRemainderExpense: entry.isRemainderExpense || false,
      remainderOriginThirdPartyId: entry.remainderOriginThirdPartyId || null,
      splitGroupId: receiptId,
      receiptId,
      groupKind,
      invoiceCurrency,
      invoiceBaseAmount: entry.invoiceBaseAmount,
      invoiceTaxAmount: entry.invoiceTaxAmount,
      invoiceGrossAmount: entry.invoiceGrossAmount,
      invoiceSettlementAmount: entry.invoiceSettlementAmount,
      taxTreatment: entry.taxTreatment,
      paymentPrincipalAmount: entry.principal,
      recognizedTargetAmount: destination.recognizedTargetAmount ?? null,
      baseAmount: baseShares[index],
      baseCurrency: baseShares[index] === null ? null : transactionBaseCurrency,
      lotConsumption: stringifyLotConsumption(lotsByEntry[index]),
      cashflowKind: 'EXPENSE',
    });
    let transaction = await database.transactions.get(txId);

    if (entry.destinationType === 'CREATE_RECEIVABLE') {
      await addApplicationInTransaction(database, {
        transaction,
        targetType: APPLICATION_TARGETS.DEBT,
        targetId: generatedDebtIds.get(Number(entry.ownerId)),
        kind: APPLICATION_KINDS.DEBT_ORIGIN,
        baseCurrency,
        currencies,
      });
    } else if (entry.destinationType === 'DEBT') {
      const debt = await database.debts.get(Number(destination.targetId));
      if (!debt) throw new Error('La deuda seleccionada ya no existe.');
      if (groupKind === TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION
        && debt.thirdPartyId !== Number(input.counterpartyThirdPartyId)) {
        throw new Error('La deuda seleccionada no corresponde con la contraparte del envío.');
      }
      if (entry.ownerId && debt.thirdPartyId !== Number(entry.ownerId)) {
        throw new Error('La deuda seleccionada no corresponde con la persona del fragmento.');
      }
      await addApplicationInTransaction(database, {
        transaction,
        targetType: APPLICATION_TARGETS.DEBT,
        targetId: Number(destination.targetId),
        kind: APPLICATION_KINDS.DEBT_PAYMENT,
        manualTargetAmount: destination.manualTargetAmount,
        targetAmountOverride: destination.recognizedTargetAmount,
        sourceAmountOverride: entry.principal,
        rateSourceOverride: groupKind === TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION ? 'RECOGNIZED_AMOUNT' : null,
        baseCurrency,
        currencies,
      });
    } else if (entry.destinationType === 'MULTI_DEBT') {
      for (const alloc of entry.multiDebtAllocations) {
        transaction = await database.transactions.get(txId);
        await addApplicationInTransaction(database, {
          transaction,
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
      if (entry.remainderReceivable > 0) {
        const remDebtId = await database.debts.add({
          description: entry.remainderReceivableDescription || `${input.description?.trim() || 'Compensación'} (por cobrar)`,
          thirdPartyId: entry.ownerId,
          type: 'COBRAR',
          amount: entry.remainderReceivable,
          totalAmount: entry.remainderReceivable,
          paidAmount: 0,
          currency: account.currency,
          status: 'ACTIVE',
          dueDate: null,
          receiptId,
          splitGroupId: receiptId,
          generatedFromReceipt: true,
          createdAt: date,
        });
        transaction = await database.transactions.get(txId);
        await addApplicationInTransaction(database, {
          transaction,
          targetType: APPLICATION_TARGETS.DEBT,
          targetId: remDebtId,
          kind: APPLICATION_KINDS.DEBT_ORIGIN,
          sourceAmountOverride: entry.remainderReceivable,
          targetAmountOverride: entry.remainderReceivable,
          rateSourceOverride: 'SAME_CURRENCY',
          appliedRate: 1,
          allocationOrder: entry.multiDebtAllocations.length + 1,
          allowMultiple: true,
          baseCurrency,
          currencies,
        });
      }
    } else if (entry.destinationType === 'GOAL') {
      await addApplicationInTransaction(database, {
        transaction,
        targetType: APPLICATION_TARGETS.SPENDING_GOAL,
        targetId: Number(destination.targetId),
        kind: APPLICATION_KINDS.GOAL_PROGRESS,
        manualTargetAmount: destination.manualTargetAmount,
        baseCurrency,
        currencies,
      });
    }

    savedTransactions.push(await database.transactions.get(txId));
  }

  await database.accounts.update(account.id, { balance: account.balance - paymentTotal });
  return { receiptId, groupKind, transactions: savedTransactions, paymentTotal };
}

export async function createTransactionGroup(database, input) {
  return database.transaction('rw', [
    database.accounts,
    database.transactions,
    database.receipts,
    database.third_parties,
    database.lots,
    database.debts,
    database.anchors,
    database.transaction_applications,
    database.spending_goals,
    database.spending_goal_periods,
    database.currencies,
    database.tags,
    database.app_config,
  ], () => writeTransactionGroupInTransaction(database, input));
}

export function createReceiptExpense(database, input) {
  return createTransactionGroup(database, {
    ...input,
    groupKind: TRANSACTION_GROUP_KINDS.RECEIPT,
    hasTaxBreakdown: input.hasTaxBreakdown !== false,
    counterpartyThirdPartyId: input.counterpartyThirdPartyId || input.merchantThirdPartyId || null,
  });
}

export async function revertReceiptGroupInTransaction(database, receiptId) {
  const receipt = await database.receipts.get(receiptId);
  const transactions = await database.transactions.where('receiptId').equals(receiptId).toArray();
  if (!receipt || transactions.length === 0) throw new Error('El grupo ya no existe.');

  const transactionIds = new Set(transactions.map(transaction => transaction.id));
  const applications = await database.transaction_applications
    .filter(item => transactionIds.has(item.transactionId))
    .toArray();

  if (applications.some(item => item.isLegacy)) {
    throw new Error('Este grupo tiene vínculos heredados que no pueden revertirse automáticamente.');
  }

  const generatedDebts = await database.debts
    .filter(debt => debt.generatedFromReceipt && (debt.receiptId === receiptId || debt.splitGroupId === receiptId))
    .toArray();
  const generatedDebtMap = new Map(generatedDebts.map(debt => [debt.id, debt]));
  for (const app of applications) {
    if (app.kind === APPLICATION_KINDS.DEBT_ORIGIN && !generatedDebtMap.has(app.targetId)) {
      const debt = await database.debts.get(app.targetId);
      if (debt?.generatedFromReceipt) generatedDebtMap.set(debt.id, debt);
    }
  }

  for (const debtId of generatedDebtMap.keys()) {
    const externalPayments = await database.transaction_applications
      .where('[targetType+targetId]').equals(['DEBT', debtId])
      .filter(item => item.kind === APPLICATION_KINDS.DEBT_PAYMENT && !transactionIds.has(item.transactionId))
      .count();
    if (externalPayments > 0) {
      throw new Error('No se puede revertir porque una deuda generada por este movimiento ya tiene cobros registrados. Reviértelos primero.');
    }
  }

  if (applications.length > 0) {
    await database.transaction_applications.bulkDelete(applications.map(item => item.id));
  }

  for (const debtId of generatedDebtMap.keys()) {
    await database.anchors.filter(anchor => anchor.debtId === debtId).delete();
    await database.debts.delete(debtId);
  }

  const affectedDebtIds = [...new Set(
    applications
      .filter(item => item.targetType === APPLICATION_TARGETS.DEBT && !generatedDebtMap.has(item.targetId))
      .map(item => item.targetId)
  )];
  for (const debtId of affectedDebtIds) {
    await refreshDebtInTransaction(database, debtId);
  }

  const affectedPeriodIds = [...new Set(applications.map(item => item.periodId).filter(Boolean))];
  for (const periodId of affectedPeriodIds) {
    await refreshGoalPeriodInTransaction(database, periodId);
  }

  const account = await database.accounts.get(receipt.accountId);
  if (!account) throw new Error('La cuenta del movimiento ya no existe.');
  for (const transaction of transactions) {
    if (parseLotConsumption(transaction.lotConsumption).length > 0) {
      await restoreCurrencyLots(database, transaction.lotConsumption);
    }
  }

  const debit = transactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
  await database.accounts.update(account.id, { balance: account.balance + debit });
  await database.transactions.bulkDelete(transactions.map(transaction => transaction.id));
  await database.receipts.delete(receiptId);

  return { receipt, transactions, applications };
}

export async function deleteReceiptGroup(database, receiptId) {
  return database.transaction('rw', [
    database.accounts,
    database.transactions,
    database.receipts,
    database.lots,
    database.debts,
    database.anchors,
    database.transaction_applications,
    database.spending_goals,
    database.spending_goal_periods,
  ], async () => {
    await revertReceiptGroupInTransaction(database, receiptId);
    return true;
  });
}

export async function updateTransactionGroup(database, receiptId, newInput) {
  return database.transaction('rw', [
    database.accounts,
    database.transactions,
    database.receipts,
    database.third_parties,
    database.lots,
    database.debts,
    database.anchors,
    database.transaction_applications,
    database.spending_goals,
    database.spending_goal_periods,
    database.currencies,
    database.tags,
    database.app_config,
  ], async () => {
    const previous = await revertReceiptGroupInTransaction(database, receiptId);
    return writeTransactionGroupInTransaction(database, newInput, {
      reuseReceiptId: receiptId,
      preserveCreatedAt: previous.receipt.createdAt,
    });
  });
}

export async function loadTransactionGroupForEdit(database, receiptId) {
  const receipt = await database.receipts.get(receiptId);
  if (!receipt) throw new Error('El movimiento dividido ya no existe.');
  const transactions = (await database.transactions.where('receiptId').equals(receiptId).toArray())
    .sort((left, right) => Number(left.id) - Number(right.id));
  const txIds = new Set(transactions.map(item => item.id));
  const applications = await database.transaction_applications
    .filter(item => txIds.has(item.transactionId))
    .toArray();

  const appsByTx = new Map();
  const virtualDebtCreditsById = {};
  for (const app of applications) {
    if (!appsByTx.has(app.transactionId)) appsByTx.set(app.transactionId, []);
    appsByTx.get(app.transactionId).push(app);
    if (app.targetType === APPLICATION_TARGETS.DEBT && app.kind === APPLICATION_KINDS.DEBT_PAYMENT) {
      virtualDebtCreditsById[app.targetId] = (virtualDebtCreditsById[app.targetId] || 0) + (Number(app.targetAmount) || 0);
    }
  }

  return {
    receipt,
    transactions,
    applications,
    appsByTx,
    virtualDebtCreditsById,
  };
}

export async function splitExistingTransaction(database, transactionId, parts) {
  const original = await database.transactions.get(transactionId);
  if (!original) throw new Error('La transacción ya no existe.');
  if (original.type !== 'OUT' || original.receiptId || original.splitGroupId || original.transferId || original.debtId
    || ['BALANCE_ADJUSTMENT', 'OPENING_BALANCE', 'LOAN_DISBURSEMENT'].includes(original.cashflowKind)) {
    throw new Error('Esta transacción no puede convertirse en split.');
  }
  const application = await database.transaction_applications.where('transactionId').equals(transactionId).first();
  if (application) throw new Error('Desvincula la transacción antes de dividirla.');
  const normalized = parts.map((part, index) => ({
    ...part,
    amount: assertPositive(part.amount, `El monto del fragmento #${index + 1}`),
  }));
  const currencies = await database.currencies.toArray();
  const decimals = getCurrencyDecimals(original.currency, currencies);
  assertAmountsEqual(normalized.reduce((sum, part) => sum + part.amount, 0), original.amount, decimals, 'Los fragmentos deben sumar el monto original.');
  const receiptId = makeReceiptId();
  const weights = normalized.map(part => part.amount);
  const feeShares = allocateAmount(Number(original.fee) || 0, weights, decimals);
  const baseShares = positiveNumber(original.baseAmount) ? allocateAmount(Number(original.baseAmount), weights, 6) : normalized.map(() => null);
  const lotsByPart = distributeLotConsumptions(parseLotConsumption(original.lotConsumption), weights);
  const paymentAmount = Math.max(0, Number(original.amount) - (Number(original.fee) || 0));

  return database.transaction('rw', [database.transactions, database.receipts], async () => {
    await database.receipts.add({
      id: receiptId,
      splitGroupId: receiptId,
      groupKind: TRANSACTION_GROUP_KINDS.SHARED_EXPENSE,
      date: original.date,
      description: original.description || 'Transacción dividida',
      accountId: original.accountId,
      instrumentId: original.instrumentId || null,
      counterpartyThirdPartyId: original.thirdPartyId || null,
      merchantThirdPartyId: original.thirdPartyId || null,
      hasTaxBreakdown: false,
      invoiceCurrency: null,
      taxableBase: null,
      exemptBase: null,
      taxAmount: null,
      invoiceTotal: null,
      paymentCurrency: original.currency,
      paymentAmount,
      feeAmount: Number(original.fee) || 0,
      paymentTotal: original.amount,
      implicitRate: null,
      createdAt: new Date(),
      convertedFromTransactionId: original.id,
    });
    const created = [];
    const { id: originalId, ...originalFields } = original;
    for (let index = 0; index < normalized.length; index += 1) {
      const part = normalized[index];
      const principal = Math.max(0, part.amount - feeShares[index]);
      const id = await database.transactions.add({
        ...originalFields,
        amount: part.amount,
        fee: feeShares[index],
        tagId: Number(part.tagId) || original.tagId,
        pillar: part.pillar || original.pillar,
        description: part.description?.trim() || original.description,
        splitGroupId: receiptId,
        receiptId,
        groupKind: TRANSACTION_GROUP_KINDS.SHARED_EXPENSE,
        invoiceCurrency: null,
        invoiceBaseAmount: null,
        invoiceTaxAmount: null,
        invoiceGrossAmount: null,
        invoiceSettlementAmount: null,
        paymentPrincipalAmount: principal,
        taxTreatment: null,
        baseAmount: baseShares[index],
        lotConsumption: stringifyLotConsumption(lotsByPart[index]),
      });
      created.push(await database.transactions.get(id));
    }
    await database.transactions.delete(original.id);
    return { receiptId, transactions: created };
  });
}
