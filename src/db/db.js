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
}).upgrade(async tx => {
  const currenciesTable = tx.table('currencies');
  const count = await currenciesTable.count();
  if (count === 0) {
    await currenciesTable.bulkAdd([
      { code: 'USD', name: 'Dólar', symbol: '$', isFiat: true, isActive: true, decimalPlaces: 2 },
      { code: 'VES', name: 'Bolívar', symbol: 'Bs', isFiat: true, isActive: true, decimalPlaces: 2 },
      { code: 'USDT', name: 'Tether', symbol: 'USDT', isFiat: false, isActive: true, decimalPlaces: 2 },
      { code: 'EUR', name: 'Euro', symbol: '€', isFiat: true, isActive: false, decimalPlaces: 2 }
    ]);
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

  const currenciesCount = await db.currencies.count();
  if (currenciesCount === 0) {
    await db.currencies.bulkAdd([
      { code: 'USD', name: 'Dólar', symbol: '$', isFiat: true, isActive: true, decimalPlaces: 2 },
      { code: 'VES', name: 'Bolívar', symbol: 'Bs', isFiat: true, isActive: true, decimalPlaces: 2 },
      { code: 'USDT', name: 'Tether', symbol: 'USDT', isFiat: false, isActive: true, decimalPlaces: 2 },
      { code: 'EUR', name: 'Euro', symbol: '€', isFiat: true, isActive: false, decimalPlaces: 2 }
    ]);
  }
}

