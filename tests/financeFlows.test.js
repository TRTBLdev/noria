import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db.js';
import {
  createReceiptExpense,
  createTransactionGroup,
  deleteReceiptGroup,
  splitExistingTransaction,
  TRANSACTION_GROUP_KINDS,
} from '../src/db/receipts.js';
import {
  APPLICATION_KINDS,
  APPLICATION_TARGETS,
  applyExistingTransaction,
  isPersonalExpenseTransaction,
  unlinkTransactionApplication,
} from '../src/db/transactionApplications.js';
import { addSavingsContributionInTransaction, syncSavingsContributionPeriods } from '../src/db/savingsContributions.js';
import { ensureGoalPeriodsInTransaction, syncSpendingGoalPeriods } from '../src/db/spendingGoals.js';
import { exportDatabase, importDatabase } from '../src/db/backup.js';
import { allocateAmount, getReceiptAllocationBuckets, getSharedConsumptionShares } from '../src/utils/moneyAllocation.js';

async function resetDatabase() {
  await db.delete();
  await db.open();
  await db.app_config.bulkPut([
    { key: 'baseCurrency', value: 'VES' },
    { key: 'lotCurrency', value: 'USD' },
  ]);
  await db.currencies.bulkPut([
    { code: 'VES', symbol: 'Bs', decimalPlaces: 2, baseRelation: 'BASE', isActive: true },
    { code: 'USD', symbol: '$', decimalPlaces: 2, baseRelation: 'LOTS', isActive: true },
  ]);
}

beforeEach(resetDatabase);
afterAll(() => db.close());

