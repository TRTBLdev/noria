import { describe, expect, it } from 'vitest';
import {
  allocateAmount,
  assertAmountsEqual,
  getReceiptAllocationBuckets,
  getSharedConsumptionShares,
} from '../src/utils/moneyAllocation.js';
import { getGoalPeriodStatus } from '../src/db/spendingGoals.js';
import { resolveApplicationEquivalent } from '../src/db/transactionApplications.js';

describe('distribucion monetaria', () => {
  it('reparte por unidades minimas sin perder centavos', () => {
    const shares = allocateAmount(16, [10, 10, 10], 2);
    expect(shares).toEqual([5.34, 5.33, 5.33]);
    expect(() => assertAmountsEqual(shares.reduce((sum, value) => sum + value, 0), 16, 2)).not.toThrow();
  });

  it('respeta el orden de equivalencias historicas', () => {
    expect(resolveApplicationEquivalent({
      transaction: { amount: 10, currency: 'USD' }, targetCurrency: 'USD', baseCurrency: 'VES', currencies: [],
    }).rateSource).toBe('SAME_CURRENCY');

    expect(resolveApplicationEquivalent({
      transaction: { amount: 10, currency: 'USD', invoiceCurrency: 'VES', invoiceSettlementAmount: 360 },
      targetCurrency: 'VES', baseCurrency: 'VES', currencies: [],
    })).toMatchObject({ targetAmount: 360, rateSource: 'INVOICE' });

    expect(resolveApplicationEquivalent({
      transaction: { amount: 10, currency: 'USD', baseAmount: 350, baseCurrency: 'VES', lotConsumption: '[{}]' },
      targetCurrency: 'VES', baseCurrency: 'VES', currencies: [],
    })).toMatchObject({ targetAmount: 350, rateSource: 'FIFO' });

    expect(resolveApplicationEquivalent({
      transaction: { amount: 100, currency: 'VES' },
      targetCurrency: 'COP', baseCurrency: 'VES',
      currencies: [{ code: 'COP', baseRelation: 'PARITY', unitsPerBase: 4 }],
    })).toMatchObject({ targetAmount: 400, rateSource: 'PARITY' });

    expect(resolveApplicationEquivalent({
      transaction: { amount: 7, currency: 'XYZ' }, targetCurrency: 'ABC', baseCurrency: 'VES', currencies: [], manualTargetAmount: 91,
    })).toMatchObject({ targetAmount: 91, rateSource: 'MANUAL' });
  });

  it('cierra periodos incompletos sin arrastrar progreso', () => {
    const period = { targetAmount: 100, endDate: '2026-06-30' };
    expect(getGoalPeriodStatus(period, 25, new Date('2026-07-02T12:00:00'))).toBe('PARTIAL');
    expect(getGoalPeriodStatus(period, 0, new Date('2026-07-02T12:00:00'))).toBe('EXPIRED');
    expect(getGoalPeriodStatus(period, 125, new Date('2026-06-15T12:00:00'))).toBe('COMPLETED');
  });

  it('calcula los restantes fiscales usando unidades monetarias enteras', () => {
    expect(getReceiptAllocationBuckets({
      hasTaxBreakdown: true,
      taxableBase: 3503.75,
      exemptBase: 0,
      parts: [{ amount: 1652.72, taxTreatment: 'TAXABLE' }],
      decimals: 2,
    })).toEqual([
      { key: 'TAXABLE', taxTreatment: 'TAXABLE', total: 3503.75, assigned: 1652.72, remaining: 1851.03, overage: 0 },
      { key: 'EXEMPT', taxTreatment: 'EXEMPT', total: 0, assigned: 0, remaining: 0, overage: 0 },
    ]);

    expect(getReceiptAllocationBuckets({
      hasTaxBreakdown: false,
      invoiceTotal: 50,
      parts: [{ amount: 20 }],
      decimals: 2,
    })[0]).toMatchObject({ remaining: 30, overage: 0 });

    expect(getReceiptAllocationBuckets({
      hasTaxBreakdown: true,
      taxableBase: 100,
      exemptBase: 50,
      parts: [
        { amount: 101, taxTreatment: 'TAXABLE' },
        { amount: 50, taxTreatment: 'EXEMPT' },
      ],
      decimals: 2,
    })).toEqual([
      { key: 'TAXABLE', taxTreatment: 'TAXABLE', total: 100, assigned: 101, remaining: 0, overage: 1 },
      { key: 'EXEMPT', taxTreatment: 'EXEMPT', total: 50, assigned: 50, remaining: 0, overage: 0 },
    ]);
  });

  it('calcula mi consumo como resto y detecta cuando los consumos ajenos exceden el subtotal', () => {
    expect(getSharedConsumptionShares({
      subtotal: 100,
      participantAmounts: ['', 40],
      splitMethod: 'MANUAL',
      decimals: 2,
    })).toEqual({ shares: [60, 40], overage: 0 });

    expect(getSharedConsumptionShares({
      subtotal: 100,
      participantAmounts: ['', 60, 50],
      splitMethod: 'MANUAL',
      decimals: 2,
    })).toEqual({ shares: [0, 60, 50], overage: 10 });
  });
});
