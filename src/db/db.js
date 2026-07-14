import Dexie from 'dexie';

export const db = new Dexie('NoriaDatabase');

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

// Seed data function to populate catalogs on first open
export async function seedDatabase() {
  const tagsCount = await db.tags.count();
  if (tagsCount === 0) {
    await db.tags.bulkAdd([
      { name: 'Alquiler', pillar: 'NEED' },
      { name: 'Supermercado', pillar: 'NEED' },
      { name: 'Electricidad', pillar: 'NEED' },
      { name: 'Agua/Condominio', pillar: 'NEED' },
      { name: 'Internet/Fibra', pillar: 'NEED' },
      { name: 'Netflix/Streaming', pillar: 'WANT' },
      { name: 'Restaurantes', pillar: 'WANT' },
      { name: 'Fondo Emergencia', pillar: 'SAVE' },
      { name: 'Ahorro Viajes', pillar: 'SAVE' }
    ]);
  }

  const instCount = await db.institutions.count();
  if (instCount === 0) {
    await db.institutions.bulkAdd([
      { name: 'Efectivo Personal', type: 'CASH', country: 'VE' },
      { name: 'Binance Exchange', type: 'EXCHANGE', country: 'US' },
      { name: 'Zinli Billetera', type: 'NEOBANK', country: 'PA' }
    ]);
  }
}