describe('facturas y aplicaciones', () => {
  it('registra el ticket City Park usando mi parte restante y distribuye su IVA', async () => {
    const accountId = await db.accounts.add({ name: 'Tarjeta', currency: 'VES', balance: 5000, isArchived: false });
    const tagId = await db.tags.add({ name: 'Mercado', kind: 'EXPENSE', pillar: 'NEED' });
    const personId = await db.third_parties.add({ name: 'Ana' });
    const buckets = getReceiptAllocationBuckets({
      hasTaxBreakdown: true,
      taxableBase: 3503.75,
      exemptBase: 0,
      parts: [{ amount: 1652.72, taxTreatment: 'TAXABLE' }],
      decimals: 2,
    });

    const result = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.RECEIPT,
      hasTaxBreakdown: true,
      accountId,
      date: '2026-08-13',
      description: 'City Park',
      invoiceCurrency: 'VES',
      taxableBase: 3503.75,
      exemptBase: 0,
      taxAmount: 560.60,
      paymentAmount: 4064.35,
      parts: [
        { description: 'Mi parte', baseAmount: buckets[0].remaining, taxTreatment: 'TAXABLE', tagId },
        { description: 'Víveres', baseAmount: 1652.72, taxTreatment: 'TAXABLE', ownerThirdPartyId: personId, destination: { type: 'CREATE_RECEIVABLE' } },
      ],
    });

    const transactions = await db.transactions.where('receiptId').equals(result.receiptId).sortBy('id');
    const debt = await db.debts.where('thirdPartyId').equals(personId).first();
    expect(buckets[0].remaining).toBe(1851.03);
    expect(transactions.map(item => item.invoiceTaxAmount)).toEqual([296.16, 264.44]);
    expect(transactions.map(item => item.amount)).toEqual([2147.19, 1917.16]);
    expect(debt).toMatchObject({ type: 'COBRAR', totalAmount: 1917.16, currency: 'VES' });
    expect((await db.accounts.get(accountId)).balance).toBeCloseTo(935.65, 8);
  });

  it('cuadra IVA, pago USD, comision, FIFO y una deuda agrupada', async () => {
    const accountId = await db.accounts.add({ name: 'Tarjeta USD', currency: 'USD', balance: 200, isArchived: false });
    const tagId = await db.tags.add({ name: 'Compras', kind: 'EXPENSE', pillar: 'WANT' });
    const personId = await db.third_parties.add({ name: 'Ana' });
    await db.lots.add({
      accountId, currency: 'USD', amount: 200, remainingAmount: 200,
      costCurrency: 'VES', costAmount: 7200, remainingCostAmount: 7200,
      effectiveRate: 200 / 7200, status: 'ACTIVE', date: new Date('2026-07-01T12:00:00'),
    });

    const result = await createReceiptExpense(db, {
      accountId,
      date: '2026-07-10',
      description: 'Compra compartida',
      invoiceCurrency: 'VES',
      taxableBase: 1000,
      exemptBase: 2000,
      taxAmount: 600,
      paymentAmount: 100,
      feeAmount: 2,
      parts: [
        { description: 'Parte propia', baseAmount: 1000, taxTreatment: 'TAXABLE', tagId, destination: { type: 'NONE' } },
        { description: 'Parte de Ana', baseAmount: 2000, taxTreatment: 'EXEMPT', tagId, ownerThirdPartyId: personId, destination: { type: 'CREATE_RECEIVABLE' } },
      ],
    });

    const receipt = await db.receipts.get(result.receiptId);
    const transactions = await db.transactions.where('receiptId').equals(result.receiptId).sortBy('id');
    const applications = await db.transaction_applications.toArray();
    const debts = await db.debts.toArray();
    const account = await db.accounts.get(accountId);
    const lot = (await db.lots.toArray())[0];

    expect(receipt).toMatchObject({ invoiceTotal: 3600, paymentAmount: 100, feeAmount: 2, paymentTotal: 102 });
    expect(transactions.map(item => item.invoiceTaxAmount)).toEqual([600, 0]);
    expect(transactions.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(102, 8);
    expect(transactions.reduce((sum, item) => sum + item.baseAmount, 0)).toBeCloseTo(3672, 6);
    expect(account.balance).toBeCloseTo(98, 8);
    expect(lot.remainingAmount).toBeCloseTo(98, 6);
    expect(lot.remainingCostAmount).toBeCloseTo(3528, 6);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({ thirdPartyId: personId, type: 'COBRAR', currency: 'USD' });
    expect(applications).toHaveLength(1);
    expect(applications[0]).toMatchObject({ kind: 'DEBT_ORIGIN', targetId: debts[0].id, sourceCurrency: 'USD', targetCurrency: 'USD' });
    expect(isPersonalExpenseTransaction(transactions[0])).toBe(true);
    expect(isPersonalExpenseTransaction(await db.transactions.get(applications[0].transactionId))).toBe(false);

    await unlinkTransactionApplication(db, applications[0].transactionId);
    expect(await db.debts.count()).toBe(0);
    await deleteReceiptGroup(db, result.receiptId);
    expect((await db.accounts.get(accountId)).balance).toBeCloseTo(200, 8);
    expect((await db.lots.toArray())[0].remainingAmount).toBeCloseTo(200, 6);
    expect(await db.transactions.count()).toBe(0);
  });

  it('impide dos destinos y nunca deja una deuda con saldo negativo', async () => {
    const accountId = await db.accounts.add({ name: 'Caja', currency: 'VES', balance: 500, isArchived: false });
    const transactionId = await db.transactions.add({ type: 'OUT', amount: 120, currency: 'VES', accountId, date: new Date() });
    const debtId = await db.debts.add({ type: 'PAGAR', amount: 100, totalAmount: 100, paidAmount: 0, currency: 'VES', status: 'ACTIVE' });
    const goalId = await db.spending_goals.add({ name: 'Donar', targetAmount: 100, currency: 'VES', startDate: '2026-08-01', endDate: '2026-08-31', isRecurring: false, status: 'ACTIVE' });

    await expect(applyExistingTransaction(db, {
      transactionId, targetType: APPLICATION_TARGETS.DEBT, targetId: debtId,
      kind: APPLICATION_KINDS.DEBT_PAYMENT, baseCurrency: 'VES', currencies: await db.currencies.toArray(),
    })).rejects.toMatchObject({ code: 'DEBT_OVERPAYMENT', remainingAmount: 100 });
    expect((await db.debts.get(debtId)).paidAmount).toBe(0);

    const assisted = await splitExistingTransaction(db, transactionId, [
      { amount: 100, description: 'Parte exacta' },
      { amount: 20, description: 'Excedente' },
    ]);
    const appliedFragment = assisted.transactions[0];
    const excessFragment = assisted.transactions[1];
    await applyExistingTransaction(db, {
      transactionId: appliedFragment.id, targetType: APPLICATION_TARGETS.DEBT, targetId: debtId,
      kind: APPLICATION_KINDS.DEBT_PAYMENT, baseCurrency: 'VES', currencies: await db.currencies.toArray(),
    });
    await expect(applyExistingTransaction(db, {
      transactionId: appliedFragment.id, targetType: APPLICATION_TARGETS.SPENDING_GOAL, targetId: goalId,
      kind: APPLICATION_KINDS.GOAL_PROGRESS, baseCurrency: 'VES', currencies: await db.currencies.toArray(),
    })).rejects.toThrow(/ya tiene un destino/i);
    expect((await db.debts.get(debtId))).toMatchObject({ paidAmount: 100, status: 'SETTLED' });
    expect(await db.transaction_applications.where('transactionId').equals(excessFragment.id).count()).toBe(0);
  });

  it('conserva el movimiento de origen de una deuda manual', async () => {
    const accountId = await db.accounts.add({ name: 'Caja', currency: 'VES', balance: 100, isArchived: false });
    const debtId = await db.debts.add({ type: 'PAGAR', amount: 100, totalAmount: 100, paidAmount: 0, currency: 'VES', status: 'ACTIVE' });
    const transactionId = await db.transactions.add({
      type: 'IN', amount: 100, currency: 'VES', accountId, date: new Date(), cashflowKind: 'LOAN_PROCEEDS', debtId,
    });
    await applyExistingTransaction(db, {
      transactionId, targetType: APPLICATION_TARGETS.DEBT, targetId: debtId,
      kind: APPLICATION_KINDS.DEBT_ORIGIN, targetAmountOverride: 100,
      baseCurrency: 'VES', currencies: await db.currencies.toArray(),
    });
    expect(await db.transactions.get(transactionId)).toMatchObject({ cashflowKind: 'LOAN_PROCEEDS', debtId });
    await unlinkTransactionApplication(db, transactionId);
    expect(await db.transactions.get(transactionId)).toMatchObject({ cashflowKind: 'LOAN_PROCEEDS', debtId: null, applicationId: null });
  });

  it('divide retrospectivamente sin tocar saldo ni lotes', async () => {
    const accountId = await db.accounts.add({ name: 'USD', currency: 'USD', balance: 90, isArchived: false });
    const tagId = await db.tags.add({ name: 'General', kind: 'EXPENSE', pillar: 'NEED' });
    const lotId = await db.lots.add({
      accountId, currency: 'USD', amount: 100, remainingAmount: 90,
      costCurrency: 'VES', costAmount: 3600, remainingCostAmount: 3240,
      effectiveRate: 100 / 3600, status: 'ACTIVE', date: new Date(),
    });
    const transactionId = await db.transactions.add({
      type: 'OUT', amount: 10, fee: 1, currency: 'USD', accountId, tagId, date: new Date(),
      baseAmount: 360, baseCurrency: 'VES',
      lotConsumption: JSON.stringify([{ lotId, amountConsumed: 10, costConsumed: 360, costCurrency: 'VES' }]),
    });
    const beforeAccount = await db.accounts.get(accountId);
    const beforeLot = await db.lots.get(lotId);

    const result = await splitExistingTransaction(db, transactionId, [
      { amount: 4, tagId, description: 'Parte A' },
      { amount: 6, tagId, description: 'Parte B' },
    ]);
    const fragments = await db.transactions.where('receiptId').equals(result.receiptId).toArray();
    expect(fragments.reduce((sum, item) => sum + item.amount, 0)).toBe(10);
    expect(fragments.reduce((sum, item) => sum + item.baseAmount, 0)).toBeCloseTo(360, 6);
    expect(await db.accounts.get(accountId)).toEqual(beforeAccount);
    expect(await db.lots.get(lotId)).toEqual(beforeLot);
  });

  it('registra una factura sin desglose fiscal y no inventa condición de IVA', async () => {
    const accountId = await db.accounts.add({ name: 'Caja', currency: 'VES', balance: 100, isArchived: false });
    const tagId = await db.tags.add({ name: 'Mercado', kind: 'EXPENSE', pillar: 'NEED' });

    const result = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.RECEIPT,
      hasTaxBreakdown: false,
      accountId,
      date: '2026-08-01',
      description: 'Ticket simple',
      invoiceCurrency: 'VES',
      invoiceTotal: 20,
      paymentAmount: 20,
      feeAmount: 0,
      parts: [
        { description: 'Alimentos', grossAmount: 12, tagId },
        { description: 'Limpieza', grossAmount: 8, tagId },
      ],
    });

    const receipt = await db.receipts.get(result.receiptId);
    const transactions = await db.transactions.where('receiptId').equals(result.receiptId).toArray();
    expect(receipt).toMatchObject({ groupKind: 'RECEIPT', hasTaxBreakdown: false, invoiceTotal: 20 });
    expect(receipt.taxableBase).toBeNull();
    expect(receipt.exemptBase).toBeNull();
    expect(receipt.taxAmount).toBeNull();
    expect(transactions.map(item => item.taxTreatment)).toEqual([null, null]);
    expect(transactions.map(item => item.invoiceTaxAmount)).toEqual([null, null]);
    expect(transactions.reduce((sum, item) => sum + item.amount, 0)).toBe(20);
  });

  it('reparte una cuenta con propina y comisión e incluye los costos ajenos en la deuda por cobrar', async () => {
    const accountId = await db.accounts.add({ name: 'Caja', currency: 'VES', balance: 500, isArchived: false });
    const tagId = await db.tags.add({ name: 'Restaurante', kind: 'EXPENSE', pillar: 'WANT' });
    const personId = await db.third_parties.add({ name: 'Carlos' });

    const result = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.SHARED_EXPENSE,
      accountId,
      date: '2026-08-02',
      description: 'Cena',
      paymentAmount: 110,
      tipAmount: 10,
      feeAmount: 2,
      parts: [
        { description: 'Cena · Tú', paymentPrincipalAmount: 55, tagId },
        {
          description: 'Cena · Carlos',
          paymentPrincipalAmount: 55,
          ownerThirdPartyId: personId,
          destination: { type: 'CREATE_RECEIVABLE' },
        },
      ],
    });

    const receipt = await db.receipts.get(result.receiptId);
    const transactions = await db.transactions.where('receiptId').equals(result.receiptId).sortBy('id');
    const generatedDebt = await db.debts.where('thirdPartyId').equals(personId).first();
    expect(receipt).toMatchObject({ groupKind: 'SHARED_EXPENSE', tipAmount: 10, feeAmount: 2, paymentTotal: 112 });
    expect(transactions.map(item => item.amount)).toEqual([56, 56]);
    expect(transactions.map(item => item.fee)).toEqual([1, 1]);
    expect(generatedDebt).toMatchObject({ type: 'COBRAR', totalAmount: 56, currency: 'VES' });
    expect((await db.accounts.get(accountId)).balance).toBe(388);
  });

  it('calcula mi consumo restante antes de repartir propina y comisión', async () => {
    const accountId = await db.accounts.add({ name: 'Caja', currency: 'VES', balance: 500, isArchived: false });
    const tagId = await db.tags.add({ name: 'Restaurante', kind: 'EXPENSE', pillar: 'WANT' });
    const personId = await db.third_parties.add({ name: 'Carlos' });
    const consumptions = getSharedConsumptionShares({
      subtotal: 100,
      participantAmounts: ['', 40],
      splitMethod: 'MANUAL',
      decimals: 2,
    }).shares;
    const tips = allocateAmount(10, consumptions, 2);
    const principalShares = consumptions.map((amount, index) => amount + tips[index]);

    const result = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.SHARED_EXPENSE,
      accountId,
      date: '2026-08-13',
      description: 'Almuerzo',
      paymentAmount: 110,
      tipAmount: 10,
      feeAmount: 2,
      parts: [
        { description: 'Almuerzo · Tú', paymentPrincipalAmount: principalShares[0], tagId },
        { description: 'Almuerzo · Carlos', paymentPrincipalAmount: principalShares[1], ownerThirdPartyId: personId, destination: { type: 'CREATE_RECEIVABLE' } },
      ],
    });

    const transactions = await db.transactions.where('receiptId').equals(result.receiptId).sortBy('id');
    const debt = await db.debts.where('thirdPartyId').equals(personId).first();
    expect(consumptions).toEqual([60, 40]);
    expect(tips).toEqual([6, 4]);
    expect(transactions.map(item => item.amount)).toEqual([67.2, 44.8]);
    expect(debt).toMatchObject({ totalAmount: 44.8, currency: 'VES' });
  });

  it('distribuye un envío entre varias deudas usando el reconocido y conserva FIFO y comisión por separado', async () => {
    const accountId = await db.accounts.add({ name: 'Cuenta USD', currency: 'USD', balance: 100, isArchived: false });
    const personId = await db.third_parties.add({ name: 'María' });
    const debtVesId = await db.debts.add({
      thirdPartyId: personId, type: 'PAGAR', description: 'Deuda en bolívares',
      amount: 2500, totalAmount: 2500, paidAmount: 0, currency: 'VES', status: 'ACTIVE',
    });
    const debtUsdId = await db.debts.add({
      thirdPartyId: personId, type: 'PAGAR', description: 'Deuda en dólares',
      amount: 20, totalAmount: 20, paidAmount: 0, currency: 'USD', status: 'ACTIVE',
    });
    await db.lots.add({
      accountId, currency: 'USD', amount: 100, remainingAmount: 100,
      costCurrency: 'VES', costAmount: 3600, remainingCostAmount: 3600,
      effectiveRate: 100 / 3600, status: 'ACTIVE', date: new Date('2026-07-01T12:00:00'),
    });

    const result = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION,
      accountId,
      counterpartyThirdPartyId: personId,
      date: '2026-08-03',
      description: 'Pago de varias deudas',
      paymentAmount: 60,
      feeAmount: 3,
      parts: [
        {
          description: 'Abono VES', paymentPrincipalAmount: 40,
          destination: { type: 'DEBT', targetId: debtVesId, recognizedTargetAmount: 2000 },
        },
        {
          description: 'Pago USD', paymentPrincipalAmount: 20,
          destination: { type: 'DEBT', targetId: debtUsdId, recognizedTargetAmount: 20 },
        },
      ],
    });

    const transactions = await db.transactions.where('receiptId').equals(result.receiptId).sortBy('id');
    const applications = await db.transaction_applications.toArray();
    const appVes = applications.find(item => item.targetId === debtVesId);
    const appUsd = applications.find(item => item.targetId === debtUsdId);
    expect(transactions.map(item => item.amount)).toEqual([42, 21]);
    expect(transactions.map(item => item.paymentPrincipalAmount)).toEqual([40, 20]);
    expect(transactions.reduce((sum, item) => sum + item.baseAmount, 0)).toBeCloseTo(2268, 6);
    expect(appVes).toMatchObject({ sourceAmount: 40, sourceCurrency: 'USD', targetAmount: 2000, targetCurrency: 'VES', rateSource: 'RECOGNIZED_AMOUNT' });
    expect(appUsd).toMatchObject({ sourceAmount: 20, sourceCurrency: 'USD', targetAmount: 20, targetCurrency: 'USD', rateSource: 'RECOGNIZED_AMOUNT' });
    expect(await db.debts.get(debtVesId)).toMatchObject({ paidAmount: 2000, status: 'ACTIVE' });
    expect(await db.debts.get(debtUsdId)).toMatchObject({ paidAmount: 20, status: 'SETTLED' });
    expect((await db.accounts.get(accountId)).balance).toBe(37);
    expect((await db.lots.toArray())[0].remainingAmount).toBeCloseTo(37, 6);
  });

  it('bloquea un envío con excedente no clasificado sin tocar saldo ni FIFO', async () => {
    const accountId = await db.accounts.add({ name: 'Cuenta USD', currency: 'USD', balance: 100, isArchived: false });
    const personId = await db.third_parties.add({ name: 'Luis' });
    const debtId = await db.debts.add({
      thirdPartyId: personId, type: 'PAGAR', description: 'Deuda',
      amount: 50, totalAmount: 50, paidAmount: 0, currency: 'USD', status: 'ACTIVE',
    });
    await db.lots.add({
      accountId, currency: 'USD', amount: 100, remainingAmount: 100,
      costCurrency: 'VES', costAmount: 3600, remainingCostAmount: 3600,
      status: 'ACTIVE', date: new Date(),
    });

    await expect(createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION,
      accountId,
      counterpartyThirdPartyId: personId,
      paymentAmount: 60,
      feeAmount: 1,
      parts: [{
        paymentPrincipalAmount: 50,
        destination: { type: 'DEBT', targetId: debtId, recognizedTargetAmount: 50 },
      }],
    })).rejects.toThrow(/cubrir exactamente/i);

    expect((await db.accounts.get(accountId)).balance).toBe(100);
    expect((await db.lots.toArray())[0].remainingAmount).toBe(100);
    expect(await db.receipts.count()).toBe(0);
    expect(await db.transaction_applications.count()).toBe(0);
  });
});

