import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import CategorySelect from './CategorySelect.jsx';
import NoriaSwitch from './NoriaSwitch.jsx';
import PaymentMethodSelector from './PaymentMethodSelector.jsx';
import { consumeCurrencyLots, createCurrencyLot, stringifyLotConsumption } from '../db/currencyLots.js';
import { formatAmountWithSymbol } from '../utils/format.js';
import { convertAmountToBase } from '../utils/currency.js';
import {
  DateInput,
  FormActions,
  FormField,
  FormSheet,
  NumberInput,
  SegmentedChoice,
  SelectInput,
  TextInput
} from './FormSystem.jsx';

export default function DebtFormSheet({
  isOpen,
  onClose,
  onSaved,
  debt = null,
  activeAccounts = [],
  institutions = [],
  tags = [],
  dbCurrencies = [],
}) {
  const thirdParties = useLiveQuery(() => db.third_parties.orderBy('name').toArray()) || [];
  const instruments = useLiveQuery(() => db.instruments.toArray()) || [];
  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const lotCurrencyObj = useLiveQuery(() => db.app_config.get('lotCurrency'));
  const baseCurrency = baseCurrencyObj?.value || '';
  const lotCurrency = lotCurrencyObj?.value || '';

  // Form state
  const [description, setDescription] = useState('');
  const [type, setType] = useState('PAGAR');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [createdAtDate, setCreatedAtDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [thirdPartyInput, setThirdPartyInput] = useState('');
  const [selectedThirdPartyId, setSelectedThirdPartyId] = useState('');
  const [showThirdPartySuggestions, setShowThirdPartySuggestions] = useState(false);
  const [hasInitialMovement, setHasInitialMovement] = useState(false);
  const [movementPaymentMethod, setMovementPaymentMethod] = useState('');
  const [movementCurrencyAmount, setMovementCurrencyAmount] = useState('');
  const [movementExchangeRate, setMovementExchangeRate] = useState('');

  // Installment state
  const [isInstallment, setIsInstallment] = useState(false);
  const [initialAmount, setInitialAmount] = useState('');
  const [initialPercent, setInitialPercent] = useState('0');
  const [numberOfInstallments, setNumberOfInstallments] = useState('');
  const [frequencyInterval, setFrequencyInterval] = useState('1');
  const [frequencyUnit, setFrequencyUnit] = useState('MONTHS');
  const [firstInstallmentDate, setFirstInstallmentDate] = useState('');
  const [installmentTagId, setInstallmentTagId] = useState('');

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = !!debt;

  // Reset form on open/close
  useEffect(() => {
    if (!isOpen) return;

    if (debt) {
      setDescription(debt.description || '');
      setType(debt.type || 'PAGAR');
      setAmount(debt.totalAmount?.toString() || debt.amount?.toString() || '');
      setCurrency(debt.currency || baseCurrency);
      setDueDate(debt.dueDate ? new Date(debt.dueDate).toISOString().slice(0, 10) : '');
      setCreatedAtDate(debt.createdAt ? new Date(debt.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
      setIsInstallment(!!debt.isRecurring);

      // Resolve third party name
      if (debt.thirdPartyId) {
        const tp = thirdParties.find(t => t.id === debt.thirdPartyId);
        setThirdPartyInput(tp ? tp.name : '');
        setSelectedThirdPartyId(debt.thirdPartyId.toString());
      } else {
        setThirdPartyInput('');
        setSelectedThirdPartyId('');
      }

      if (debt.isRecurring) {
        const initAmt = debt.initialAmount || 0;
        const totAmt = debt.totalAmount || debt.amount || 1;
        setInitialAmount(initAmt.toString());
        setInitialPercent(((initAmt / totAmt) * 100).toFixed(0));
        setNumberOfInstallments(debt.numberOfInstallments?.toString() || '');
        setFrequencyInterval(debt.frequencyInterval?.toString() || '1');
        setFrequencyUnit(debt.frequencyUnit || 'MONTHS');
      }
    } else {
      setDescription('');
      setType('PAGAR');
      setAmount('');
      setCurrency(baseCurrency);
      setDueDate('');
      setCreatedAtDate(new Date().toISOString().slice(0, 10));
      setThirdPartyInput('');
      setSelectedThirdPartyId('');
      setIsInstallment(false);
      setInitialAmount('');
      setInitialPercent('0');
      setNumberOfInstallments('');
      setFrequencyInterval('1');
      setFrequencyUnit('MONTHS');
      setFirstInstallmentDate(new Date().toISOString().slice(0, 10));
      setInstallmentTagId('');
      setHasInitialMovement(false);
      setMovementPaymentMethod('');
      setMovementCurrencyAmount('');
      setMovementExchangeRate('');
    }

    setError('');
    setSaving(false);
    setShowThirdPartySuggestions(false);
  }, [isOpen, debt, baseCurrency]);

  if (!isOpen) return null;

  const activeCurrencies = dbCurrencies.filter(c => c.isActive);

  const getAccountLabel = (acc) => {
    const inst = institutions.find(i => i.id === acc.institutionId);
    const typeLabel = { CHECKING: 'Corriente', SAVINGS: 'Ahorro', CREDIT: 'Crédito', CASH: 'Efectivo' }[acc.type] || acc.type;
    const baseName = inst
      ? (inst.name.toLowerCase() === acc.name.toLowerCase() ? inst.name : `${inst.name} · ${acc.name}`)
      : acc.name;
    return acc.type !== 'CASH' ? `${baseName} (${typeLabel})` : baseName;
  };

  const getAccountIdFromPaymentMethod = (val) => {
    if (!val) return '';
    if (val.startsWith('inst-')) {
      const instId = parseInt(val.replace('inst-', ''), 10);
      const inst = instruments.find(i => i.id === instId);
      return inst ? inst.accountId.toString() : '';
    } else if (val.startsWith('acc-')) {
      return val.replace('acc-', '');
    }
    return '';
  };

  const getInstrumentIdFromPaymentMethod = (val) => {
    if (val && val.startsWith('inst-')) {
      return parseInt(val.replace('inst-', ''), 10);
    }
    return null;
  };

  const handleInitialAmountChange = (val) => {
    setInitialAmount(val);
    const parsedTotal = parseFloat(amount) || 0;
    const parsedInit = parseFloat(val) || 0;
    if (parsedTotal > 0) {
      setInitialPercent(Math.round((parsedInit / parsedTotal) * 100).toString());
    } else {
      setInitialPercent('0');
    }
  };

  const handleInitialPercentChange = (val) => {
    setInitialPercent(val);
    const parsedTotal = parseFloat(amount) || 0;
    const pct = parseFloat(val) || 0;
    if (parsedTotal > 0) {
      setInitialAmount(((parsedTotal * pct) / 100).toFixed(2));
    } else {
      setInitialAmount('0');
    }
  };

  // Third party autocomplete
  const filteredThirdParties = thirdPartyInput.trim()
    ? thirdParties.filter(tp => tp.name.toLowerCase().includes(thirdPartyInput.trim().toLowerCase()))
    : thirdParties;
  const exactMatch = thirdParties.find(tp => tp.name.toLowerCase() === thirdPartyInput.trim().toLowerCase());

  const calculateDueDate = (startDate, index, interval, unit) => {
    const d = new Date(startDate + 'T12:00:00');
    const intVal = parseInt(interval, 10);
    const offset = (index + 1) * intVal;
    switch (unit) {
      case 'DAYS': d.setDate(d.getDate() + offset); break;
      case 'WEEKS': d.setDate(d.getDate() + (offset * 7)); break;
      case 'MONTHS': d.setMonth(d.getMonth() + offset); break;
      case 'YEARS': d.setFullYear(d.getFullYear() + offset); break;
      default: d.setMonth(d.getMonth() + offset);
    }
    return d.toISOString().slice(0, 10);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const parsedAmount = parseFloat(amount);
    if (!description.trim()) { setError('La descripción es obligatoria.'); return; }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('El monto debe ser mayor a cero.'); return; }

    let parsedInitial = 0;
    let parsedInstallments = 0;

    if (isInstallment) {
      parsedInitial = parseFloat(initialAmount) || 0;
      parsedInstallments = parseInt(numberOfInstallments, 10);

      if (parsedInitial < 0) { setError('La inicial no puede ser negativa.'); return; }
      if (parsedInitial >= parsedAmount) { setError('La inicial debe ser menor al monto total.'); return; }
      if (isNaN(parsedInstallments) || parsedInstallments <= 0) { setError('El número de cuotas debe ser mayor a cero.'); return; }
      if (!firstInstallmentDate) { setError('Ingresa la fecha de la primera cuota.'); return; }
    }

    if (!isEdit && !isInstallment && hasInitialMovement) {
      if (!movementPaymentMethod) {
        setError(type === 'PAGAR' ? 'Selecciona la cuenta de depósito.' : 'Selecciona el medio de pago.');
        return;
      }
      const movementAccountIdResolved = getAccountIdFromPaymentMethod(movementPaymentMethod);
      const movementAccount = activeAccounts.find(a => a.id.toString() === movementAccountIdResolved);
      if (movementAccount && movementAccount.currency !== currency) {
        const parsedMovementAmount = parseFloat(movementCurrencyAmount);
        if (isNaN(parsedMovementAmount) || parsedMovementAmount <= 0) {
          setError(`Ingresa el monto equivalente en ${movementAccount.currency}.`);
          return;
        }
      }
      const debtBaseAmount = convertAmountToBase(parsedAmount, currency, baseCurrency, [], dbCurrencies);
      if (movementAccount?.currency === lotCurrency && debtBaseAmount === null) {
        const parsedRate = parseFloat(movementExchangeRate);
        if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
          setError(`Ingresa la tasa ${lotCurrency}/${baseCurrency} vigente para el movimiento.`);
          return;
        }
      }
    }

    setSaving(true);

    try {
      await db.transaction('rw', [db.debts, db.debt_payments, db.third_parties, db.transactions, db.accounts, db.anchors, db.lots], async () => {
        // Resolve third party
        let resolvedThirdPartyId = selectedThirdPartyId ? parseInt(selectedThirdPartyId) : null;
        if (thirdPartyInput.trim() && !resolvedThirdPartyId) {
          const match = thirdParties.find(tp => tp.name.toLowerCase() === thirdPartyInput.trim().toLowerCase());
          if (match) {
            resolvedThirdPartyId = match.id;
          } else {
            resolvedThirdPartyId = await db.third_parties.add({ name: thirdPartyInput.trim() });
          }
        }

        if (isEdit) {
          // Update existing debt
          await db.debts.update(debt.id, {
            description: description.trim(),
            type,
            totalAmount: parsedAmount,
            amount: parsedAmount,
            currency,
            dueDate: dueDate ? new Date(dueDate + 'T12:00:00') : null,
            thirdPartyId: resolvedThirdPartyId,
            createdAt: createdAtDate ? new Date(createdAtDate + 'T12:00:00') : new Date(),
          });
        } else {
          // Create new debt
          const debtData = {
            description: description.trim(),
            type,
            totalAmount: parsedAmount,
            amount: parsedAmount,
            currency,
            status: 'ACTIVE',
            dueDate: dueDate ? new Date(dueDate + 'T12:00:00') : null,
            thirdPartyId: resolvedThirdPartyId,
            isRecurring: isInstallment,
            createdAt: createdAtDate ? new Date(createdAtDate + 'T12:00:00') : new Date(),
          };

          if (isInstallment) {
            debtData.numberOfInstallments = parsedInstallments;
            debtData.paidInstallments = parsedInitial > 0 ? 0 : 0;
            debtData.frequencyInterval = parseInt(frequencyInterval, 10);
            debtData.frequencyUnit = frequencyUnit;
            debtData.initialAmount = parsedInitial;
          }

          const newDebtId = await db.debts.add(debtData);

          if (!isEdit && !isInstallment && hasInitialMovement) {
            const movementAccountIdResolved = getAccountIdFromPaymentMethod(movementPaymentMethod);
            const movementInstrumentIdResolved = getInstrumentIdFromPaymentMethod(movementPaymentMethod);
            const movementAccount = activeAccounts.find(a => a.id.toString() === movementAccountIdResolved);
            if (movementAccount) {
              const isPagar = type === 'PAGAR';
              // For "Por Pagar" (Tú debes): Money entered your account (IN)
              // For "Por Cobrar" (Te deben): Money left your account (OUT)
              const txType = isPagar ? 'IN' : 'OUT';
              const txDate = createdAtDate ? new Date(createdAtDate + 'T12:00:00') : new Date();

              let txAmount = parsedAmount;
              if (movementAccount.currency !== currency) {
                txAmount = parseFloat(movementCurrencyAmount);
              }

              const txData = {
                date: txDate,
                type: txType,
                amount: txAmount,
                currency: movementAccount.currency,
                accountId: movementAccount.id,
                instrumentId: movementInstrumentIdResolved,
                description: description.trim(),
                debtId: newDebtId,
                thirdPartyId: resolvedThirdPartyId,
                cashflowKind: isPagar ? 'LOAN_PROCEEDS' : 'LOAN_DISBURSEMENT',
              };

              const convertedAmount = convertAmountToBase(txAmount, movementAccount.currency, baseCurrency, [], dbCurrencies);
              if (convertedAmount !== null) {
                txData.baseAmount = convertedAmount;
                txData.baseCurrency = baseCurrency;
              }

              if (txType === 'OUT' && movementAccount.currency === lotCurrency) {
                const consumed = await consumeCurrencyLots(db, {
                  accountId: movementAccount.id,
                  currency: lotCurrency,
                  amount: txAmount,
                });
                txData.baseAmount = consumed.baseAmount;
                txData.baseCurrency = consumed.baseCurrency;
                txData.lotConsumption = stringifyLotConsumption(consumed.consumptions);
              }

              if (txType === 'IN' && movementAccount.currency === lotCurrency) {
                const debtBaseAmount = convertAmountToBase(parsedAmount, currency, baseCurrency, [], dbCurrencies);
                txData.baseAmount = debtBaseAmount ?? txAmount / parseFloat(movementExchangeRate);
                txData.baseCurrency = baseCurrency;
              }

              const txId = await db.transactions.add(txData);

              // Update account balance (IN adds, OUT subtracts)
              const balanceDelta = txType === 'IN' ? txAmount : -txAmount;
              await db.accounts.update(movementAccount.id, {
                balance: movementAccount.balance + balanceDelta,
              });

              if (txType === 'IN' && movementAccount.currency === lotCurrency) {
                await createCurrencyLot(db, {
                  transactionId: txId,
                  accountId: movementAccount.id,
                  currency: lotCurrency,
                  amount: txAmount,
                  costCurrency: baseCurrency,
                  costAmount: txData.baseAmount,
                  date: txDate,
                  sourceType: 'LOAN',
                });
              }
            }
          }



          // Generate anchors for each installment
          if (isInstallment) {
            // 1. Generate anchor for Initial payment (if exists)
            if (parsedInitial > 0) {
              await db.anchors.add({
                name: `Inicial - ${description.trim()}`,
                type: 'FIXED',
                amount: parsedInitial,
                currency: currency,
                accountId: null,
                instrumentId: null,
                nextDueDate: createdAtDate ? new Date(createdAtDate + 'T12:00:00') : new Date(),
                status: 'PENDING',
                tagId: installmentTagId ? parseInt(installmentTagId, 10) : null,
                debtId: newDebtId,
                installmentNumber: 0, // Ordered first
                isTemplate: false,
              });
            }

            // 2. Generate anchors for installments
            const installmentAmount = (parsedAmount - parsedInitial) / parsedInstallments;
            for (let i = 0; i < parsedInstallments; i++) {
              const dueDateStr = calculateDueDate(firstInstallmentDate, i, frequencyInterval, frequencyUnit);
              await db.anchors.add({
                name: `${description.trim()} - Cuota ${i + 1}/${parsedInstallments}`,
                type: 'FIXED',
                amount: parseFloat(installmentAmount.toFixed(2)),
                currency: currency,
                accountId: null,
                instrumentId: null,
                nextDueDate: new Date(dueDateStr + 'T12:00:00'),
                status: 'PENDING',
                tagId: installmentTagId ? parseInt(installmentTagId, 10) : null,
                debtId: newDebtId,
                installmentNumber: i + 1,
                isTemplate: false,
                frequencyInterval: parseInt(frequencyInterval, 10),
                frequencyUnit: frequencyUnit,
              });
            }
          }
        }
      });

      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Error saving debt:', err);
      setError(err.message || 'Error al guardar la deuda. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const typeOptions = [
    { value: 'PAGAR', label: 'Por Pagar', color: '#9F2F2D' },
    { value: 'COBRAR', label: 'Por Cobrar', color: '#4F8F58' },
  ];

  const pillarOptions = [
    { value: 'NEED', label: 'Necesidad', color: '#4F8F58' },
    { value: 'WANT', label: 'Deseo', color: '#3F7F9C' },
  ];

  return (
    <FormSheet title={isEdit ? 'Editar Deuda' : 'Nueva Deuda'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4" id="debt-form">
        <FormField label="Descripción" htmlFor="debt-description">
          <TextInput
            id="debt-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Ej. iPhone Cashea, Préstamo a María"
            required
            autoFocus={!isEdit}
          />
        </FormField>

        <SegmentedChoice
          label="Tipo"
          value={type}
          onChange={setType}
          options={typeOptions}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Monto total" htmlFor="debt-amount">
            <NumberInput
              id="debt-amount"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </FormField>
          <FormField label="Moneda" htmlFor="debt-currency">
            <SelectInput id="debt-currency" value={currency} onChange={e => setCurrency(e.target.value)}>
              {activeCurrencies.map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </SelectInput>
          </FormField>
        </div>

        {/* Third Party with autocomplete */}
        <FormField label="Tercero / Contacto" htmlFor="debt-third-party">
          <div className="relative">
            <TextInput
              id="debt-third-party"
              value={thirdPartyInput}
              onChange={e => {
                setThirdPartyInput(e.target.value);
                setSelectedThirdPartyId('');
                setShowThirdPartySuggestions(true);
              }}
              onFocus={() => setShowThirdPartySuggestions(true)}
              onBlur={() => setTimeout(() => setShowThirdPartySuggestions(false), 200)}
              placeholder="Ej. María, Cashea, Carlos"
            />
            {showThirdPartySuggestions && thirdPartyInput.trim() && filteredThirdParties.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 max-h-32 overflow-y-auto border border-[#1A1A1A] bg-[#F5F2ED]">
                {filteredThirdParties.map(tp => (
                  <button
                    key={tp.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-[12px] font-mono hover:bg-noria-text/5 focus:outline-none"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setThirdPartyInput(tp.name);
                      setSelectedThirdPartyId(tp.id.toString());
                      setShowThirdPartySuggestions(false);
                    }}
                  >
                    {tp.name}
                  </button>
                ))}
              </div>
            )}
            {thirdPartyInput.trim() && !exactMatch && (
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-noria-muted">
                Se creará como nuevo tercero
              </p>
            )}
          </div>
        </FormField>



        <div className="grid grid-cols-2 gap-4">
          <FormField label="Fecha de Registro" htmlFor="debt-created-at">
            <DateInput
              id="debt-created-at"
              value={createdAtDate}
              onChange={e => setCreatedAtDate(e.target.value)}
              required
            />
          </FormField>
          {!isInstallment ? (
            <FormField label="Fecha de vencimiento" htmlFor="debt-due-date" hint="Opcional">
              <DateInput id="debt-due-date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </FormField>
          ) : (
            <div />
          )}
        </div>

        {!isEdit && !isInstallment && (
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-t border-b border-[rgba(26,26,26,0.16)]">
              <span className="font-mono text-[10px] font-[700] uppercase tracking-[0.1em] text-noria-text/60">
                {type === 'PAGAR' ? 'Ingreso en cuenta (me prestaron dinero)' : 'Egreso de cuenta (presté dinero)'}
              </span>
              <NoriaSwitch
                checked={hasInitialMovement}
                onChange={() => {
                  setHasInitialMovement(v => !v);
                  setMovementPaymentMethod('');
                  setMovementCurrencyAmount('');
                  setMovementExchangeRate('');
                }}
              />
            </div>

            {hasInitialMovement && (
              <div className="space-y-4 animate-fade-in">
                <PaymentMethodSelector
                  value={movementPaymentMethod}
                  onChange={e => {
                    setMovementPaymentMethod(e.target.value);
                    setMovementCurrencyAmount('');
                  }}
                  isCobrar={type === 'PAGAR'}
                  activeAccounts={activeAccounts}
                  instruments={instruments}
                  required={true}
                />

                {(() => {
                  const movementAccountIdResolved = getAccountIdFromPaymentMethod(movementPaymentMethod);
                  const movementAccount = activeAccounts.find(a => a.id.toString() === movementAccountIdResolved);
                  const isMultiCurrency = movementAccount && movementAccount.currency !== currency;
                  if (!isMultiCurrency) return null;

                  return (
                    <div className="space-y-2">
                      <FormField
                        label={`Monto en ${movementAccount.currency}`}
                        htmlFor="debt-movement-currency-amount"
                        hint={`Monto equivalente en ${movementAccount.currency}`}
                      >
                        <NumberInput
                          id="debt-movement-currency-amount"
                          value={movementCurrencyAmount}
                          onChange={e => setMovementCurrencyAmount(e.target.value)}
                          placeholder="0.00"
                          step="any"
                          required
                        />
                      </FormField>
                      {movementCurrencyAmount && amount && (
                        <div className="font-mono text-[10px] text-noria-muted uppercase tracking-[0.08em] mt-1 pl-1">
                          Tasa efectiva: {(parseFloat(movementCurrencyAmount) / parseFloat(amount)).toFixed(4)} {movementAccount.currency}/{currency}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {(() => {
                  const movementAccountIdResolved = getAccountIdFromPaymentMethod(movementPaymentMethod);
                  const movementAccount = activeAccounts.find(a => a.id.toString() === movementAccountIdResolved);
                  const debtBaseAmount = convertAmountToBase(Number(amount), currency, baseCurrency, [], dbCurrencies);
                  if (movementAccount?.currency !== lotCurrency || debtBaseAmount !== null) return null;
                  return (
                    <FormField label={`Tasa ${lotCurrency}/${baseCurrency}`} htmlFor="debt-movement-exchange-rate" hint={`${lotCurrency} por cada ${baseCurrency} en la fecha del movimiento`}>
                      <NumberInput
                        id="debt-movement-exchange-rate"
                        value={movementExchangeRate}
                        onChange={e => setMovementExchangeRate(e.target.value)}
                        placeholder="0.00"
                        step="any"
                        required
                      />
                    </FormField>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Installment toggle */}
        {!isEdit && (
          <div className="flex items-center justify-between py-2 border-t border-b border-[rgba(26,26,26,0.16)]">
            <span className="font-mono text-[10px] font-[700] uppercase tracking-[0.1em] text-noria-text/60">
              Deuda en cuotas
            </span>
            <NoriaSwitch checked={isInstallment} onChange={() => setIsInstallment(v => !v)} />
          </div>
        )}

        {/* Installment fields */}
        {isInstallment && !isEdit && (
          <div className="space-y-4 pt-2 animate-fade-in">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Monto inicial" htmlFor="debt-initial" hint="Manual">
                <NumberInput
                  id="debt-initial"
                  step="0.01"
                  inputMode="decimal"
                  value={initialAmount}
                  onChange={e => handleInitialAmountChange(e.target.value)}
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="Inicial %" htmlFor="debt-initial-percent" hint="Porcentaje">
                <NumberInput
                  id="debt-initial-percent"
                  min="0"
                  max="100"
                  step="1"
                  value={initialPercent}
                  onChange={e => handleInitialPercentChange(e.target.value)}
                  placeholder="0"
                />
              </FormField>
            </div>

            <FormField label="N° de cuotas" htmlFor="debt-installments">
              <NumberInput
                id="debt-installments"
                min="1"
                step="1"
                value={numberOfInstallments}
                onChange={e => setNumberOfInstallments(e.target.value)}
                placeholder="6"
                required
              />
            </FormField>



            <div className="grid grid-cols-2 gap-4">
              <FormField label="Repetir cada" htmlFor="debt-freq-interval">
                <NumberInput
                  id="debt-freq-interval"
                  min="1"
                  step="1"
                  value={frequencyInterval}
                  onChange={e => setFrequencyInterval(e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Unidad" htmlFor="debt-freq-unit">
                <SelectInput id="debt-freq-unit" value={frequencyUnit} onChange={e => setFrequencyUnit(e.target.value)} required>
                  <option value="DAYS">Días</option>
                  <option value="WEEKS">Semanas</option>
                  <option value="MONTHS">Meses</option>
                  <option value="YEARS">Años</option>
                </SelectInput>
              </FormField>
            </div>

            <FormField label="Fecha primera cuota" htmlFor="debt-first-date">
              <DateInput
                id="debt-first-date"
                value={firstInstallmentDate}
                onChange={e => setFirstInstallmentDate(e.target.value)}
                required
              />
            </FormField>

            <CategorySelect
              id="debt-installment-category"
              value={installmentTagId}
              onChange={setInstallmentTagId}
              tags={tags}
              kind="EXPENSE"
              className="max-w-[320px]"
            />

            {/* Preview */}
            {amount && numberOfInstallments && (
              <div className="border border-[rgba(26,26,26,0.16)] p-3 space-y-1 bg-[rgba(26,26,26,0.01)]">
                <p className="font-mono text-[9px] font-[700] uppercase tracking-[0.14em] text-noria-text/60">Vista previa del Financiamiento</p>
                <div className="font-mono text-[11px] text-noria-text space-y-1">
                  {parseFloat(initialAmount) > 0 && (
                    <div className="flex justify-between">
                      <span>Inicial:</span>
                      <span>{formatAmountWithSymbol(parseFloat(initialAmount), currency, dbCurrencies)} ({initialPercent}%)</span>
                    </div>
                  )}
                  {(() => {
                    const total = parseFloat(amount) || 0;
                    const initial = parseFloat(initialAmount) || 0;
                    const remainingVal = Math.max(0, total - initial);
                    const remainingPct = Math.max(0, 100 - parseFloat(initialPercent || 0));
                    const count = parseInt(numberOfInstallments, 10) || 1;
                    const instAmt = remainingVal / count;
                    const instPct = remainingPct / count;
                    return (
                      <>
                        <div className="flex justify-between text-noria-muted">
                          <span>Monto financiado:</span>
                          <span>{formatAmountWithSymbol(remainingVal, currency, dbCurrencies)} ({remainingPct}%)</span>
                        </div>
                        <div className="flex justify-between font-bold text-[#4F8F58] border-t border-[#1A1A1A]/10 pt-1">
                          <span>{count} cuotas de:</span>
                          <span>{formatAmountWithSymbol(instAmt, currency, dbCurrencies)} ({instPct.toFixed(1)}% c/u)</span>
                        </div>
                      </>
                    );
                  })()}
                  <p className="text-noria-muted text-[10px] mt-1">
                    Cada {frequencyInterval} {
                      { DAYS: 'días', WEEKS: 'semanas', MONTHS: 'meses', YEARS: 'años' }[frequencyUnit]
                    }
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-[12px] font-[500] text-[#9F2F2D]">{error}</p>}

        <FormActions
          primaryLabel={saving ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear Deuda')}
        />
      </form>
    </FormSheet>
  );
}
