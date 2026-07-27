import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  DateInput,
  FormActions,
  FormField,
  FormSheet,
  NumberInput,
  SelectInput,
  TextInput
} from './FormSystem.jsx';
import PaymentMethodSelector from './PaymentMethodSelector.jsx';
import CurrencyAmount from './CurrencyAmount.jsx';
import { consumeCurrencyLots, createCurrencyLot, stringifyLotConsumption } from '../db/currencyLots.js';
import { convertAmountToBase } from '../utils/currency.js';

// Resolve accountId from a "acc-N" or "inst-N" value
function getAccountIdFromMethod(val, instruments) {
  if (!val) return null;
  if (val.startsWith('inst-')) {
    const inst = instruments.find(i => i.id === parseInt(val.replace('inst-', ''), 10));
    return inst ? inst.accountId?.toString() : null;
  }
  return val.replace('acc-', '');
}

function getInstrumentIdFromMethod(val) {
  if (!val || !val.startsWith('inst-')) return null;
  return parseInt(val.replace('inst-', ''), 10);
}

export default function DebtPaymentSheet({
  isOpen,
  onClose,
  onSaved,
  debt,
  defaultSettle = false,
  activeAccounts = [],
  institutions = [],
  instruments = [],
  dbCurrencies = [],
}) {
  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const lotCurrencyObj = useLiveQuery(() => db.app_config.get('lotCurrency'));
  const baseCurrency = baseCurrencyObj?.value || '';
  const lotCurrency = lotCurrencyObj?.value || '';
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(''); // "acc-N" or "inst-N"
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [altCurrencyAmount, setAltCurrencyAmount] = useState('');
  const [lotExchangeRate, setLotExchangeRate] = useState('');
  const [settleDebt, setSettleDebt] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isCobrar = debt?.type === 'COBRAR';

  // Detect pending anchor (first PENDING sorted by installmentNumber)
  const pendingAnchor = debt?.isRecurring && debt?.debtAnchors
    ? [...debt.debtAnchors]
        .filter(a => a.status === 'PENDING')
        .sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0))[0] ?? null
    : null;

  const pendingAnchorLabel = pendingAnchor
    ? (pendingAnchor.installmentNumber === 0
        ? 'Inicial'
        : `Cuota ${pendingAnchor.installmentNumber}/${debt?.numberOfInstallments ?? '?'}`)
    : null;

  // Reset on open
  useEffect(() => {
    if (!isOpen || !debt) return;
    const remaining = Math.max(0, (debt.totalAmount || debt.amount || 0) - (debt.paidAmount || 0));
    const prefilledAmount = pendingAnchor ? pendingAnchor.amount : (remaining > 0 ? remaining : 0);
    setAmount(prefilledAmount > 0 ? prefilledAmount.toFixed(2) : '');
    setPaymentMethod('');
    setDate(new Date().toISOString().slice(0, 10));
    setNote('');
      setAltCurrencyAmount('');
      setLotExchangeRate('');
    setSettleDebt(defaultSettle);
    setError('');
    setSaving(false);
  }, [isOpen, debt?.id, defaultSettle]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !debt) return null;

  const remaining = Math.max(0, (debt.totalAmount || debt.amount || 0) - (debt.paidAmount || 0));

  // Resolve selected account from paymentMethod
  const resolvedAccountId = getAccountIdFromMethod(paymentMethod, instruments);
  const selectedAccount = activeAccounts.find(a => a.id.toString() === resolvedAccountId);
  const isMultiCurrency = selectedAccount && selectedAccount.currency !== debt.currency;
  const debtHasBaseConversion = convertAmountToBase(1, debt.currency, baseCurrency, [], dbCurrencies) !== null;

  const getAccountLabel = (acc) => {
    const inst = institutions.find(i => i.id === acc.institutionId);
    const typeLabel = { CHECKING: 'Corriente', SAVINGS: 'Ahorro', CREDIT: 'Crédito', CASH: 'Efectivo' }[acc.type] || acc.type;
    const baseName = inst
      ? (inst.name.toLowerCase() === acc.name.toLowerCase() ? inst.name : `${inst.name} · ${acc.name}`)
      : acc.name;
    return acc.type !== 'CASH' ? `${baseName} (${typeLabel})` : baseName;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('El monto debe ser mayor a cero.'); return; }
    if (!settleDebt && parsedAmount > remaining + 0.001) { setError(`El monto excede el saldo restante (${currencySymbol}${remaining.toFixed(2)}).`); return; }
    if (!paymentMethod) {
      setError(isCobrar ? 'Selecciona la cuenta de depósito.' : 'Selecciona el medio de pago.');
      return;
    }

    let actualAmount = parsedAmount;
    let implicitRate = null;

    if (isMultiCurrency) {
      const parsedAlt = parseFloat(altCurrencyAmount);
      if (isNaN(parsedAlt) || parsedAlt <= 0) {
        setError(`Ingresa el monto en ${selectedAccount.currency}.`);
        return;
      }
      actualAmount = parsedAlt;
      implicitRate = parsedAlt / parsedAmount;
    }

    const needsLotRate = isCobrar && selectedAccount.currency === lotCurrency && !debtHasBaseConversion;
    if (needsLotRate) {
      const parsedRate = parseFloat(lotExchangeRate);
      if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
        setError(`Ingresa la tasa ${lotCurrency}/${baseCurrency} vigente para este cobro.`);
        return;
      }
    }

    const instrumentId = getInstrumentIdFromMethod(paymentMethod);

    setSaving(true);
    try {
      await db.transaction('rw', [db.debts, db.debt_payments, db.transactions, db.accounts, db.lots, db.anchors], async () => {
        const txDate = new Date(date + 'T12:00:00');
        const txType = isCobrar ? 'IN' : 'OUT';

        // 1. debt_payment record
        await db.debt_payments.add({
          debtId: debt.id,
          anchorId: pendingAnchor?.id ?? null,
          date: txDate,
          amountPaid: parsedAmount,
          currency: debt.currency,
          exchangeRateSource: isMultiCurrency ? 'MANUAL' : null,
          implicitRate,
          paymentCurrency: isMultiCurrency ? selectedAccount.currency : null,
          paymentAmount: isMultiCurrency ? actualAmount : null,
          note: note.trim() || null,
        });

        // 2. Transaction record
        const txData = {
          date: txDate,
          type: txType,
          amount: actualAmount,
          currency: selectedAccount.currency,
          accountId: selectedAccount.id,
          instrumentId: instrumentId ?? null,
          description: isCobrar
            ? `Cobro${pendingAnchorLabel ? ` ${pendingAnchorLabel}` : ''}: ${debt.description}${note.trim() ? ` — ${note.trim()}` : ''}`
            : `Pago${pendingAnchorLabel ? ` ${pendingAnchorLabel}` : ''}: ${debt.description}${note.trim() ? ` — ${note.trim()}` : ''}`,
          debtId: debt.id,
          anchorId: pendingAnchor?.id ?? null,
        };

        const convertedAmount = convertAmountToBase(actualAmount, selectedAccount.currency, baseCurrency, [], dbCurrencies);
        if (convertedAmount !== null) {
          txData.baseAmount = convertedAmount;
          txData.baseCurrency = baseCurrency;
        }

        if (selectedAccount.currency === lotCurrency) {
          if (txType === 'OUT') {
            const consumed = await consumeCurrencyLots(db, {
              accountId: selectedAccount.id,
              currency: lotCurrency,
              amount: actualAmount,
            });
            txData.baseAmount = consumed.baseAmount;
            txData.baseCurrency = consumed.baseCurrency;
            txData.lotConsumption = stringifyLotConsumption(consumed.consumptions);
          } else {
            const debtBaseAmount = convertAmountToBase(parsedAmount, debt.currency, baseCurrency, [], dbCurrencies);
            txData.baseAmount = debtBaseAmount ?? actualAmount / parseFloat(lotExchangeRate);
            txData.baseCurrency = baseCurrency;
          }
        }

        const transactionId = await db.transactions.add(txData);

        if (selectedAccount.currency === lotCurrency && txType === 'IN') {
          await createCurrencyLot(db, {
            transactionId,
            accountId: selectedAccount.id,
            currency: lotCurrency,
            amount: actualAmount,
            costCurrency: baseCurrency,
            costAmount: txData.baseAmount,
            date: txDate,
            sourceType: 'DEBT_PAYMENT',
          });
        }

        // 3. Update account balance
        const delta = txType === 'IN' ? actualAmount : -actualAmount;
        await db.accounts.update(selectedAccount.id, {
          balance: selectedAccount.balance + delta,
        });

        // 4. Mark pending anchor as PAID
        if (pendingAnchor) {
          await db.anchors.update(pendingAnchor.id, { status: 'PAID' });
        }

        // 5. Update debt paidAmount and status
        const newPaidAmount = (debt.paidAmount || 0) + parsedAmount;
        const totalAmount = debt.totalAmount || debt.amount || 0;
        const isSettled = settleDebt || newPaidAmount >= totalAmount - 0.001;
        const debtUpdate = { paidAmount: newPaidAmount };
        if (debt.isRecurring) {
          debtUpdate.paidInstallments = (debt.paidInstallments || 0) + 1;
        }
        if (isSettled) {
          debtUpdate.status = 'SETTLED';
          debtUpdate.settledDate = txDate;
        }
        await db.debts.update(debt.id, debtUpdate);
      });

      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Error registering payment:', err);
      setError(err.message || 'Error al registrar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const sheetTitle = isCobrar ? 'Registrar Ingreso' : 'Registrar Gasto';
  const selectorLabel = isCobrar ? 'Cuenta de depósito' : 'Medio de pago';

  return (
    <FormSheet title={sheetTitle} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4" id="debt-payment-form">

        {/* Debt summary */}
        <div className="border border-[rgba(26,26,26,0.16)] p-3 space-y-1">
          <p className="font-mono text-[9px] font-[700] uppercase tracking-[0.14em] text-noria-text/60">
            {isCobrar ? 'Deuda por cobrar' : 'Deuda por pagar'}
          </p>
          <p className="text-[14px] font-[600] text-noria-text">{debt.description}</p>
          <div className="font-mono text-[11px] text-noria-muted flex gap-3">
            <span>Total: <CurrencyAmount amount={debt.totalAmount || debt.amount || 0} currencyCode={debt.currency} /></span>
            <span>Restante: <CurrencyAmount amount={remaining} currencyCode={debt.currency} /></span>
          </div>
        </div>

        {/* Pending anchor chip */}
        {pendingAnchor && (
          <div className="border border-[rgba(26,26,26,0.24)] bg-[rgba(26,26,26,0.04)] px-3 py-2 space-y-0.5">
            <p className="font-mono text-[9px] font-[700] uppercase tracking-[0.14em] text-noria-text/50">
              {isCobrar ? 'Cobro pendiente' : 'Cuota pendiente'}
            </p>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[12px] font-[700] text-noria-text">{pendingAnchorLabel}</span>
              <CurrencyAmount 
                amount={pendingAnchor.amount} 
                currencyCode={debt.currency} 
                className="font-mono text-[12px] font-[600] text-noria-text" 
              />
            </div>
            {pendingAnchor.nextDueDate && (
              <p className="font-mono text-[10px] text-noria-muted">
                Vence: {new Date(pendingAnchor.nextDueDate).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
        )}

        <FormField label={`Monto (${debt.currency})`} htmlFor="payment-amount">
          <NumberInput
            id="payment-amount"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            required
            autoFocus
          />
        </FormField>

        {/* Payment method / deposit account selector */}
        <PaymentMethodSelector
          value={paymentMethod}
          onChange={e => { setPaymentMethod(e.target.value); setAltCurrencyAmount(''); }}
          isCobrar={isCobrar}
          activeAccounts={activeAccounts}
          instruments={instruments}
          required={true}
        />

        {/* Multi-currency: implicit rate */}
        {isMultiCurrency && (
          <div className="space-y-2 animate-fade-in">
            <FormField label={`Monto en ${selectedAccount.currency}`} htmlFor="payment-alt-amount">
              <NumberInput
                id="payment-alt-amount"
                step="0.01"
                inputMode="decimal"
                value={altCurrencyAmount}
                onChange={e => setAltCurrencyAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </FormField>
            {altCurrencyAmount && amount && (
              <div className="font-mono text-[10px] text-noria-muted uppercase tracking-[0.08em] pl-1">
                Tasa efectiva: {(parseFloat(altCurrencyAmount) / parseFloat(amount)).toFixed(4)} {selectedAccount.currency}/{debt.currency}
              </div>
            )}
          </div>
        )}

        {isCobrar && selectedAccount?.currency === lotCurrency && !debtHasBaseConversion && (
          <FormField label={`Tasa ${lotCurrency}/${baseCurrency}`} htmlFor="payment-lot-rate" hint={`${lotCurrency} por cada ${baseCurrency} en la fecha del cobro`}>
            <NumberInput
              id="payment-lot-rate"
              step="any"
              inputMode="decimal"
              value={lotExchangeRate}
              onChange={e => setLotExchangeRate(e.target.value)}
              placeholder="0.00"
              required
            />
          </FormField>
        )}

        <FormField label="Fecha" htmlFor="payment-date">
          <DateInput id="payment-date" value={date} onChange={e => setDate(e.target.value)} required />
        </FormField>

        <FormField label="Nota" htmlFor="payment-note" hint="Opcional">
          <TextInput
            id="payment-note"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ej. Transferencia Zinli, pago parcial"
          />
        </FormField>

        {/* Settle switch */}
        {remaining > 0 && (
          <div className="flex items-center justify-between py-2 border-t border-b border-[rgba(26,26,26,0.16)]">
            <span className="font-mono text-[10px] font-[700] uppercase tracking-[0.1em] text-noria-text/60">
              Saldar deuda completamente
            </span>
            <button
              type="button"
              onClick={() => setSettleDebt(v => !v)}
              className="w-10 h-5 border border-[#1A1A1A] relative flex items-center focus:outline-none"
              style={{ background: 'transparent' }}
            >
              <span
                className="absolute w-2 h-full transition-all duration-150"
                style={{
                  left: settleDebt ? '60%' : '10%',
                  background: settleDebt ? '#647C78' : '#1A1A1A',
                }}
              />
            </button>
          </div>
        )}

        {error && <p className="text-[12px] font-[500] text-[#9F2F2D]">{error}</p>}

        <FormActions
          primaryLabel={saving ? 'Registrando...' : (isCobrar ? 'Registrar Cobro' : 'Registrar Pago')}
        />
      </form>
    </FormSheet>
  );
}