describe('objetivos, macetas y respaldos', () => {
  it('cierra objetivo y aporte mensual como parciales sin arrastre', async () => {
    const goalId = await db.spending_goals.add({
      name: 'Donaciones', targetAmount: 100, currency: 'VES', startDate: '2026-06-01',
      isRecurring: true, frequencyInterval: 1, frequencyUnit: 'MONTHS', status: 'ACTIVE',
    });
    const goal = await db.spending_goals.get(goalId);
    await db.transaction('rw', [db.spending_goal_periods], () => ensureGoalPeriodsInTransaction(db, goal, new Date('2026-07-02T12:00:00')));
    const june = (await db.spending_goal_periods.where('goalId').equals(goalId).toArray()).find(item => item.startDate === '2026-06-01');
    const txId = await db.transactions.add({ type: 'OUT', amount: 25, currency: 'VES', accountId: 1, date: new Date('2026-06-15T12:00:00') });
    await applyExistingTransaction(db, {
      transactionId: txId, targetType: APPLICATION_TARGETS.SPENDING_GOAL, targetId: goalId,
      kind: APPLICATION_KINDS.GOAL_PROGRESS, periodId: june.id, baseCurrency: 'VES', currencies: await db.currencies.toArray(),
    });
    await syncSpendingGoalPeriods(db, new Date('2026-07-02T12:00:00'));
    const goalPeriods = await db.spending_goal_periods.where('goalId').equals(goalId).sortBy('startDate');
    expect(goalPeriods[0]).toMatchObject({ progressAmount: 25, status: 'PARTIAL' });
    expect(goalPeriods[1]).toMatchObject({ progressAmount: 0, status: 'ACTIVE' });

    const macetaId = await db.macetas.add({ name: 'Reserva', targetAmount: 1000, currentAmount: 25, currency: 'VES', status: 'ACTIVE' });
    const templateId = await db.anchors.add({ name: 'Ahorro', amount: 100, currency: 'VES', pillar: 'SAVE', isTemplate: true, frequencyInterval: 1, frequencyUnit: 'MONTHS' });
    const anchorId = await db.anchors.add({ name: 'Ahorro', amount: 100, currency: 'VES', pillar: 'SAVE', isTemplate: false, parentAnchorId: templateId, nextDueDate: '2026-06-01', status: 'PENDING' });
    await db.transaction('rw', [db.savings_contributions, db.anchors], () => addSavingsContributionInTransaction(db, {
      macetaId, anchorId, accountId: 1, amount: 25, currency: 'VES', method: 'ALLOCATION', date: new Date('2026-06-15T12:00:00'),
    }));
    await syncSavingsContributionPeriods(db, new Date('2026-07-02T12:00:00'));
    expect(await db.anchors.get(anchorId)).toMatchObject({ contributedAmount: 25, status: 'PARTIAL_EXPIRED' });
    expect(await db.macetas.get(macetaId)).toMatchObject({ currentAmount: 25, status: 'ACTIVE' });
  });

  it('exporta tablas nuevas e importa respaldos anteriores', async () => {
    const exported = await exportDatabase(db);
    expect(exported._meta.version).toBe(5);
    expect(exported).toHaveProperty('receipts');
    expect(exported).toHaveProperty('transaction_applications');
    expect(exported).toHaveProperty('spending_goals');
    expect(exported).toHaveProperty('savings_contributions');

    const oldBackup = JSON.stringify({
      accounts: [{ id: 7, name: 'Caja heredada', currency: 'VES', balance: 10 }],
      transactions: [{ id: 9, type: 'OUT', amount: 25, currency: 'VES', accountId: 7, debtId: 5, date: '2026-01-10' }],
      lots: [],
      debts: [{ id: 5, type: 'PAGAR', amount: 100, totalAmount: 100, paidAmount: 40, currency: 'VES', status: 'ACTIVE' }],
      debt_payments: [{ id: 3, debtId: 5, amountPaid: 25, currency: 'VES', date: '2026-01-10' }],
      app_config: [{ key: 'baseCurrency', value: 'VES' }],
    });
    await importDatabase(db, oldBackup);
    expect(await db.accounts.get(7)).toMatchObject({ name: 'Caja heredada', balance: 10 });
    const migratedApplications = await db.transaction_applications.toArray();
    expect(migratedApplications).toHaveLength(2);
    expect(migratedApplications.find(item => item.transactionId === 9)).toMatchObject({ targetAmount: 25, isLegacy: false });
    expect(migratedApplications.find(item => item.transactionId == null)).toMatchObject({ targetAmount: 15, isLegacy: true });
    expect(await db.transactions.get(9)).toMatchObject({ applicationId: migratedApplications.find(item => item.transactionId === 9).id });
  });

  it('permite retirar de una maceta en una transferencia y reponerla en otra', async () => {
    const accA = await db.accounts.add({ name: 'Cuenta A', currency: 'VES', balance: 500, isArchived: false });
    const accB = await db.accounts.add({ name: 'Cuenta B', currency: 'VES', balance: 100, isArchived: false });
    const macetaId = await db.macetas.add({ name: 'Fondo de Reserva', targetAmount: 1000, currentAmount: 300, currency: 'VES', status: 'ACTIVE' });
    const allocId = await db.maceta_allocations.add({ macetaId, accountId: accA, amount: 300, currency: 'VES', locked: false });

    // 1. Simular transferencia con retiro de meta
    const transferId1 = 'TX-1';
    const parsedAmount1 = 100;
    const parsedReceived1 = 100;

    await db.transaction('rw', [db.accounts, db.transactions, db.lots, db.maceta_allocations, db.macetas], async () => {
      await db.transactions.add({
        date: new Date(),
        type: 'TRANSFER_OUT',
        amount: parsedAmount1,
        currency: 'VES',
        accountId: accA,
        description: `Transferencia a Cuenta B · Retiro de meta: Fondo de Reserva`,
        transferId: transferId1,
      });
      await db.transactions.add({
        date: new Date(),
        type: 'TRANSFER_IN',
        amount: parsedReceived1,
        currency: 'VES',
        accountId: accB,
        description: `Transferencia desde Cuenta A`,
        transferId: transferId1,
      });

      // Retiro de meta
      const sourceAllocs = await db.maceta_allocations.where('macetaId').equals(macetaId).toArray();
      const currentSourceAlloc = sourceAllocs.find(a => a.accountId === accA);
      const deductAmount = Math.min(parsedAmount1, currentSourceAlloc.amount);
      const newAllocAmount = currentSourceAlloc.amount - deductAmount;
      await db.maceta_allocations.update(currentSourceAlloc.id, { amount: newAllocAmount });

      const updatedAllocs = await db.maceta_allocations.where('macetaId').equals(macetaId).toArray();
      await db.macetas.update(macetaId, { currentAmount: updatedAllocs.reduce((sum, a) => sum + a.amount, 0) });

      await db.accounts.update(accA, { balance: 500 - parsedAmount1 });
      await db.accounts.update(accB, { balance: 100 + parsedReceived1 });
    });

    expect((await db.accounts.get(accA)).balance).toBe(400);
    expect((await db.accounts.get(accB)).balance).toBe(200);
    expect((await db.maceta_allocations.get(allocId)).amount).toBe(200);
    expect((await db.macetas.get(macetaId)).currentAmount).toBe(200);

    // 2. Simular reposición de meta con transferencia de vuelta
    const transferId2 = 'TX-2';
    const parsedAmount2 = 100;
    const parsedReceived2 = 100;

    await db.transaction('rw', [db.accounts, db.transactions, db.lots, db.maceta_allocations, db.macetas], async () => {
      await db.transactions.add({
        date: new Date(),
        type: 'TRANSFER_OUT',
        amount: parsedAmount2,
        currency: 'VES',
        accountId: accB,
        description: `Transferencia a Cuenta A`,
        transferId: transferId2,
      });
      await db.transactions.add({
        date: new Date(),
        type: 'TRANSFER_IN',
        amount: parsedReceived2,
        currency: 'VES',
        accountId: accA,
        description: `Transferencia desde Cuenta B · Reposición a meta: Fondo de Reserva`,
        transferId: transferId2,
      });

      // Reposición a meta
      const targetAllocs = await db.maceta_allocations.where('macetaId').equals(macetaId).toArray();
      const currentTargetAlloc = targetAllocs.find(a => a.accountId === accA);
      await db.maceta_allocations.update(currentTargetAlloc.id, { amount: currentTargetAlloc.amount + parsedReceived2 });

      const updatedTargetAllocs = await db.maceta_allocations.where('macetaId').equals(macetaId).toArray();
      await db.macetas.update(macetaId, { currentAmount: updatedTargetAllocs.reduce((sum, a) => sum + a.amount, 0) });

      await db.accounts.update(accB, { balance: 200 - parsedAmount2 });
      await db.accounts.update(accA, { balance: 400 + parsedReceived2 });
    });

    expect((await db.accounts.get(accA)).balance).toBe(500);
    expect((await db.accounts.get(accB)).balance).toBe(100);
    expect((await db.maceta_allocations.get(allocId)).amount).toBe(300);
    expect((await db.macetas.get(macetaId)).currentAmount).toBe(300);
  });
});

