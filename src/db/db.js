import Dexie from 'dexie';

export const db = new Dexie('NoriaDatabase');

export const DEFAULT_INCOME_TYPES = [
  { name: 'Salario / Empleo', iconKey: 'work', isDefault: true, legacyKey: 'SALARY' },
  { name: 'Freelance / Servicios', iconKey: 'freelance', isDefault: true, legacyKey: 'FREELANCE' },
  { name: 'Inversiones / Dividendos', iconKey: 'investment', isDefault: true, legacyKey: 'INVESTMENT' },
  { name: 'Regalos / Bonos', iconKey: 'gift', isDefault: true, legacyKey: 'GIFT' },
  { name: 'Ventas / Negocio', iconKey: 'business', isDefault: true, legacyKey: 'BUSINESS' },
  { name: 'Otro', iconKey: 'money', isDefault: true, legacyKey: 'OTHER' }
];

db.version(1).stores({
  institutions: '++id, name, type, country',
  accounts: '++id, institutionId, name, type, currency, balance',
  instruments: '++id, accountId, type, status, alias',
  tags: '++id, name, pillar',
  third_parties: '++id, name',
  anchors: '++id, name, type, amount, currency, accountId, nextDueDate, status, pillar',
  income_sources: '++id, name, type, isActive',
  transactions: '++id, date, type, amount, currency, accountId, tagId, anchorId, incomeSourceId, pillar, description',
  lots: '++id, date, route, inputCurrency, inputAmount, outputCurrency, outputAmount, effectiveRate, remainingAmount, status',
  debts: '++id, thirdPartyId, type, amount, currency, status, dueDate',
  macetas: '++id, name, targetAmount, currency, priority, status',
  maceta_allocations: '++id, macetaId, accountId, amount, currency, locked',
  debt_payments: '++id, debtId, date, amountPaid, currency, exchangeRateSource, note',
  app_config: 'key',
});

db.version(2).stores({
  accounts: '++id, institutionId, name, type, currency, balance, isArchived',
});

db.version(3).stores({
  anchors: '++id, name, type, amount, currency, accountId, nextDueDate, status, pillar, tagId',
});

db.version(4).stores({
  tags: '++id, name, pillar, iconKey',
  income_sources: '++id, name, type, isActive, tagId',
});

db.version(5).stores({
  tags: '++id, name, pillar, iconKey, kind',
}).upgrade(tx => tx.table('tags').toCollection().modify(tag => {
  if (!tag.kind) tag.kind = 'EXPENSE';
}));

db.version(6).stores({
  income_types: '++id, name, iconKey, isDefault',
  income_sources: '++id, name, type, isActive, tagId, incomeTypeId',
}).upgrade(async tx => {
  const incomeTypes = tx.table('income_types');
  const sources = tx.table('income_sources');
  const transactions = tx.table('transactions');
  const tags = tx.table('tags');

  const typeIds = {};
  for (const type of DEFAULT_INCOME_TYPES) {
    typeIds[type.legacyKey] = await incomeTypes.add({ ...type });
  }

  await sources.toCollection().modify(source => {
    source.incomeTypeId = typeIds[source.type] || typeIds.OTHER;
    source.tagId = null;
  });

  await transactions.where('type').equals('IN').modify(txRecord => {
    txRecord.tagId = null;
  });

  const incomeTags = await tags.where('kind').equals('INCOME').toArray();
  for (const tag of incomeTags) await tags.delete(tag.id);
});

db.version(7).stores({
  currencies: '++id, &code, isActive',
  transactions: '++id, date, type, amount, currency, accountId, tagId, anchorId, incomeSourceId, pillar, description, transferId',
  lots: '++id, transactionId, currency, status',
  anchors: '++id, name, type, amount, currency, accountId, nextDueDate, status, pillar, tagId, macetaId',
});

db.version(8).stores({
  tags: '++id, name, pillar, iconKey, kind, parentId',
  transactions: '++id, date, type, amount, currency, accountId, tagId, anchorId, incomeSourceId, pillar, description, transferId, thirdPartyId, splitGroupId',
});

