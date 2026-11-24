import { getDebtRemainingAmount } from './debtAllocation.js';

const toTimestamp = value => {
  if (!value) return 0;
  const parsed = value instanceof Date
    ? value
    : (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00`)
      : new Date(value));
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : 0;
};

const getDebtNextDueDate = debt => {
  if (debt?.isRecurring && Array.isArray(debt.debtAnchors) && debt.debtAnchors.length > 0) {
    const pending = [...debt.debtAnchors]
      .filter(anchor => anchor.status === 'PENDING')
      .sort((left, right) => (left.installmentNumber ?? 0) - (right.installmentNumber ?? 0))[0];
    if (pending?.nextDueDate) return pending.nextDueDate;
  }
  return debt?.dueDate || null;
};

/**
 * Groups active debts by (thirdPartyId, currency) when a third party has 2+ debts in the same currency.
 * Preserves single debts and unlinked debts as individual rows without redundant wrappers.
 */
export function groupActiveDebtsByPartyAndCurrency(debts = [], referenceDate = new Date()) {
  const buckets = new Map();
  const entries = [];

  for (const debt of debts) {
    if (!debt) continue;
    if (debt.thirdPartyId == null || debt.thirdPartyId === '') {
      entries.push({ kind: 'SINGLE', key: `debt-${debt.id}`, debt });
      continue;
    }

    const bucketKey = `${debt.type || 'DEBT'}:${debt.thirdPartyId}:${debt.currency || ''}`;
    if (!buckets.has(bucketKey)) {
      const bucket = [];
      buckets.set(bucketKey, bucket);
      entries.push({ kind: 'BUCKET', key: bucketKey, bucket });
    }
    buckets.get(bucketKey).push(debt);
  }

  const todayStart = new Date(referenceDate);
  todayStart.setHours(0, 0, 0, 0);

  return entries.map(entry => {
    if (entry.kind === 'SINGLE') return entry;

    const { bucket, key } = entry;
    if (bucket.length === 1) {
      const debt = bucket[0];
      return { kind: 'SINGLE', key: `debt-${debt.id}`, debt };
    }

    const orderedDebts = [...bucket].sort((left, right) => {
      const timeDiff = toTimestamp(left.createdAt) - toTimestamp(right.createdAt);
      if (timeDiff !== 0) return timeDiff;
      return (Number(left.id) || 0) - (Number(right.id) || 0);
    });

    const first = orderedDebts[0];
    let totalAmount = 0;
    let paidAmount = 0;
    let remaining = 0;
    let earliestCreatedAt = null;
    let latestCreatedAt = null;
    let nextDueDate = null;
    let hasOverdue = false;

    for (const debt of orderedDebts) {
      const debtTotal = Number(debt.totalAmount ?? debt.amount) || 0;
      const debtPaid = Number(debt.paidAmount) || 0;
      const debtRemaining = getDebtRemainingAmount(debt);
      totalAmount += debtTotal;
      paidAmount += debtPaid;
      remaining += debtRemaining;

      if (debt.createdAt) {
        const ts = toTimestamp(debt.createdAt);
        if (ts > 0 && (!earliestCreatedAt || ts < toTimestamp(earliestCreatedAt))) {
          earliestCreatedAt = debt.createdAt;
        }
        if (ts > 0 && (!latestCreatedAt || ts > toTimestamp(latestCreatedAt))) {
          latestCreatedAt = debt.createdAt;
        }
      }

      const candidateDue = getDebtNextDueDate(debt);
      if (candidateDue) {
        const dueTs = toTimestamp(candidateDue);
        if (dueTs > 0) {
          if (!nextDueDate || dueTs < toTimestamp(nextDueDate)) {
            nextDueDate = candidateDue;
          }
          if (dueTs < todayStart.getTime()) {
            hasOverdue = true;
          }
        }
      }
    }

    return {
      kind: 'GROUP',
      key,
      thirdPartyId: first.thirdPartyId,
      thirdPartyName: first.thirdParty?.name || first.thirdPartyName || 'Tercero',
      currency: first.currency,
      type: first.type,
      debts: orderedDebts,
      count: orderedDebts.length,
      totalAmount,
      paidAmount,
      remaining,
      earliestCreatedAt,
      latestCreatedAt,
      nextDueDate,
      hasOverdue,
    };
  });
}
