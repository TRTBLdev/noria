const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getProjectedDatesInRange = (startDate, interval = 1, unit = 'MONTHS', rangeStart, rangeEnd) => {
  if (!startDate || !rangeStart || !rangeEnd) return [];

  const parseLocalDate = (value) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  };

  let current = parseLocalDate(startDate);
  const first = parseLocalDate(rangeStart);
  const last = parseLocalDate(rangeEnd);
  const safeInterval = Math.max(1, Number(interval) || 1);

  const advance = (date) => {
    const next = new Date(date);
    if (unit === 'DAYS') next.setDate(next.getDate() + safeInterval);
    else if (unit === 'WEEKS') next.setDate(next.getDate() + (safeInterval * 7));
    else if (unit === 'YEARS') next.setFullYear(next.getFullYear() + safeInterval);
    else next.setMonth(next.getMonth() + safeInterval);
    next.setHours(12, 0, 0, 0);
    return next;
  };

  let guard = 0;
  while (current < first && guard < 1000) {
    current = advance(current);
    guard += 1;
  }

  const dates = [];
  guard = 0;
  while (current <= last && guard < 400) {
    dates.push(toLocalDateString(current));
    current = advance(current);
    guard += 1;
  }
  return dates;
};

export const addAnchorTemplateWithCurrentInstances = async (database, anchor, referenceDate = new Date()) => {
  const startDate = anchor.nextDueDate
    ? (typeof anchor.nextDueDate === 'string'
      ? anchor.nextDueDate.slice(0, 10)
      : toLocalDateString(new Date(anchor.nextDueDate)))
    : toLocalDateString(referenceDate);
  const monthStart = toLocalDateString(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 12));
  const monthEnd = toLocalDateString(new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 12));
  const template = {
    ...anchor,
    nextDueDate: startDate,
    frequencyInterval: anchor.frequencyInterval || 1,
    frequencyUnit: anchor.frequencyUnit || 'MONTHS',
    isTemplate: true,
    isArchived: false,
  };

  return database.transaction('rw', database.anchors, async () => {
    const templateId = await database.anchors.add(template);
    const projectedDates = getProjectedDatesInRange(
      startDate,
      template.frequencyInterval,
      template.frequencyUnit,
      monthStart,
      monthEnd
    );

    for (const nextDueDate of projectedDates) {
      await database.anchors.add({
        name: template.name,
        type: template.type,
        amount: template.amount,
        currency: template.currency,
        accountId: template.accountId || null,
        macetaId: template.macetaId || null,
        nextDueDate,
        status: 'PENDING',
        pillar: template.pillar,
        tagId: template.tagId || null,
        isTemplate: false,
        parentAnchorId: templateId,
      });
    }

    return templateId;
  });
};

export const syncAnchorTemplateCurrentInstances = async (database, templateId, referenceDate = new Date()) => {
  return database.transaction('rw', database.anchors, async () => {
    const template = await database.anchors.get(templateId);
    if (!template || template.isTemplate !== true || template.isArchived) return;

    const startDate = template.nextDueDate
      ? (typeof template.nextDueDate === 'string'
        ? template.nextDueDate.slice(0, 10)
        : toLocalDateString(new Date(template.nextDueDate)))
      : toLocalDateString(referenceDate);
    const monthStart = toLocalDateString(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 12));
    const monthEnd = toLocalDateString(new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 12));
    const desiredDates = getProjectedDatesInRange(
      startDate,
      template.frequencyInterval || 1,
      template.frequencyUnit || 'MONTHS',
      monthStart,
      monthEnd
    );
    const children = (await database.anchors.toArray()).filter(anchor => anchor.parentAnchorId === templateId);
    const currentChildren = children.filter(anchor => {
      const date = typeof anchor.nextDueDate === 'string'
        ? anchor.nextDueDate.slice(0, 10)
        : toLocalDateString(new Date(anchor.nextDueDate));
      return date >= monthStart && date <= monthEnd;
    });

    for (const child of currentChildren) {
      const childDate = typeof child.nextDueDate === 'string'
        ? child.nextDueDate.slice(0, 10)
        : toLocalDateString(new Date(child.nextDueDate));
      if (child.status !== 'PAID' && !desiredDates.includes(childDate)) {
        await database.anchors.delete(child.id);
      }
    }

    const remainingChildren = (await database.anchors.toArray()).filter(anchor => anchor.parentAnchorId === templateId);
    for (const nextDueDate of desiredDates) {
      const exists = remainingChildren.some(anchor => {
        const date = typeof anchor.nextDueDate === 'string'
          ? anchor.nextDueDate.slice(0, 10)
          : toLocalDateString(new Date(anchor.nextDueDate));
        return date === nextDueDate;
      });
      if (!exists) {
        await database.anchors.add({
          name: template.name,
          type: template.type,
          amount: template.amount,
          currency: template.currency,
          accountId: template.accountId || null,
          macetaId: template.macetaId || null,
          nextDueDate,
          status: 'PENDING',
          pillar: template.pillar,
          tagId: template.tagId || null,
          isTemplate: false,
          parentAnchorId: templateId,
        });
      }
    }
  });
};
