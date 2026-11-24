import { describe, expect, it } from 'vitest';
import { getTransactionActionAvailability } from '../src/components/TransactionsSection.jsx';
import { getCurrentGoalPeriod } from '../src/db/spendingGoals.js';

describe('acciones del historial', () => {
  it('conserva las acciones disponibles para un gasto ordinario', () => {
    expect(getTransactionActionAvailability({ id: 1, type: 'OUT' }, null)).toEqual({
      edit: true,
      link: true,
      editLinks: false,
      unlink: false,
      split: true,
      delete: true,
    });
  });

  it('limita las acciones de fragmentos y aplicaciones sin cambiar sus permisos', () => {
    expect(getTransactionActionAvailability({ id: 2, type: 'OUT', receiptId: 'R-1' }, null)).toEqual({
      edit: false,
      link: true,
      editLinks: false,
      unlink: false,
      split: false,
      delete: false,
    });
    expect(getTransactionActionAvailability(
      { id: 3, type: 'OUT', receiptId: 'R-1' },
      { id: 9, targetType: 'DEBT', isLegacy: false }
    )).toEqual({
      edit: false,
      link: false,
      editLinks: true,
      unlink: true,
      split: false,
      delete: false,
    });
    expect(getTransactionActionAvailability(
      { id: 4, type: 'OUT', receiptId: 'R-1' },
      { id: 10, targetType: 'DEBT', isLegacy: true }
    )).toEqual({
      edit: false,
      link: false,
      editLinks: false,
      unlink: false,
      split: false,
      delete: false,
    });
    expect(getTransactionActionAvailability(
      { id: 5, type: 'OUT' },
      [
        { id: 11, targetType: 'DEBT', isLegacy: false },
        { id: 12, targetType: 'DEBT', isLegacy: false },
      ]
    )).toEqual({
      edit: false,
      link: false,
      editLinks: true,
      unlink: true,
      split: false,
      delete: true,
    });
  });
});

describe('resumen de objetivos', () => {
  it('selecciona el período vigente y usa el último como respaldo', () => {
    const periods = [
      { id: 1, goalId: 7, startDate: '2026-07-01', endDate: '2026-07-31' },
      { id: 2, goalId: 7, startDate: '2026-08-01', endDate: '2026-08-31' },
      { id: 3, goalId: 8, startDate: '2026-08-01', endDate: '2026-08-31' },
    ];
    expect(getCurrentGoalPeriod(periods, 7, new Date('2026-08-15T12:00:00'))?.id).toBe(2);
    expect(getCurrentGoalPeriod(periods, 7, new Date('2026-09-15T12:00:00'))?.id).toBe(2);
    expect(getCurrentGoalPeriod(periods, 99, new Date('2026-08-15T12:00:00'))).toBeNull();
  });
});

describe('navegacion mensual de saldadas y lotes', () => {
  it('genera llaves de anio-mes y formatea etiquetas en mayusculas', async () => {
    const { formatMonthYearLabel, getYearMonthKey } = await import('../src/components/MonthFilterBar.jsx');
    expect(getYearMonthKey('2026-10-15T10:00:00')).toBe('2026-10');
    expect(getYearMonthKey(new Date(2026, 7, 5))).toBe('2026-08');
    expect(formatMonthYearLabel('2026-10')).toContain('OCTUBRE 2026');
    expect(formatMonthYearLabel('2026-08')).toContain('AGOSTO 2026');
    expect(formatMonthYearLabel('2026-10', { short: true })).toBe('OCT 2026');
    expect(formatMonthYearLabel('2026-08', { short: true })).toBe('AGO 2026');
  });

  it('ordena registros saldados/agotados con el mas reciente primero', () => {
    const items = [
      { id: 1, date: new Date('2026-05-10') },
      { id: 2, date: new Date('2026-10-01') },
      { id: 3, date: new Date('2026-08-20') },
    ];
    const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
    expect(sorted.map(i => i.id)).toEqual([2, 3, 1]);
  });
});

describe('integridad de imports de base de datos en UI', () => {
  it('todos los componentes y pantallas que usan db. importan db explícitamente', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dirs = [
      join(process.cwd(), 'src', 'components'),
      join(process.cwd(), 'src', 'screens'),
    ];
    const missing = [];
    for (const dir of dirs) {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.jsx')) continue;
        const content = readFileSync(join(dir, file), 'utf8');
        const usesDb = /\bdb\./.test(content);
        const importsDb = /import\s*\{[^}]*\bdb\b[^}]*\}\s*from\s*['"][^'"]*db(?:\.js)?['"]/.test(content);
        if (usesDb && !importsDb) missing.push(file);
      }
    }
    expect(missing).toEqual([]);
  });
});

