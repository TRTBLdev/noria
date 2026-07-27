const CORE_TABLES = ['accounts', 'transactions', 'lots', 'app_config'];

function getPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('El respaldo no contiene un objeto JSON válido.');
  }
  return raw.data && typeof raw.data === 'object' ? raw.data : raw;
}

export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('El archivo no contiene JSON válido.');
  }

  const payload = getPayload(raw);
  for (const tableName of CORE_TABLES) {
    if (!Array.isArray(payload[tableName])) {
      throw new Error(`El respaldo no contiene la tabla requerida "${tableName}".`);
    }
  }

  for (const [name, records] of Object.entries(payload)) {
    if (name === '_meta') continue;
    if (!Array.isArray(records)) {
      throw new Error(`La tabla "${name}" no tiene un formato válido.`);
    }
  }

  return normalizeBackup(payload);
}

function normalizeBackup(payload) {
  const normalized = Object.fromEntries(
    Object.entries(payload).map(([name, records]) => [name, Array.isArray(records) ? records.map(record => ({ ...record })) : records])
  );
  const config = normalized.app_config;
  const baseCurrency = config.find(item => item.key === 'baseCurrency')?.value || null;
  const lotConfig = config.find(item => item.key === 'lotCurrency');

  for (const currency of normalized.currencies || []) {
    if (!currency.symbolPosition) currency.symbolPosition = currency.symbol === '$' || currency.symbol === '€' ? 'before' : 'after';
    if (currency.code === baseCurrency) currency.baseRelation = 'BASE';
    else if (currency.code === lotConfig?.value) currency.baseRelation = 'LOTS';
    else if (!currency.baseRelation) currency.baseRelation = 'UNTRACKED';
    if (currency.baseRelation !== 'PARITY') delete currency.unitsPerBase;
  }

  const lotCurrencies = new Set();
  for (const lot of normalized.lots) {
    if (lot.currency) lotCurrencies.add(lot.currency);
    const legacyCost = Number.isFinite(lot.effectiveRate) && lot.effectiveRate > 0
      ? Number(lot.amount) / lot.effectiveRate
      : null;
    if (!lot.costCurrency) lot.costCurrency = baseCurrency || 'USD';
    if (!Number.isFinite(lot.costAmount)) lot.costAmount = legacyCost;
    if (!Number.isFinite(lot.remainingCostAmount)) {
      lot.remainingCostAmount = legacyCost == null ? null : Number(lot.remainingAmount) / lot.effectiveRate;
    }
    if (!Number.isFinite(lot.costAmount) || !Number.isFinite(lot.remainingCostAmount)) {
      throw new Error(`El lote #${lot.id || '?'} no contiene un costo recuperable.`);
    }
  }

  if (!lotConfig) {
    if (lotCurrencies.size > 1) throw new Error('El respaldo contiene lotes de varias divisas y no permite inferir una configuración única.');
    config.push({ key: 'lotCurrency', value: lotCurrencies.size === 1 ? [...lotCurrencies][0] : null });
  }

  const resolvedLotCurrency = config.find(item => item.key === 'lotCurrency')?.value || null;
  for (const currency of normalized.currencies || []) {
    if (currency.code === baseCurrency) currency.baseRelation = 'BASE';
    else if (currency.code === resolvedLotCurrency) {
      currency.baseRelation = 'LOTS';
      delete currency.unitsPerBase;
    }
  }

  for (const transaction of normalized.transactions) {
    if (!Number.isFinite(transaction.baseAmount)) {
      if (Number.isFinite(transaction.costUSD)) transaction.baseAmount = transaction.costUSD;
      else if (Number.isFinite(transaction.amountUSD)) transaction.baseAmount = transaction.amountUSD;
    }
    if (Number.isFinite(transaction.baseAmount) && !transaction.baseCurrency) {
      transaction.baseCurrency = Number.isFinite(transaction.costUSD) || Number.isFinite(transaction.amountUSD)
        ? 'USD'
        : (baseCurrency || transaction.currency);
    }
    delete transaction.costUSD;
    delete transaction.amountUSD;
  }

  return normalized;
}

export async function exportDatabase(db) {
  const exportData = {
    _meta: {
      format: 'noria-backup',
      version: 4,
      databaseVersion: db.verno,
      exportedAt: new Date().toISOString(),
    },
  };

  for (const table of db.tables) {
    exportData[table.name] = await table.toArray();
  }
  return exportData;
}

export async function importDatabase(db, text) {
  const payload = parseBackup(text);

  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
    for (const table of db.tables) {
      const records = payload[table.name] || [];
      if (records.length > 0) await table.bulkPut(records);
    }
  });

  return Object.fromEntries(
    db.tables.map(table => [table.name, (payload[table.name] || []).length])
  );
}

export function navigateToAccess() {
  const target = `${window.location.origin}${window.location.pathname}#/access`;
  if (window.location.href === target) window.location.reload();
  else window.location.replace(target);
}
