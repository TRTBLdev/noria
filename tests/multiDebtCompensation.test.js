import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db.js';
import {
  createTransactionGroup,
  deleteReceiptGroup,
  loadTransactionGroupForEdit,
  splitExistingTransaction,
  TRANSACTION_GROUP_KINDS,
  updateTransactionGroup,
} from '../src/db/receipts.js';
import {
  APPLICATION_KINDS,
  applyTransactionToMultipleDebts,
  isPersonalExpenseTransaction,
  unlinkTransactionApplication,
} from '../src/db/transactionApplications.js';
import { deleteTransactionSafely } from '../src/db/transactionSafety.js';
import { exportDatabase, importDatabase } from '../src/db/backup.js';
import {
  buildMultiDebtDestination,
  computeFifoAllocation,
  sortDebtsFifo,
  suggestFifoSelection,
  syncCrossCurrencyRow,
  validateMultiDebtAllocation,
} from '../src/utils/debtAllocation.js';

const CURRENCIES = [
  { code: 'VES', symbol: 'Bs', decimalPlaces: 2, baseRelation: 'BASE', isActive: true },
  { code: 'USD', symbol: '$', decimalPlaces: 2, baseRelation: 'LOTS', isActive: true },
];

async function resetDatabase() {
  await db.delete();
  await db.open();
  await db.app_config.bulkPut([
    { key: 'baseCurrency', value: 'VES' },
    { key: 'lotCurrency', value: 'USD' },
  ]);
  await db.currencies.bulkPut(CURRENCIES);
}

beforeEach(resetDatabase);
afterAll(() => db.close());