db.version(9).stores({
  anchors: '++id, name, type, amount, currency, accountId, nextDueDate, status, pillar, tagId, macetaId, debtId, installmentNumber',
  debts: '++id, thirdPartyId, type, amount, totalAmount, currency, status, dueDate, isRecurring',
});

db.version(10).stores({
  debt_payments: '++id, debtId, anchorId, date, amountPaid, currency, exchangeRateSource, note',
});

db.version(11).stores({
  lots: '++id, transactionId, currency, costCurrency, status',
}).upgrade(async tx => {
  const baseConfig = await tx.table('app_config').get('baseCurrency');

  await tx.table('currencies').toCollection().modify(currency => {
    if (!currency.symbolPosition) {
      currency.symbolPosition = currency.symbol === '$' || currency.symbol === '€' ? 'before' : 'after';
    }
  });

  await tx.table('lots').toCollection().modify(lot => {
    const legacyCost = Number.isFinite(lot.effectiveRate) && lot.effectiveRate > 0
      ? Number(lot.amount) / lot.effectiveRate
      : null;
    if (!lot.costCurrency) lot.costCurrency = baseConfig?.value || 'USD';
    if (!Number.isFinite(lot.costAmount)) lot.costAmount = legacyCost;
    if (!Number.isFinite(lot.remainingCostAmount)) {
      lot.remainingCostAmount = legacyCost == null ? null : Number(lot.remainingAmount) / lot.effectiveRate;
    }
  });

  await tx.table('transactions').toCollection().modify(record => {
    if (!Number.isFinite(record.baseAmount)) {
      if (Number.isFinite(record.costUSD)) record.baseAmount = record.costUSD;
      else if (Number.isFinite(record.amountUSD)) record.baseAmount = record.amountUSD;
    }
    if (Number.isFinite(record.baseAmount) && !record.baseCurrency) {
      record.baseCurrency = Number.isFinite(record.costUSD) || Number.isFinite(record.amountUSD)
        ? 'USD'
        : (baseConfig?.value || record.currency);
    }
    delete record.costUSD;
    delete record.amountUSD;
  });
});

db.version(12).stores({}).upgrade(async tx => {
  const baseCurrency = (await tx.table('app_config').get('baseCurrency'))?.value || null;
  const lotCurrency = (await tx.table('app_config').get('lotCurrency'))?.value || null;
  await tx.table('currencies').toCollection().modify(currency => {
    if (currency.code === baseCurrency) currency.baseRelation = 'BASE';
    else if (currency.code === lotCurrency) currency.baseRelation = 'LOTS';
    else if (!currency.baseRelation) currency.baseRelation = 'UNTRACKED';
    if (currency.baseRelation !== 'PARITY') delete currency.unitsPerBase;
  });
});

