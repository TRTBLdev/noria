const parseLocalDate = value => {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};

const addInterval = (date, interval, unit) => {
  const result = new Date(date);
  const amount = Math.max(1, Number(interval) || 1);
  if (unit === 'DAYS') result.setDate(result.getDate() + amount);
  else if (unit === 'WEEKS') result.setDate(result.getDate() + amount * 7);
  else if (unit === 'YEARS') result.setFullYear(result.getFullYear() + amount);
  else result.setMonth(result.getMonth() + amount);
  return result;
};

const getPeriodEnd = (anchor, template) => {
  const dueDate = parseLocalDate(anchor.nextDueDate);
  const next = addInterval(dueDate, template?.frequencyInterval || anchor.frequencyInterval || 1, template?.frequencyUnit || anchor.frequencyUnit || 'MONTHS');
  next.setDate(next.getDate() - 1);
  next.setHours(23, 59, 59, 999);
  return next;
};

export async function refreshSavingsAnchorInTransaction(database, anchorId, referenceDate = new Date()) {
  const anchor = await database.anchors.get(anchorId);
  if (!anchor || anchor.pillar !== 'SAVE') return null;
  const contributions = await database.savings_contributions.where('anchorId').equals(anchor.id).toArray();
  const contributedAmount = contributions.reduce((sum, contribution) => sum + (Number(contribution.amount) || 0), 0);
  const targetAmount = Number(anchor.amount) || 0;
  const template = anchor.parentAnchorId ? await database.anchors.get(anchor.parentAnchorId) : null;
  const periodEnded = getPeriodEnd(anchor, template) < new Date(referenceDate);
  let status = 'PENDING';
  if (contributedAmount >= targetAmount - 0.001) status = 'PAID';
  else if (periodEnded) status = contributedAmount > 0 ? 'PARTIAL_EXPIRED' : 'EXPIRED';
  else if (contributedAmount > 0) status = 'PARTIAL';
  await database.anchors.update(anchor.id, { contributedAmount, status });
  return { ...anchor, contributedAmount, status };
}

export async function addSavingsContributionInTransaction(database, {
  macetaId,
  anchorId,
  transactionId = null,
  accountId,
  amount,
  currency,
  method,
  date = new Date(),
}) {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) throw new Error('El aporte debe ser mayor a cero.');
  const id = await database.savings_contributions.add({
    macetaId,
    anchorId,
    transactionId,
    accountId,
    amount: parsedAmount,
    currency,
    method,
    date,
    createdAt: new Date(),
  });
  if (anchorId) await refreshSavingsAnchorInTransaction(database, anchorId, date);
  return database.savings_contributions.get(id);
}

export async function syncSavingsContributionPeriods(database, referenceDate = new Date()) {
  return database.transaction('rw', [database.anchors, database.savings_contributions], async () => {
    const anchors = await database.anchors.filter(anchor => anchor.isTemplate === false && anchor.pillar === 'SAVE').toArray();
    for (const anchor of anchors) await refreshSavingsAnchorInTransaction(database, anchor.id, referenceDate);
  });
}
