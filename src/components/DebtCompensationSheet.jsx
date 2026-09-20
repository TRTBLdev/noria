import React, { useEffect, useState, useMemo } from 'react';
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
import CurrencyAmount from './CurrencyAmount.jsx';
import { compensateDebts } from '../db/debtCompensation.js';
import { convertAmountToBase, getParityUnitsPerBase } from '../utils/currency.js';
import { ArrowLeftRight, Check, Sparkles } from 'lucide-react';

export default function DebtCompensationSheet({
  isOpen,
  onClose,
  onSaved,
  thirdParty,
  receivableDebts = [],
  payableDebts = [],
  initialReceivableId = null,
  initialPayableId = null,
  dbCurrencies = [],
  baseCurrency = '',
}) {
  const [selectedReceivableId, setSelectedReceivableId] = useState('');
  const [selectedPayableId, setSelectedPayableId] = useState('');
  const [amount, setAmount] = useState(''); // Amount in receivable debt's currency
  const [payableAmount, setPayableAmount] = useState(''); // Amount in payable debt's currency
  const [exchangeRate, setExchangeRate] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Selected debt objects
  const receivableDebt = useMemo(() => (
    receivableDebts.find(d => d.id.toString() === selectedReceivableId?.toString()) || null
  ), [receivableDebts, selectedReceivableId]);

  const payableDebt = useMemo(() => (
    payableDebts.find(d => d.id.toString() === selectedPayableId?.toString()) || null
  ), [payableDebts, selectedPayableId]);

  const isMultiCurrency = receivableDebt && payableDebt && receivableDebt.currency !== payableDebt.currency;

  // Initialize or reset when opened
  useEffect(() => {
    if (!isOpen) return;

    const defaultRecId = initialReceivableId != null
      ? initialReceivableId.toString()
      : (receivableDebts[0]?.id?.toString() || '');
    const defaultPayId = initialPayableId != null
      ? initialPayableId.toString()
      : (payableDebts[0]?.id?.toString() || '');

    setSelectedReceivableId(defaultRecId);
    setSelectedPayableId(defaultPayId);
    setDate(new Date().toISOString().slice(0, 10));
    setNote('');
    setError('');
    setSaving(false);

    const rec = receivableDebts.find(d => d.id.toString() === defaultRecId);
    const pay = payableDebts.find(d => d.id.toString() === defaultPayId);

    if (rec && pay) {
      if (rec.currency === pay.currency) {
        const maxPossible = Math.min(rec.remaining, pay.remaining);
        setAmount(maxPossible > 0 ? maxPossible.toFixed(2) : '');
        setPayableAmount(maxPossible > 0 ? maxPossible.toFixed(2) : '');
        setExchangeRate('1');
      } else {
        // Multi-currency default rate estimation
        const recBase = convertAmountToBase(1, rec.currency, baseCurrency, [], dbCurrencies);
        const payUnitsPerBase = getParityUnitsPerBase(pay.currency, dbCurrencies);
        let suggestedRate = '1';
        if (recBase && payUnitsPerBase) {
          suggestedRate = (recBase * payUnitsPerBase).toFixed(4);
        }
        setExchangeRate(suggestedRate);

        const parsedRate = parseFloat(suggestedRate) || 1;
        const recMaxIfPayableLimiting = pay.remaining / parsedRate;
        const maxRec = Math.min(rec.remaining, recMaxIfPayableLimiting);
        const maxPay = maxRec * parsedRate;

        setAmount(maxRec > 0 ? maxRec.toFixed(2) : '');
        setPayableAmount(maxPay > 0 ? maxPay.toFixed(2) : '');
      }
    } else {
      setAmount('');
      setPayableAmount('');
      setExchangeRate('1');
    }
  }, [isOpen, initialReceivableId, initialPayableId, receivableDebts, payableDebts, baseCurrency, dbCurrencies]);

  if (!isOpen) return null;

  // Handle changes in amount (receivable currency)
  const handleAmountChange = (val) => {
    setAmount(val);
    if (!isMultiCurrency) {
      setPayableAmount(val);
    } else {
      const parsedAmt = parseFloat(val);
      const parsedRate = parseFloat(exchangeRate);
      if (!isNaN(parsedAmt) && !isNaN(parsedRate) && parsedRate > 0) {
        setPayableAmount((parsedAmt * parsedRate).toFixed(2));
      } else {
        setPayableAmount('');
      }
    }
  };

  // Handle changes in exchange rate
  const handleRateChange = (val) => {
    setExchangeRate(val);
    const parsedAmt = parseFloat(amount);
    const parsedRate = parseFloat(val);
    if (!isNaN(parsedAmt) && !isNaN(parsedRate) && parsedRate > 0) {
      setPayableAmount((parsedAmt * parsedRate).toFixed(2));
    }
  };

  // Handle changes in payable amount directly (recalculates rate)
  const handlePayableAmountChange = (val) => {
    setPayableAmount(val);
    if (!isMultiCurrency) {
      setAmount(val);
    } else {
      const parsedRec = parseFloat(amount);
      const parsedPay = parseFloat(val);
      if (!isNaN(parsedRec) && !isNaN(parsedPay) && parsedRec > 0 && parsedPay > 0) {
        setExchangeRate((parsedPay / parsedRec).toFixed(4));
      }
    }
  };

  // Quick action: set maximum compensable amounts
  const handleSetMax = () => {
    if (!receivableDebt || !payableDebt) return;
    if (!isMultiCurrency) {
      const maxPossible = Math.min(receivableDebt.remaining, payableDebt.remaining);
      setAmount(maxPossible.toFixed(2));
      setPayableAmount(maxPossible.toFixed(2));
    } else {
      const parsedRate = parseFloat(exchangeRate) || 1;
      const recMaxIfPayableLimiting = payableDebt.remaining / parsedRate;
      const maxRec = Math.min(receivableDebt.remaining, recMaxIfPayableLimiting);
      const maxPay = maxRec * parsedRate;
      setAmount(maxRec.toFixed(2));
      setPayableAmount(maxPay.toFixed(2));
    }
  };

  const parsedRecAmount = parseFloat(amount) || 0;
  const parsedPayAmount = parseFloat(payableAmount) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!receivableDebt || !payableDebt) {
      setError('Debes seleccionar una deuda por cobrar y una por pagar.');
      return;
    }
    if (parsedRecAmount <= 0) {
      setError(`El monto a compensar en ${receivableDebt.currency} debe ser mayor a cero.`);
      return;
    }
    if (parsedPayAmount <= 0) {
      setError(`El monto a abonar en ${payableDebt.currency} debe ser mayor a cero.`);
      return;
    }
    if (parsedRecAmount > receivableDebt.remaining + 0.001) {
      setError(`El monto excede el saldo restante por cobrar (${receivableDebt.remaining.toFixed(2)} ${receivableDebt.currency}).`);
      return;
    }
    if (parsedPayAmount > payableDebt.remaining + 0.001) {
      setError(`El monto excede el saldo restante por pagar (${payableDebt.remaining.toFixed(2)} ${payableDebt.currency}).`);
      return;
    }

    setSaving(true);
    try {
      await compensateDebts(db, {
        receivableDebtId: receivableDebt.id,
        payableDebtId: payableDebt.id,
        receivableAmount: parsedRecAmount,
        payableAmount: parsedPayAmount,
        rate: isMultiCurrency ? (parseFloat(exchangeRate) || 1) : 1,
        rateSource: isMultiCurrency ? 'MANUAL_COMPENSATION' : 'SAME_CURRENCY',
        note: note.trim(),
        date,
      });

      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Error al procesar la compensación de deudas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`Compensar Deudas · ${thirdParty?.name || 'Tercero'}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="border border-[#9F2F2D] p-3 text-[11px] font-mono text-[#9F2F2D] bg-[#9F2F2D]/5">
            {error}
          </div>
        )}

        {/* 1. Selector Deuda Por Cobrar */}
        <FormField label="Deuda por cobrar (a saldar / reducir)" htmlFor="comp-rec-debt">
          <SelectInput
            id="comp-rec-debt"
            value={selectedReceivableId}
            onChange={e => setSelectedReceivableId(e.target.value)}
            required
          >
            {receivableDebts.map(d => (
              <option key={d.id} value={d.id}>
                {d.description} — Saldo: {d.remaining.toFixed(2)} {d.currency}
              </option>
            ))}
          </SelectInput>
        </FormField>

        {/* 2. Selector Deuda Por Pagar */}
        <FormField label="Deuda por pagar (a abonar / saldar)" htmlFor="comp-pay-debt">
          <SelectInput
            id="comp-pay-debt"
            value={selectedPayableId}
            onChange={e => setSelectedPayableId(e.target.value)}
            required
          >
            {payableDebts.map(d => (
              <option key={d.id} value={d.id}>
                {d.description} — Saldo: {d.remaining.toFixed(2)} {d.currency}
              </option>
            ))}
          </SelectInput>
        </FormField>

        {/* 3. Montos y Tasa */}
        <div className="border border-[#1A1A1A]/20 p-3 space-y-3 bg-[#1A1A1A]/[0.02]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-[700] uppercase tracking-[0.1em] text-noria-muted">
              Importes a compensar
            </span>
            <button
              type="button"
              onClick={handleSetMax}
              className="flex items-center gap-1 font-mono text-[10px] uppercase font-bold text-[#647C78] hover:underline"
            >
              <Sparkles size={12} /> Máximo posible
            </button>
          </div>

          <div className={`grid ${isMultiCurrency ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3`}>
            <FormField
              label={`Monto a descontar de la deuda por cobrar (${receivableDebt?.currency || '—'})`}
              htmlFor="comp-amount-rec"
              hint={receivableDebt ? `Máx: ${receivableDebt.remaining.toFixed(2)} ${receivableDebt.currency}` : undefined}
            >
              <NumberInput
                id="comp-amount-rec"
                value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                min="0.01"
                step="0.01"
                required
              />
            </FormField>

            {isMultiCurrency && (
              <FormField
                label={`Monto a abonar a la deuda por pagar (${payableDebt?.currency || '—'})`}
                htmlFor="comp-amount-pay"
                hint={payableDebt ? `Máx: ${payableDebt.remaining.toFixed(2)} ${payableDebt.currency}` : undefined}
              >
                <NumberInput
                  id="comp-amount-pay"
                  value={payableAmount}
                  onChange={e => handlePayableAmountChange(e.target.value)}
                  min="0.01"
                  step="0.01"
                  required
                />
              </FormField>
            )}
          </div>

          {isMultiCurrency && (
            <div className="pt-1">
              <FormField
                label={`Tasa de cambio (${payableDebt?.currency} por 1 ${receivableDebt?.currency})`}
                htmlFor="comp-rate"
                hint="Puedes editar la tasa o el monto en la otra moneda"
              >
                <NumberInput
                  id="comp-rate"
                  value={exchangeRate}
                  onChange={e => handleRateChange(e.target.value)}
                  min="0.000001"
                  step="0.0001"
                  required
                />
              </FormField>
            </div>
          )}
        </div>

        {/* 4. Resumen de Impacto */}
        {receivableDebt && payableDebt && parsedRecAmount > 0 && parsedPayAmount > 0 && (
          <div className="border border-[#647C78]/40 bg-[#647C78]/5 p-3 space-y-2 font-mono text-[11px]">
            <p className="font-[700] uppercase tracking-[0.08em] text-[#647C78]">
              Resumen del cruce:
            </p>
            <div className="space-y-1 text-noria-text">
              <div className="flex justify-between">
                <span>Por cobrar ({receivableDebt.description}):</span>
                <span>
                  <CurrencyAmount amount={receivableDebt.remaining} currencyCode={receivableDebt.currency} />
                  {' → '}
                  <CurrencyAmount amount={Math.max(0, receivableDebt.remaining - parsedRecAmount)} currencyCode={receivableDebt.currency} />
                  {receivableDebt.remaining - parsedRecAmount <= 0.001 ? ' (SALDADA)' : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Por pagar ({payableDebt.description}):</span>
                <span>
                  <CurrencyAmount amount={payableDebt.remaining} currencyCode={payableDebt.currency} />
                  {' → '}
                  <CurrencyAmount amount={Math.max(0, payableDebt.remaining - parsedPayAmount)} currencyCode={payableDebt.currency} />
                  {payableDebt.remaining - parsedPayAmount <= 0.001 ? ' (SALDADA)' : ''}
                </span>
              </div>
              <div className="flex justify-between text-noria-muted pt-1 border-t border-[#647C78]/20">
                <span>Impacto en cuentas bancarias / caja:</span>
                <span className="font-bold text-[#4F8F58]">$0.00 (Sin movimiento de fondos)</span>
              </div>
            </div>
          </div>
        )}

        {/* 5. Fecha y Nota opcional */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Fecha efectiva" htmlFor="comp-date">
            <DateInput
              id="comp-date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Nota (opcional)" htmlFor="comp-note">
            <TextInput
              id="comp-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ej. Liquidación acordada"
            />
          </FormField>
        </div>

        <FormActions
          primaryLabel={saving ? 'Procesando…' : 'Confirmar Compensación'}
          primaryDisabled={saving}
        />
      </form>
    </FormSheet>
  );
}