db.version(13).stores({
  transactions: '++id, date, type, amount, currency, accountId, tagId, anchorId, incomeSourceId, pillar, description, transferId, thirdPartyId, splitGroupId, receiptId',
  debt_payments: '++id, debtId, anchorId, transactionId, date, amountPaid, currency, exchangeRateSource, note',
  receipts: 'id, date, accountId, merchantThirdPartyId, invoiceCurrency, paymentCurrency',
  transaction_applications: '++id, &transactionId, targetType, targetId, [targetType+targetId], kind, periodId',
  spending_goals: '++id, status, isRecurring, startDate, defaultTagId',
  spending_goal_periods: '++id, goalId, [goalId+startDate], status, startDate, endDate',
  savings_contributions: '++id, macetaId, anchorId, transactionId, date',
}).upgrade(async tx => {
  const payments = await tx.table('debt_payments').toArray();
  const transactions = await tx.table('transactions').toArray();
  const debts = await tx.table('debts').toArray();
  const applications = tx.table('transaction_applications');
  const usedTransactionIds = new Set();
  const migratedPaidByDebt = new Map();

  const dayKey = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  };

  const findMatchingTransaction = payment => {
    const candidates = transactions.filter(record => (
      record.debtId === payment.debtId
      && !['LOAN_PROCEEDS', 'LOAN_DISBURSEMENT'].includes(record.cashflowKind)
      && !usedTransactionIds.has(record.id)
    ));
    return candidates.sort((left, right) => {
      const leftAnchor = left.anchorId === payment.anchorId ? 0 : 1;
      const rightAnchor = right.anchorId === payment.anchorId ? 0 : 1;
      if (leftAnchor !== rightAnchor) return leftAnchor - rightAnchor;
      const leftDay = dayKey(left.date) === dayKey(payment.date) ? 0 : 1;
      const rightDay = dayKey(right.date) === dayKey(payment.date) ? 0 : 1;
      if (leftDay !== rightDay) return leftDay - rightDay;
      return String(left.id).localeCompare(String(right.id));
    })[0] || null;
  };

  for (const payment of payments) {
    const targetAmount = Number(payment.amountPaid);
    if (!Number.isFinite(targetAmount) || targetAmount <= 0 || !payment.debtId) continue;
    const transaction = findMatchingTransaction(payment);
    if (transaction) usedTransactionIds.add(transaction.id);
    const sourceAmount = Number(payment.paymentAmount) > 0
      ? Number(payment.paymentAmount)
      : (Number(transaction?.amount) > 0 ? Number(transaction.amount) : targetAmount);
    const sourceCurrency = payment.paymentCurrency || transaction?.currency || payment.currency;
    const targetCurrency = payment.currency || sourceCurrency;

    const applicationId = await applications.add({
      transactionId: transaction?.id,
      targetType: 'DEBT',
      targetId: payment.debtId,
      kind: 'DEBT_PAYMENT',
      sourceAmount,
      sourceCurrency,
      targetAmount,
      targetCurrency,
      rateSource: payment.exchangeRateSource || (sourceCurrency === targetCurrency ? 'SAME_CURRENCY' : 'LEGACY'),
      legacyDebtPaymentId: payment.id,
      note: payment.note || null,
      createdAt: payment.date || new Date(),
      isLegacy: !transaction,
    });
    migratedPaidByDebt.set(payment.debtId, (migratedPaidByDebt.get(payment.debtId) || 0) + targetAmount);
    if (transaction) {
      await tx.table('debt_payments').update(payment.id, { transactionId: transaction.id });
      await tx.table('transactions').update(transaction.id, { applicationId });
    }
  }

  for (const debt of debts) {
    const recordedPaid = Number(debt.paidAmount) || 0;
    const migratedPaid = migratedPaidByDebt.get(debt.id) || 0;
    const missingPaid = recordedPaid - migratedPaid;
    if (missingPaid <= 0.005) continue;
    await applications.add({
      targetType: 'DEBT',
      targetId: debt.id,
      kind: 'DEBT_PAYMENT',
      sourceAmount: missingPaid,
      sourceCurrency: debt.currency,
      targetAmount: missingPaid,
      targetCurrency: debt.currency,
      rateSource: 'LEGACY',
      createdAt: debt.settledDate || debt.createdAt || new Date(),
      isLegacy: true,
      note: 'Saldo pagado migrado sin transacción vinculable',
    });
  }
});


// Seed data function to populate catalogs on first open
export async function seedDatabase() {
  const tagsCount = await db.tags.count();
  if (tagsCount === 0) {
    await db.tags.bulkAdd([
      { name: 'Alquiler', iconKey: 'home', kind: 'EXPENSE' },
      { name: 'Supermercado', iconKey: 'cart', kind: 'EXPENSE' },
      { name: 'Electricidad', iconKey: 'utilities', kind: 'EXPENSE' },
      { name: 'Agua/Condominio', iconKey: 'receipt', kind: 'EXPENSE' },
      { name: 'Internet/Fibra', iconKey: 'internet', kind: 'EXPENSE' },
      { name: 'Netflix/Streaming', iconKey: 'streaming', kind: 'EXPENSE' },
      { name: 'Restaurantes', iconKey: 'food', kind: 'EXPENSE' },
      { name: 'Educacion', iconKey: 'education', kind: 'EXPENSE' }
    ]);
  }

  const incomeTypesCount = await db.income_types.count();
  if (incomeTypesCount === 0) {
    await db.income_types.bulkAdd(DEFAULT_INCOME_TYPES.map(type => ({ ...type })));
  }

}
