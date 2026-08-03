const toLocalDateString = value => {
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00`);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDate = value => {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};

const addInterval = (date, interval, unit) => {
  const next = new Date(date);
  const amount = Math.max(1, Number(interval) || 1);
  if (unit === 'DAYS') next.setDate(next.getDate() + amount);
  else if (unit === 'WEEKS') next.setDate(next.getDate() + amount * 7);
  else if (unit === 'YEARS') next.setFullYear(next.getFullYear() + amount);
  else next.setMonth(next.getMonth() + amount);
  next.setHours(12, 0, 0, 0);
  return next;
};

const previousDay = date => {
  const result = new Date(date);
  result.setDate(result.getDate() - 1);
  return result;
};

export function getGoalPeriodStatus(period, progressAmount, referenceDate = new Date()) {
  const target = Number(period.targetAmount) || 0;
  if (progressAmount >= target - 0.000001) return 'COMPLETED';
  const end = parseLocalDate(period.endDate);
  const reference = new Date(referenceDate);
  reference.setHours(12, 0, 0, 0);
  if (end < reference) return progressAmount > 0 ? 'PARTIAL' : 'EXPIRED';
  return progressAmount > 0 ? 'ACTIVE_PARTIAL' : 'ACTIVE';
}

export function getCurrentGoalPeriod(periods, goalId, referenceDate = new Date()) {
  const effectiveDate = toLocalDateString(referenceDate);
  const goalPeriods = periods.filter(period => period.goalId === goalId);
  return goalPeriods.find(period => (
    effectiveDate >= String(period.startDate).slice(0, 10)
    && effectiveDate <= String(period.endDate).slice(0, 10)
  )) || [...goalPeriods].sort((left, right) => String(right.startDate).localeCompare(String(left.startDate)))[0] || null;
}

export async function ensureGoalPeriodsInTransaction(database, goal, throughDate = new Date()) {
  if (!goal) throw new Error('El objetivo de gasto no existe.');
  const existing = await database.spending_goal_periods.where('goalId').equals(goal.id).toArray();
  const existingStarts = new Set(existing.map(period => String(period.startDate).slice(0, 10)));
  const start = parseLocalDate(goal.startDate || new Date());
  const through = throughDate instanceof Date ? throughDate : parseLocalDate(throughDate);
  const periods = [...existing];

  if (!goal.isRecurring) {
    const startDate = toLocalDateString(start);
    if (!existingStarts.has(startDate)) {
      const id = await database.spending_goal_periods.add({
        goalId: goal.id,
        startDate,
        endDate: goal.endDate ? String(goal.endDate).slice(0, 10) : startDate,
        targetAmount: goal.targetAmount,
        currency: goal.currency,
        progressAmount: 0,
        status: 'ACTIVE',
      });
      periods.push(await database.spending_goal_periods.get(id));
    }
    return periods;
  }

  let cursor = start;
  let guard = 0;
  while (cursor <= through && guard < 600) {
    const next = addInterval(cursor, goal.frequencyInterval, goal.frequencyUnit);
    const startDate = toLocalDateString(cursor);
    if (!existingStarts.has(startDate)) {
      const id = await database.spending_goal_periods.add({
        goalId: goal.id,
        startDate,
        endDate: toLocalDateString(previousDay(next)),
        targetAmount: goal.targetAmount,
        currency: goal.currency,
        progressAmount: 0,
        status: 'ACTIVE',
      });
      periods.push(await database.spending_goal_periods.get(id));
      existingStarts.add(startDate);
    }
    cursor = next;
    guard += 1;
  }
  return periods;
}

export async function findGoalPeriodForDate(database, goal, date) {
  const effectiveDate = String(date instanceof Date ? toLocalDateString(date) : date).slice(0, 10);
  await ensureGoalPeriodsInTransaction(database, goal, parseLocalDate(effectiveDate));
  const periods = await database.spending_goal_periods.where('goalId').equals(goal.id).toArray();
  return periods.find(period => effectiveDate >= String(period.startDate).slice(0, 10)
    && effectiveDate <= String(period.endDate).slice(0, 10)) || null;
}

export async function refreshGoalPeriodInTransaction(database, periodId, referenceDate = new Date()) {
  const period = await database.spending_goal_periods.get(periodId);
  if (!period) return null;
  const applications = await database.transaction_applications
    .where('[targetType+targetId]').equals(['SPENDING_GOAL', period.goalId])
    .filter(application => application.periodId === period.id && application.kind === 'GOAL_PROGRESS')
    .toArray();
  const progressAmount = applications.reduce((sum, application) => sum + (Number(application.targetAmount) || 0), 0);
  const status = getGoalPeriodStatus(period, progressAmount, referenceDate);
  await database.spending_goal_periods.update(period.id, { progressAmount, status });
  return { ...period, progressAmount, status };
}

export async function syncSpendingGoalPeriods(database, referenceDate = new Date()) {
  return database.transaction('rw', [database.spending_goals, database.spending_goal_periods, database.transaction_applications], async () => {
    const goals = await database.spending_goals.filter(goal => goal.status !== 'ARCHIVED').toArray();
    for (const goal of goals) {
      const periods = await ensureGoalPeriodsInTransaction(database, goal, referenceDate);
      for (const period of periods) await refreshGoalPeriodInTransaction(database, period.id, referenceDate);
    }
  });
}

export { toLocalDateString };