describe('motor puro de reparto FIFO y tasas negociables', () => {
  it('ordena FIFO y reparte 11,122.67 VES en múltiples deudas con abono parcial en la última', () => {
    const debts = [
      { id: 4, type: 'PAGAR', description: 'Deuda 4', amount: 3000, totalAmount: 3000, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-04') },
      { id: 2, type: 'PAGAR', description: 'Deuda 2', amount: 4000, totalAmount: 4000, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-02') },
      { id: 1, type: 'PAGAR', description: 'Deuda 1', amount: 2500, totalAmount: 2500, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-01') },
      { id: 3, type: 'PAGAR', description: 'Deuda 3', amount: 3200, totalAmount: 3200, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-03') },
    ];

    const sorted = sortDebtsFifo(debts);
    expect(sorted.map(d => d.id)).toEqual([1, 2, 3, 4]);

    const suggestion = suggestFifoSelection({
      availableAmount: 11122.67,
      sourceCurrency: 'VES',
      debts: sorted,
      currencies: CURRENCIES,
    });
    expect(suggestion.selectedDebtIds).toEqual([1, 2, 3, 4]);

    const allocated = computeFifoAllocation({
      availableAmount: 11122.67,
      sourceCurrency: 'VES',
      debts: sorted,
      selectedDebtIds: suggestion.selectedDebtIds,
      currencies: CURRENCIES,
    });

    expect(allocated.rows.map(r => r.sourceAmount)).toEqual([2500, 4000, 3200, 1422.67]);
    expect(allocated.rows.map(r => r.willSettle)).toEqual([true, true, true, false]);
    expect(allocated.rows[3].projectedRemaining).toBe(1577.33);
    expect(allocated.totalAllocatedSource).toBe(11122.67);
    expect(allocated.remainderSource).toBe(0);
    expect(allocated.overageSource).toBe(0);
  });

  it('sincroniza bidireccionalmente monto, tasa negociada y abono en moneda extranjera', () => {
    const byRate = syncCrossCurrencyRow({
      field: 'appliedRate',
      value: '400',
      currentRow: { sourceAmount: 4000, targetAmount: 0, appliedRate: '' },
      sourceDecimals: 2,
      targetDecimals: 2,
    });
    expect(byRate).toMatchObject({ sourceAmount: 4000, appliedRate: 400, targetAmount: 10, isManual: true });

    const byTarget = syncCrossCurrencyRow({
      field: 'targetAmount',
      value: '12.5',
      currentRow: { sourceAmount: 0, targetAmount: 0, appliedRate: 410 },
      sourceDecimals: 2,
      targetDecimals: 2,
    });
    expect(byTarget).toMatchObject({ sourceAmount: 5125, appliedRate: 410, targetAmount: 12.5, isManual: true });
  });

  it('rechaza exceso de asignación y remanente sin destino', () => {
    const debtsById = new Map([
      [1, { id: 1, type: 'PAGAR', description: 'Deuda 1', totalAmount: 5000, paidAmount: 0, currency: 'VES' }],
    ]);

    expect(() => validateMultiDebtAllocation({
      availableAmount: 4000,
      sourceCurrency: 'VES',
      allocations: [{ debtId: 1, sourceAmount: 4500, targetAmount: 4500 }],
      debtsById,
      currencies: CURRENCIES,
    })).toThrow(/excede el monto disponible/i);

    expect(() => validateMultiDebtAllocation({
      availableAmount: 11122.67,
      sourceCurrency: 'VES',
      allocations: [{ debtId: 1, sourceAmount: 5000, targetAmount: 5000 }],
      remainderAction: '',
      debtsById,
      currencies: CURRENCIES,
    })).toThrow(/remanente/i);
  });
});

describe('compensación multi-deuda 1-a-N (CA-1 a CA-7)', () => {
  it('caso real exacto: Pago Móvil 82,000 VES = 70,877.33 propio + 11,122.67 FIFO a múltiples deudas de Mamá', async () => {
    const accountId = await db.accounts.add({ name: 'Banco Pago Móvil', currency: 'VES', balance: 100000, isArchived: false });
    const plumbingTagId = await db.tags.add({ name: 'Mantenimiento', kind: 'EXPENSE', pillar: 'NEED' });
    const momId = await db.third_parties.add({ name: 'Mamá' });

    const d1 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'Farmacia', amount: 2500, totalAmount: 2500, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-01T12:00:00') });
    const d2 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'Mercado', amount: 4000, totalAmount: 4000, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-02T12:00:00') });
    const d3 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'Panadería', amount: 3200, totalAmount: 3200, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-03T12:00:00') });
    const d4 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'Taxi', amount: 3000, totalAmount: 3000, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-04T12:00:00') });

    const openDebts = await db.debts.where('thirdPartyId').equals(momId).toArray();
    const suggestion = suggestFifoSelection({ availableAmount: 11122.67, sourceCurrency: 'VES', debts: openDebts, currencies: CURRENCIES });
    const destination = buildMultiDebtDestination({
      panelState: { ...suggestion, remainderAction: '', remainderTagId: '', remainderDescription: '' },
      availableAmount: 11122.67,
      sourceCurrency: 'VES',
      openDebts,
      currencies: CURRENCIES,
    });

    const result = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.RECEIPT,
      hasTaxBreakdown: false,
      accountId,
      date: '2026-11-24',
      description: 'Plomería baños',
      invoiceCurrency: 'VES',
      invoiceTotal: 82000,
      paymentAmount: 82000,
      feeAmount: 0,
      parts: [
        { description: 'Plomería apartamento propio', grossAmount: 70877.33, tagId: plumbingTagId, destination: null },
        { description: 'Plomería Mamá (compensación)', grossAmount: 11122.67, ownerThirdPartyId: momId, destination },
      ],
    });

    // 1 solo movimiento bancario por -82,000 VES (CA-5)
    expect(await db.receipts.count()).toBe(1);
    expect((await db.accounts.get(accountId)).balance).toBeCloseTo(18000, 2);

    // Gastos personales suman exactamente 70,877.33 VES sin doble conteo (CA-5)
    const txs = await db.transactions.where('receiptId').equals(result.receiptId).sortBy('id');
    expect(txs).toHaveLength(2);
    const personalSum = txs.filter(isPersonalExpenseTransaction).reduce((sum, tx) => sum + tx.amount, 0);
    expect(personalSum).toBeCloseTo(70877.33, 2);
    expect(txs[1].tagId).toBeNull();
    expect(txs[1].pillar).toBeNull();

    // Relación 1-a-N real en transaction_applications apuntando al mismo fragmento (CA-1)
    const apps = await db.transaction_applications.where('transactionId').equals(txs[1].id).toArray();
    expect(apps).toHaveLength(4);
    expect(apps.map(a => a.targetAmount)).toEqual([2500, 4000, 3200, 1422.67]);

    // Saldos y estados actualizados por deuda (CA-5, CA-6)
    expect(await db.debts.get(d1)).toMatchObject({ paidAmount: 2500, status: 'SETTLED' });
    expect(await db.debts.get(d2)).toMatchObject({ paidAmount: 4000, status: 'SETTLED' });
    expect(await db.debts.get(d3)).toMatchObject({ paidAmount: 3200, status: 'SETTLED' });
    expect(await db.debts.get(d4)).toMatchObject({ paidAmount: 1422.67, status: 'ACTIVE' });
  });

  it('soporta tasa negociable por deuda USD junto con deudas VES nominales (CA-4)', async () => {
    const accountId = await db.accounts.add({ name: 'Banco VES', currency: 'VES', balance: 50000, isArchived: false });
    const tagId = await db.tags.add({ name: 'Hogar', kind: 'EXPENSE', pillar: 'NEED' });
    const momId = await db.third_parties.add({ name: 'Mamá' });

    const debtVesId = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'Bolívares 1:1', amount: 2000, totalAmount: 2000, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-01') });
    const debtUsd1Id = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'Dólares acuerdo 400', amount: 10, totalAmount: 10, paidAmount: 0, currency: 'USD', status: 'ACTIVE', createdAt: new Date('2026-11-02') });
    const debtUsd2Id = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'Dólares acuerdo 409.81', amount: 20, totalAmount: 20, paidAmount: 0, currency: 'USD', status: 'ACTIVE', createdAt: new Date('2026-11-03') });

    const openDebts = await db.debts.where('thirdPartyId').equals(momId).toArray();
    const destination = buildMultiDebtDestination({
      panelState: {
        selectedDebtIds: [debtVesId, debtUsd1Id, debtUsd2Id],
        manualRows: {
          [debtUsd1Id]: { sourceAmount: 4000, targetAmount: 10, appliedRate: 400, isManual: true },
          [debtUsd2Id]: { sourceAmount: 5122.67, targetAmount: 12.5, appliedRate: 409.8136, isManual: true },
        },
        remainderAction: '',
      },
      availableAmount: 11122.67,
      sourceCurrency: 'VES',
      openDebts,
      currencies: CURRENCIES,
    });

    const result = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.RECEIPT,
      hasTaxBreakdown: false,
      accountId,
      date: '2026-11-24',
      description: 'Plomería mixta',
      invoiceCurrency: 'VES',
      invoiceTotal: 82000,
      paymentAmount: 82000,
      parts: [
        { description: 'Propio', grossAmount: 70877.33, tagId },
        { description: 'Mamá', grossAmount: 11122.67, ownerThirdPartyId: momId, destination },
      ],
    });

    const txs = await db.transactions.where('receiptId').equals(result.receiptId).sortBy('id');
    const apps = await db.transaction_applications.where('transactionId').equals(txs[1].id).toArray();
    expect(apps.find(a => a.targetId === debtVesId)).toMatchObject({ sourceAmount: 2000, targetAmount: 2000, appliedRate: 1, rateSource: 'SAME_CURRENCY' });
    expect(apps.find(a => a.targetId === debtUsd1Id)).toMatchObject({ sourceAmount: 4000, targetAmount: 10, appliedRate: 400, rateSource: 'NEGOTIATED_RATE' });
    expect(apps.find(a => a.targetId === debtUsd2Id)).toMatchObject({ sourceAmount: 5122.67, targetAmount: 12.5, appliedRate: 409.8136, rateSource: 'NEGOTIATED_RATE' });
    expect(await db.debts.get(debtVesId)).toMatchObject({ paidAmount: 2000, status: 'SETTLED' });
    expect(await db.debts.get(debtUsd1Id)).toMatchObject({ paidAmount: 10, status: 'SETTLED' });
    expect(await db.debts.get(debtUsd2Id)).toMatchObject({ paidAmount: 12.5, status: 'ACTIVE' });
  });

  it('separa la comisión bancaria hacia la parte personal y nunca reduce las deudas', async () => {
    const accountId = await db.accounts.add({ name: 'Banco VES', currency: 'VES', balance: 100000, isArchived: false });
    const tagId = await db.tags.add({ name: 'Mantenimiento', kind: 'EXPENSE', pillar: 'NEED' });
    const momId = await db.third_parties.add({ name: 'Mamá' });
    const d1 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'Deuda', amount: 11122.67, totalAmount: 11122.67, paidAmount: 0, currency: 'VES', status: 'ACTIVE' });

    const result = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.RECEIPT,
      hasTaxBreakdown: false,
      accountId,
      date: '2026-11-24',
      description: 'Pago Móvil con comisión',
      invoiceCurrency: 'VES',
      invoiceTotal: 82000,
      paymentAmount: 82000,
      feeAmount: 246,
      parts: [
        { description: 'Propio', grossAmount: 70877.33, tagId },
        {
          description: 'Mamá',
          grossAmount: 11122.67,
          ownerThirdPartyId: momId,
          destination: {
            type: 'MULTI_DEBT',
            allocations: [{ debtId: d1, sourceAmount: 11122.67, targetAmount: 11122.67, appliedRate: 1, rateSource: 'SAME_CURRENCY' }],
          },
        },
      ],
    });

    const txs = await db.transactions.where('receiptId').equals(result.receiptId).sortBy('id');
    expect((await db.accounts.get(accountId)).balance).toBeCloseTo(100000 - 82246, 2);
    expect(txs[0]).toMatchObject({ amount: 71123.33, fee: 246 });
    expect(txs[1]).toMatchObject({ amount: 11122.67, fee: 0 });
    expect(txs.filter(isPersonalExpenseTransaction).reduce((s, t) => s + t.amount, 0)).toBeCloseTo(71123.33, 2);
    expect(await db.debts.get(d1)).toMatchObject({ paidAmount: 11122.67, status: 'SETTLED' });
  });

  it('maneja remanente como nueva deuda a favor y como gasto personal (CA-3)', async () => {
    const accountId = await db.accounts.add({ name: 'Banco VES', currency: 'VES', balance: 50000, isArchived: false });
    const ownTagId = await db.tags.add({ name: 'Hogar', kind: 'EXPENSE', pillar: 'NEED' });
    const giftTagId = await db.tags.add({ name: 'Regalos', kind: 'EXPENSE', pillar: 'WANT' });
    const momId = await db.third_parties.add({ name: 'Mamá' });

    const d1 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'Deuda 5k', amount: 5000, totalAmount: 5000, paidAmount: 0, currency: 'VES', status: 'ACTIVE' });

    // Caso A: Remanente -> Nueva deuda a favor (COBRAR)
    const resReceivable = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION,
      accountId,
      counterpartyThirdPartyId: momId,
      date: '2026-11-24',
      description: 'Envío con saldo a favor',
      paymentAmount: 7000,
      parts: [{
        paymentPrincipalAmount: 7000,
        ownerThirdPartyId: momId,
        destination: {
          type: 'MULTI_DEBT',
          allocations: [{ debtId: d1, sourceAmount: 5000, targetAmount: 5000, appliedRate: 1, rateSource: 'SAME_CURRENCY' }],
          remainder: { type: 'CREATE_RECEIVABLE', description: 'Saldo a favor Mamá' },
        },
      }],
    });

    const cobrarDebts = await db.debts.where('type').equals('COBRAR').toArray();
    expect(cobrarDebts).toHaveLength(1);
    expect(cobrarDebts[0]).toMatchObject({ totalAmount: 2000, paidAmount: 0, generatedFromReceipt: true, receiptId: resReceivable.receiptId });
    const recTxs = await db.transactions.where('receiptId').equals(resReceivable.receiptId).toArray();
    expect(recTxs.filter(isPersonalExpenseTransaction)).toHaveLength(0);

    // Revertir Caso A para probar Caso B con el mismo d1
    await deleteReceiptGroup(db, resReceivable.receiptId);
    expect(await db.debts.where('type').equals('COBRAR').count()).toBe(0);
    expect(await db.debts.get(d1)).toMatchObject({ paidAmount: 0, status: 'ACTIVE' });

    // Caso B: Remanente -> Gasto personal
    const resPersonal = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.RECEIPT,
      hasTaxBreakdown: false,
      accountId,
      date: '2026-11-24',
      description: 'Compra + deuda + regalo',
      invoiceCurrency: 'VES',
      invoiceTotal: 15000,
      paymentAmount: 15000,
      parts: [
        { description: 'Propio', grossAmount: 8000, tagId: ownTagId },
        {
          description: 'Mamá',
          grossAmount: 7000,
          ownerThirdPartyId: momId,
          destination: {
            type: 'MULTI_DEBT',
            allocations: [{ debtId: d1, sourceAmount: 5000, targetAmount: 5000, appliedRate: 1, rateSource: 'SAME_CURRENCY' }],
            remainder: { type: 'PERSONAL_EXPENSE', tagId: giftTagId, description: 'Regalo Mamá' },
          },
        },
      ],
    });

    const persTxs = await db.transactions.where('receiptId').equals(resPersonal.receiptId).sortBy('id');
    expect(persTxs).toHaveLength(3);
    expect(persTxs.filter(isPersonalExpenseTransaction).reduce((s, t) => s + t.amount, 0)).toBeCloseTo(10000, 2);
    expect(persTxs[2]).toMatchObject({ amount: 2000, tagId: giftTagId, pillar: 'WANT', isRemainderExpense: true });
  });

  it('edita y elimina atómicamente el movimiento completo reabriendo deudas y limpiando remanentes (CA-7)', async () => {
    const accountId = await db.accounts.add({ name: 'Banco Pago Móvil', currency: 'VES', balance: 100000, isArchived: false });
    const tagId = await db.tags.add({ name: 'Plomería', kind: 'EXPENSE', pillar: 'NEED' });
    const momId = await db.third_parties.add({ name: 'Mamá' });

    const d1 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'D1', amount: 3000, totalAmount: 3000, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-01') });
    const d2 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'D2', amount: 4000, totalAmount: 4000, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-02') });
    const d3 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'D3', amount: 5000, totalAmount: 5000, paidAmount: 0, currency: 'VES', status: 'ACTIVE', createdAt: new Date('2026-11-03') });

    const created = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.RECEIPT,
      hasTaxBreakdown: false,
      accountId,
      date: '2026-11-24',
      description: 'Plomería v1',
      invoiceCurrency: 'VES',
      invoiceTotal: 82000,
      paymentAmount: 82000,
      parts: [
        { description: 'Propio', grossAmount: 70877.33, tagId },
        {
          description: 'Mamá',
          grossAmount: 11122.67,
          ownerThirdPartyId: momId,
          destination: {
            type: 'MULTI_DEBT',
            allocations: [
              { debtId: d1, sourceAmount: 3000, targetAmount: 3000 },
              { debtId: d2, sourceAmount: 4000, targetAmount: 4000 },
            ],
            remainder: { type: 'CREATE_RECEIVABLE', description: 'Excedente v1' },
          },
        },
      ],
    });

    const loadedForEdit = await loadTransactionGroupForEdit(db, created.receiptId);
    expect(loadedForEdit.virtualDebtCreditsById).toEqual({ [d1]: 3000, [d2]: 4000 });
    expect(await db.debts.where('type').equals('COBRAR').count()).toBe(1);

    // Edición atómica: quita d2, aplica a d1 + d3 y elimina remanente
    await updateTransactionGroup(db, created.receiptId, {
      groupKind: TRANSACTION_GROUP_KINDS.RECEIPT,
      hasTaxBreakdown: false,
      accountId,
      date: '2026-11-24',
      description: 'Plomería v2',
      invoiceCurrency: 'VES',
      invoiceTotal: 80000,
      paymentAmount: 80000,
      parts: [
        { description: 'Propio', grossAmount: 72000, tagId },
        {
          description: 'Mamá',
          grossAmount: 8000,
          ownerThirdPartyId: momId,
          destination: {
            type: 'MULTI_DEBT',
            allocations: [
              { debtId: d1, sourceAmount: 3000, targetAmount: 3000 },
              { debtId: d3, sourceAmount: 5000, targetAmount: 5000 },
            ],
          },
        },
      ],
    });

    expect((await db.accounts.get(accountId)).balance).toBeCloseTo(20000, 2);
    expect(await db.debts.where('type').equals('COBRAR').count()).toBe(0);
    expect(await db.debts.get(d1)).toMatchObject({ paidAmount: 3000, status: 'SETTLED' });
    expect(await db.debts.get(d2)).toMatchObject({ paidAmount: 0, status: 'ACTIVE' });
    expect(await db.debts.get(d3)).toMatchObject({ paidAmount: 5000, status: 'SETTLED' });

    // Si una edición falla en validación, Dexie debe hacer rollback sin alterar nada
    await expect(updateTransactionGroup(db, created.receiptId, {
      groupKind: TRANSACTION_GROUP_KINDS.RECEIPT,
      hasTaxBreakdown: false,
      accountId,
      date: '2026-11-24',
      description: 'Plomería inválida',
      invoiceCurrency: 'VES',
      invoiceTotal: 80000,
      paymentAmount: 80000,
      parts: [
        { description: 'Propio', grossAmount: 72000, tagId },
        {
          description: 'Mamá',
          grossAmount: 8000,
          ownerThirdPartyId: momId,
          destination: {
            type: 'MULTI_DEBT',
            allocations: [{ debtId: d3, sourceAmount: 6000, targetAmount: 6000 }], // > 5000
          },
        },
      ],
    })).rejects.toThrow(/excede el saldo/i);

    expect(await db.debts.get(d1)).toMatchObject({ paidAmount: 3000, status: 'SETTLED' });
    expect(await db.debts.get(d3)).toMatchObject({ paidAmount: 5000, status: 'SETTLED' });

    // Borrado atómico en 1 paso (CA-7)
    await deleteReceiptGroup(db, created.receiptId);
    expect((await db.accounts.get(accountId)).balance).toBeCloseTo(100000, 2);
    expect(await db.debts.get(d1)).toMatchObject({ paidAmount: 0, status: 'ACTIVE' });
    expect(await db.debts.get(d2)).toMatchObject({ paidAmount: 0, status: 'ACTIVE' });
    expect(await db.debts.get(d3)).toMatchObject({ paidAmount: 0, status: 'ACTIVE' });
    expect(await db.receipts.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.transaction_applications.count()).toBe(0);
  });

  it('divide un gasto existente de 82,000, vincula 11,122.67 a múltiples deudas, desvincula 1 deuda puntual y preserva respaldo', async () => {
    const accountId = await db.accounts.add({ name: 'Banco Pago Móvil', currency: 'VES', balance: 18000, isArchived: false });
    const tagId = await db.tags.add({ name: 'Mantenimiento', kind: 'EXPENSE', pillar: 'NEED' });
    const momId = await db.third_parties.add({ name: 'Mamá' });

    const d1 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'D1', amount: 5000, totalAmount: 5000, paidAmount: 0, currency: 'VES', status: 'ACTIVE' });
    const d2 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'D2', amount: 4000, totalAmount: 4000, paidAmount: 0, currency: 'VES', status: 'ACTIVE' });
    const d3 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'D3', amount: 3000, totalAmount: 3000, paidAmount: 0, currency: 'VES', status: 'ACTIVE' });

    const originalTxId = await db.transactions.add({
      date: new Date('2026-11-24T12:00:00'),
      type: 'OUT',
      amount: 82000,
      currency: 'VES',
      accountId,
      tagId,
      pillar: 'NEED',
      description: 'Pago Móvil Plomero',
    });

    const split = await splitExistingTransaction(db, originalTxId, [
      { amount: 70877.33, tagId, pillar: 'NEED', description: 'Plomería propia' },
      { amount: 11122.67, tagId, pillar: 'NEED', description: 'Plomería Mamá' },
    ]);

    const momFrag = split.transactions[1];
    await applyTransactionToMultipleDebts(db, {
      transactionId: momFrag.id,
      thirdPartyId: momId,
      allocations: [
        { debtId: d1, sourceAmount: 5000, targetAmount: 5000 },
        { debtId: d2, sourceAmount: 4000, targetAmount: 4000 },
        { debtId: d3, sourceAmount: 2122.67, targetAmount: 2122.67 },
      ],
      baseCurrency: 'VES',
      currencies: CURRENCIES,
    });

    const updatedMomFrag = await db.transactions.get(momFrag.id);
    expect(isPersonalExpenseTransaction(updatedMomFrag)).toBe(false);
    expect(updatedMomFrag.pillar).toBeNull();
    expect(updatedMomFrag.tagId).toBeNull();
    expect(updatedMomFrag.applicationCount).toBe(3);

    // Exportar y reimportar con 1-a-N preserva todas las aplicaciones
    const exported = JSON.stringify(await exportDatabase(db));
    await resetDatabase();
    await importDatabase(db, exported);
    expect(await db.transaction_applications.count()).toBe(3);

    // Desvincular solo la deuda d2 (simula botón Desvincular en DebtsScreen)
    const d2App = await db.transaction_applications.where('[targetType+targetId]').equals(['DEBT', d2]).first();
    await unlinkTransactionApplication(db, momFrag.id, { applicationId: d2App.id });
    expect(await db.debts.get(d1)).toMatchObject({ paidAmount: 5000, status: 'SETTLED' });
    expect(await db.debts.get(d2)).toMatchObject({ paidAmount: 0, status: 'ACTIVE' });
    expect(await db.debts.get(d3)).toMatchObject({ paidAmount: 2122.67, status: 'ACTIVE' });

    // Eliminar una transacción simple vinculada revierte atómicamente sus aplicaciones
    const simpleAccountId = await db.accounts.add({ name: 'Caja', currency: 'VES', balance: 5000, isArchived: false });
    const simpleTxId = await db.transactions.add({ type: 'OUT', amount: 1000, currency: 'VES', accountId: simpleAccountId, date: new Date() });
    await applyTransactionToMultipleDebts(db, {
      transactionId: simpleTxId,
      thirdPartyId: momId,
      allocations: [{ debtId: d2, sourceAmount: 1000, targetAmount: 1000 }],
      baseCurrency: 'VES',
      currencies: CURRENCIES,
    });
    expect(await db.debts.get(d2)).toMatchObject({ paidAmount: 1000 });
    await deleteTransactionSafely(db, await db.transactions.get(simpleTxId));
    expect((await db.accounts.get(simpleAccountId)).balance).toBe(6000);
    expect(await db.debts.get(d2)).toMatchObject({ paidAmount: 0, status: 'ACTIVE' });
  });

  it('bloquea borrar si una deuda por cobrar de remanente ya recibió cobros posteriores', async () => {
    const accountId = await db.accounts.add({ name: 'Banco VES', currency: 'VES', balance: 50000, isArchived: false });
    const momId = await db.third_parties.add({ name: 'Mamá' });
    const d1 = await db.debts.add({ thirdPartyId: momId, type: 'PAGAR', description: 'D1', amount: 3000, totalAmount: 3000, paidAmount: 0, currency: 'VES', status: 'ACTIVE' });

    const created = await createTransactionGroup(db, {
      groupKind: TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION,
      accountId,
      counterpartyThirdPartyId: momId,
      date: '2026-11-24',
      description: 'Envío con remanente',
      paymentAmount: 5000,
      parts: [{
        paymentPrincipalAmount: 5000,
        ownerThirdPartyId: momId,
        destination: {
          type: 'MULTI_DEBT',
          allocations: [{ debtId: d1, sourceAmount: 3000, targetAmount: 3000 }],
          remainder: { type: 'CREATE_RECEIVABLE', description: 'Saldo a favor' },
        },
      }],
    });

    const generatedCobrar = await db.debts.where('type').equals('COBRAR').first();
    await db.transaction_applications.add({
      transactionId: 9999,
      targetType: 'DEBT',
      targetId: generatedCobrar.id,
      kind: APPLICATION_KINDS.DEBT_PAYMENT,
      sourceAmount: 500,
      sourceCurrency: 'VES',
      targetAmount: 500,
      targetCurrency: 'VES',
      createdAt: new Date(),
    });

    await expect(deleteReceiptGroup(db, created.receiptId)).rejects.toThrow(/ya tiene cobros registrados/i);
    expect(await db.receipts.get(created.receiptId)).toBeTruthy();
  });
});
