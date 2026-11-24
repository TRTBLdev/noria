import { describe, expect, it } from 'vitest';
import { groupActiveDebtsByPartyAndCurrency } from '../src/utils/debtGrouping.js';

describe('agrupación de deudas por persona y moneda (Fase 2)', () => {
  it('agrupa 2+ deudas de la misma persona y moneda sumando totales y ordenando FIFO', () => {
    const debts = [
      {
        id: 12,
        type: 'PAGAR',
        thirdPartyId: 1,
        thirdParty: { id: 1, name: 'Mamá' },
        description: 'Taxi',
        totalAmount: 3000,
        paidAmount: 1422.67,
        remaining: 1577.33,
        currency: 'VES',
        createdAt: new Date('2026-11-04T12:00:00'),
      },
      {
        id: 10,
        type: 'PAGAR',
        thirdPartyId: 1,
        thirdParty: { id: 1, name: 'Mamá' },
        description: 'Farmacia',
        totalAmount: 2500,
        paidAmount: 0,
        remaining: 2500,
        currency: 'VES',
        createdAt: new Date('2026-11-01T12:00:00'),
      },
      {
        id: 11,
        type: 'PAGAR',
        thirdPartyId: 1,
        thirdParty: { id: 1, name: 'Mamá' },
        description: 'Mercado',
        totalAmount: 4000,
        paidAmount: 500,
        remaining: 3500,
        currency: 'VES',
        createdAt: new Date('2026-11-02T12:00:00'),
      },
    ];

    const grouped = groupActiveDebtsByPartyAndCurrency(debts, new Date('2026-11-24T12:00:00'));
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      kind: 'GROUP',
      thirdPartyId: 1,
      thirdPartyName: 'Mamá',
      currency: 'VES',
      count: 3,
      totalAmount: 9500,
      paidAmount: 1922.67,
      hasOverdue: false,
    });
    expect(grouped[0].remaining).toBeCloseTo(7577.33, 2);
    expect(grouped[0].debts.map(d => d.id)).toEqual([10, 11, 12]);
  });

  it('mantiene separados grupos de distinta moneda para la misma persona y deja 1 deuda como SINGLE', () => {
    const debts = [
      { id: 1, type: 'PAGAR', thirdPartyId: 1, thirdParty: { name: 'Mamá' }, totalAmount: 1000, paidAmount: 0, remaining: 1000, currency: 'VES', createdAt: new Date('2026-11-01') },
      { id: 2, type: 'PAGAR', thirdPartyId: 1, thirdParty: { name: 'Mamá' }, totalAmount: 2000, paidAmount: 0, remaining: 2000, currency: 'VES', createdAt: new Date('2026-11-02') },
      { id: 3, type: 'PAGAR', thirdPartyId: 1, thirdParty: { name: 'Mamá' }, totalAmount: 25, paidAmount: 0, remaining: 25, currency: 'USD', createdAt: new Date('2026-11-03') },
      { id: 4, type: 'PAGAR', thirdPartyId: 2, thirdParty: { name: 'Carlos' }, totalAmount: 500, paidAmount: 0, remaining: 500, currency: 'VES', createdAt: new Date('2026-11-04') },
      { id: 5, type: 'PAGAR', thirdPartyId: null, totalAmount: 800, paidAmount: 0, remaining: 800, currency: 'VES', createdAt: new Date('2026-11-05') },
    ];

    const result = groupActiveDebtsByPartyAndCurrency(debts);
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ kind: 'GROUP', thirdPartyName: 'Mamá', currency: 'VES', count: 2, remaining: 3000 });
    expect(result[1]).toMatchObject({ kind: 'SINGLE', debt: expect.objectContaining({ id: 3, currency: 'USD' }) });
    expect(result[2]).toMatchObject({ kind: 'SINGLE', debt: expect.objectContaining({ id: 4, thirdPartyId: 2 }) });
    expect(result[3]).toMatchObject({ kind: 'SINGLE', debt: expect.objectContaining({ id: 5, thirdPartyId: null }) });
  });

  it('detecta próximo vencimiento y deudas vencidas incluyendo cuotas pendientes', () => {
    const debts = [
      {
        id: 1,
        type: 'COBRAR',
        thirdPartyId: 7,
        thirdParty: { name: 'Ana' },
        totalAmount: 100,
        paidAmount: 0,
        remaining: 100,
        currency: 'USD',
        isRecurring: true,
        debtAnchors: [
          { installmentNumber: 1, status: 'PAID', nextDueDate: '2026-11-01' },
          { installmentNumber: 2, status: 'PENDING', nextDueDate: '2026-11-15' },
        ],
        createdAt: new Date('2026-10-01'),
      },
      {
        id: 2,
        type: 'COBRAR',
        thirdPartyId: 7,
        thirdParty: { name: 'Ana' },
        totalAmount: 50,
        paidAmount: 0,
        remaining: 50,
        currency: 'USD',
        dueDate: '2026-12-01',
        createdAt: new Date('2026-11-05'),
      },
    ];

    const grouped = groupActiveDebtsByPartyAndCurrency(debts, new Date('2026-11-24T12:00:00'));
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      kind: 'GROUP',
      nextDueDate: '2026-11-15',
      hasOverdue: true,
      remaining: 150,
    });
  });
});
