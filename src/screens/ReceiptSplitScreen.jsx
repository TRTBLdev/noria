import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import PaymentMethodSelector from '../components/PaymentMethodSelector.jsx';
import CategorySelect from '../components/CategorySelect.jsx';
import CurrencyAmount from '../components/CurrencyAmount.jsx';
import {
  DateInput,
  FormActions,
  FormField,
  NumberInput,
  SegmentedChoice,
  SelectInput,
  TextInput,
} from '../components/FormSystem.jsx';
import { createTransactionGroup, TRANSACTION_GROUP_KINDS } from '../db/receipts.js';
import {
  allocateAmount,
  getCurrencyDecimals,
  getReceiptAllocationBuckets,
  getSharedConsumptionShares,
  roundMoney,
} from '../utils/moneyAllocation.js';

const MODE_OPTIONS = [
  { value: TRANSACTION_GROUP_KINDS.RECEIPT, label: 'Factura / ticket' },
  { value: TRANSACTION_GROUP_KINDS.SHARED_EXPENSE, label: 'Cuenta compartida' },
  { value: TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION, label: 'Pago de deudas' },
];

const MODE_DESCRIPTIONS = {
  [TRANSACTION_GROUP_KINDS.RECEIPT]: 'Conserva el total, la base y el IVA. También puedes asignar partes a otras personas y crear cuentas por cobrar.',
  [TRANSACTION_GROUP_KINDS.SHARED_EXPENSE]: 'Divide un subtotal entre personas, con propina opcional, sin registrar desglose fiscal.',
  [TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION]: 'Distribuye un envío entre una o varias deudas existentes.',
};

const newReceiptPart = (fields = {}) => ({
  description: '',
  amount: '',
  taxTreatment: 'TAXABLE',
  tagId: '',
  ownerMode: 'SELF',
  ownerName: '',
  ownerThirdPartyId: '',
  destinationType: 'NONE',
  targetId: '',
  manualTargetAmount: '',
  ...fields,
});

const newReceiptRemainders = () => ({
  GROSS: newReceiptPart({ description: 'Mi parte' }),
  TAXABLE: newReceiptPart({ description: 'Mi parte gravada', taxTreatment: 'TAXABLE' }),
  EXEMPT: newReceiptPart({ description: 'Mi parte exenta', taxTreatment: 'EXEMPT' }),
});

const newParticipant = index => ({
  isUser: index === 0,
  name: index === 0 ? 'Tú' : '',
  thirdPartyId: '',
  amount: '',
});

const newDebtRow = () => ({ debtId: '', sentAmount: '', recognizedAmount: '' });

const getAccountIdFromMethod = (value, instruments) => {
  if (!value) return null;
  if (value.startsWith('inst-')) {
    return instruments.find(item => item.id === Number(value.replace('inst-', '')))?.accountId || null;
  }
  return Number(value.replace('acc-', '')) || null;
};

const getInstrumentIdFromMethod = value => value?.startsWith('inst-')
  ? Number(value.replace('inst-', ''))
  : null;

const formatMoneyForMessage = (value, decimals) => Number(value || 0).toLocaleString('es-VE', {
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
});

function ThirdPartyPicker({
  id,
  label,
  inputValue,
  selectedId,
  thirdParties,
  onChange,
  required = false,
  hint,
  allowCreate = true,
}) {
  const [creating, setCreating] = useState(false);
  const normalized = inputValue.trim().toLocaleLowerCase('es');
  const exactMatch = thirdParties.find(item => item.name.trim().toLocaleLowerCase('es') === normalized);
  const canCreate = allowCreate && normalized && !exactMatch && !selectedId;

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const duplicate = await db.third_parties.filter(item => (
        item.name.trim().toLocaleLowerCase('es') === normalized
      )).first();
      const personId = duplicate?.id || await db.third_parties.add({ name: inputValue.trim() });
      onChange(inputValue.trim(), String(personId));
    } finally {
      setCreating(false);
    }
  };

  return (
    <FormField label={label} htmlFor={id} hint={hint}>
      <TextInput
        id={id}
        list={`${id}-catalog`}
        value={inputValue}
        onChange={event => {
          const value = event.target.value;
          const match = thirdParties.find(item => item.name.trim().toLocaleLowerCase('es') === value.trim().toLocaleLowerCase('es'));
          onChange(value, match ? String(match.id) : '');
        }}
        required={required}
        autoComplete="off"
      />
      <datalist id={`${id}-catalog`}>
        {thirdParties.map(person => <option key={person.id} value={person.name} />)}
      </datalist>
      {canCreate && (
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="mt-2 border border-[#647C78] px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#647C78] disabled:opacity-40"
        >
          {creating ? 'Creando…' : `Crear tercero “${inputValue.trim()}”`}
        </button>
      )}
    </FormField>
  );
}

function SectionTitle({ children, aside }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#1A1A1A] pb-2">
      <h2 className="text-[17px] font-[600] text-noria-text">{children}</h2>
      {aside}
    </div>
  );
}

export default function ReceiptSplitScreen({ initialMode = TRANSACTION_GROUP_KINDS.RECEIPT }) {
  const navigate = useNavigate();
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const instruments = useLiveQuery(() => db.instruments.toArray()) || [];
  const currencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const thirdParties = useLiveQuery(() => db.third_parties.toArray()) || [];
  const debts = useLiveQuery(() => db.debts.toArray()) || [];
  const goals = useLiveQuery(() => db.spending_goals.toArray()) || [];
  const baseCurrencyConfig = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const baseCurrency = baseCurrencyConfig?.value || '';
  const activeAccounts = accounts.filter(account => !account.isArchived);
  const activeCurrencies = currencies.filter(currency => currency.isActive);

  const [mode, setMode] = useState(initialMode);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');

  const [invoiceCurrency, setInvoiceCurrency] = useState(baseCurrency);
  const [includeTax, setIncludeTax] = useState(false);
  const [invoiceTotalInput, setInvoiceTotalInput] = useState('');
  const [taxableBase, setTaxableBase] = useState('');
  const [exemptBase, setExemptBase] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [receiptParts, setReceiptParts] = useState([]);
  const [receiptRemainders, setReceiptRemainders] = useState(newReceiptRemainders);

  const [splitMethod, setSplitMethod] = useState('EQUAL');
  const [numberPeople, setNumberPeople] = useState(2);
  const [tipPercentage, setTipPercentage] = useState('');
  const [participants, setParticipants] = useState([newParticipant(0), newParticipant(1)]);
  const [sharedTagId, setSharedTagId] = useState('');

  const [debtRows, setDebtRows] = useState([newDebtRow()]);
  const [remainderType, setRemainderType] = useState('');
  const [remainderTagId, setRemainderTagId] = useState('');
  const [remainderConcept, setRemainderConcept] = useState('Excedente del envío');

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!invoiceCurrency && baseCurrency) setInvoiceCurrency(baseCurrency);
  }, [baseCurrency, invoiceCurrency]);

  useEffect(() => {
    setParticipants(current => Array.from({ length: numberPeople }, (_, index) => current[index] || newParticipant(index)));
  }, [numberPeople]);

  useEffect(() => {
    setDebtRows([newDebtRow()]);
    setRemainderType('');
  }, [counterpartyId]);

  const accountId = getAccountIdFromMethod(paymentMethod, instruments);
  const selectedAccount = activeAccounts.find(account => account.id === accountId);
  const instrumentId = getInstrumentIdFromMethod(paymentMethod);
  const selectedInstrument = instruments.find(instrument => instrument.id === instrumentId);
  const parsedAmount = Math.max(0, Number(amountInput) || 0);
  const paymentDecimals = getCurrencyDecimals(selectedAccount?.currency, currencies);
  const parsedTipPercentage = Math.max(0, Number(tipPercentage) || 0);
  const tipAmount = mode === TRANSACTION_GROUP_KINDS.SHARED_EXPENSE
    ? roundMoney(parsedAmount * parsedTipPercentage / 100, paymentDecimals)
    : 0;
  const paymentAmount = roundMoney(parsedAmount + tipAmount, paymentDecimals);
  const feeAmount = roundMoney(selectedInstrument
    ? (paymentAmount * (Number(selectedInstrument.feePercentage) || 0) / 100) + (Number(selectedInstrument.feeFixed) || 0)
    : 0, paymentDecimals);
  const tolerance = 0.5 / (10 ** paymentDecimals);

  const parsedTaxable = Math.max(0, Number(taxableBase) || 0);
  const parsedExempt = Math.max(0, Number(exemptBase) || 0);
  const parsedTax = Math.max(0, Number(taxAmount) || 0);
  const invoiceTotal = includeTax
    ? parsedTaxable + parsedExempt + parsedTax
    : Math.max(0, Number(invoiceTotalInput) || 0);

  const invoiceDecimals = getCurrencyDecimals(invoiceCurrency, currencies);
  const receiptBuckets = useMemo(() => getReceiptAllocationBuckets({
    hasTaxBreakdown: includeTax,
    invoiceTotal,
    taxableBase: parsedTaxable,
    exemptBase: parsedExempt,
    parts: receiptParts,
    decimals: invoiceDecimals,
  }), [includeTax, invoiceTotal, parsedTaxable, parsedExempt, receiptParts, invoiceDecimals]);
  const automaticReceiptParts = receiptBuckets
    .filter(bucket => bucket.remaining > 0)
    .map(bucket => ({
      ...receiptRemainders[bucket.key],
      amount: bucket.remaining,
      taxTreatment: bucket.taxTreatment || receiptRemainders[bucket.key].taxTreatment,
      automatic: true,
      bucketKey: bucket.key,
    }));
  const effectiveReceiptParts = [...automaticReceiptParts, ...receiptParts];

  const sharedConsumptionResult = useMemo(() => getSharedConsumptionShares({
    subtotal: parsedAmount,
    participantAmounts: participants.map(person => person.amount),
    splitMethod,
    decimals: paymentDecimals,
  }), [splitMethod, participants, parsedAmount, paymentDecimals]);
  const sharedConsumptions = sharedConsumptionResult.shares;
  const sharedTipShares = useMemo(() => {
    try {
      return allocateAmount(tipAmount, sharedConsumptions, paymentDecimals);
    } catch {
      return participants.map(() => 0);
    }
  }, [tipAmount, sharedConsumptions, paymentDecimals, participants]);
  const sharedShares = sharedConsumptions.map((consumption, index) => roundMoney(consumption + sharedTipShares[index], paymentDecimals));
  const sharedOverage = sharedConsumptionResult.overage;

  const openCounterpartyDebts = debts.filter(debt => (
    debt.type === 'PAGAR'
    && debt.status !== 'SETTLED'
    && debt.status !== 'CANCELLED'
    && debt.thirdPartyId === Number(counterpartyId)
    && Math.max(0, Number(debt.totalAmount || debt.amount || 0) - (Number(debt.paidAmount) || 0)) > 0.001
  ));
  const allocatedDebtAmount = debtRows.reduce((sum, row) => sum + Math.max(0, Number(row.sentAmount) || 0), 0);
  const debtRemainder = paymentAmount - allocatedDebtAmount;

  const receiptPreview = useMemo(() => {
    try {
      const documentDecimals = getCurrencyDecimals(invoiceCurrency, currencies);
      const documentAmounts = effectiveReceiptParts.map(part => Math.max(0, Number(part.amount) || 0));
      let taxes = effectiveReceiptParts.map(() => 0);
      let gross = documentAmounts;
      if (includeTax) {
        const taxableIndexes = effectiveReceiptParts
          .map((part, index) => part.taxTreatment === 'TAXABLE' ? index : -1)
          .filter(index => index >= 0);
        const allocatedTax = allocateAmount(parsedTax, taxableIndexes.map(index => documentAmounts[index]), documentDecimals);
        taxableIndexes.forEach((partIndex, index) => { taxes[partIndex] = allocatedTax[index]; });
        gross = documentAmounts.map((amount, index) => amount + taxes[index]);
      }
      const paid = allocateAmount(paymentAmount, gross, paymentDecimals);
      const fees = allocateAmount(feeAmount, paid, paymentDecimals);
      return effectiveReceiptParts.map((part, index) => ({ tax: taxes[index], gross: gross[index], debit: paid[index] + fees[index] }));
    } catch {
      return effectiveReceiptParts.map(() => ({ tax: 0, gross: 0, debit: 0 }));
    }
  }, [effectiveReceiptParts, includeTax, parsedTax, invoiceCurrency, currencies, paymentAmount, paymentDecimals, feeAmount]);

  const updateReceiptPart = (index, fields) => {
    setReceiptParts(current => current.map((part, position) => position === index ? { ...part, ...fields } : part));
  };
  const updateReceiptRemainder = (key, fields) => {
    setReceiptRemainders(current => ({ ...current, [key]: { ...current[key], ...fields } }));
  };
  const updateParticipant = (index, fields) => {
    setParticipants(current => current.map((person, position) => position === index ? { ...person, ...fields } : person));
  };
  const updateDebtRow = (index, fields) => {
    setDebtRows(current => current.map((row, position) => position === index ? { ...row, ...fields } : row));
  };

  const getDebtLabel = debt => {
    const remaining = Math.max(0, Number(debt.totalAmount || debt.amount || 0) - (Number(debt.paidAmount) || 0));
    return `${debt.description} · ${remaining.toFixed(getCurrencyDecimals(debt.currency, currencies))} ${debt.currency}`;
  };

  const handleSave = async event => {
    event.preventDefault();
    setError('');
    if (!selectedAccount) { setError('Selecciona el medio de pago.'); return; }
    if (paymentAmount <= 0) { setError('Indica un monto mayor a cero.'); return; }
    setSaving(true);
    try {
      let parts;
      const groupInput = {
        groupKind: mode,
        date,
        description,
        counterpartyThirdPartyId: counterpartyId ? Number(counterpartyId) : null,
        accountId: selectedAccount.id,
        instrumentId,
        paymentAmount,
        feeAmount,
      };

      if (mode === TRANSACTION_GROUP_KINDS.RECEIPT) {
        if (!invoiceCurrency) throw new Error('Selecciona la moneda del ticket.');
        const overallocatedBucket = receiptBuckets.find(bucket => bucket.overage > 0);
        if (overallocatedBucket) {
          const currencyLabel = currencies.find(currency => currency.code === invoiceCurrency)?.symbol || invoiceCurrency;
          const bucketAdjective = overallocatedBucket.key === 'TAXABLE' ? 'gravados' : 'exentos';
          const bucketLabel = overallocatedBucket.key === 'GROSS'
            ? 'el total del ticket'
            : `la base ${overallocatedBucket.key === 'TAXABLE' ? 'gravada' : 'exenta'}`;
          throw new Error(
            `Los fragmentos ${overallocatedBucket.key === 'GROSS' ? '' : `${bucketAdjective} `}`
            + `asignados suman ${currencyLabel} ${formatMoneyForMessage(overallocatedBucket.assigned, invoiceDecimals)} y ${bucketLabel} es ${currencyLabel} ${formatMoneyForMessage(overallocatedBucket.total, invoiceDecimals)}. `
            + `Sobran ${currencyLabel} ${formatMoneyForMessage(overallocatedBucket.overage, invoiceDecimals)}; reduce un fragmento o corrige ${bucketLabel}.`
          );
        }
        parts = effectiveReceiptParts.map(part => ({
          description: part.description,
          ...(includeTax ? { baseAmount: Number(part.amount), taxTreatment: part.taxTreatment } : { grossAmount: Number(part.amount) }),
          tagId: part.tagId ? Number(part.tagId) : null,
          ownerThirdPartyId: part.ownerMode === 'PERSON' ? Number(part.ownerThirdPartyId) : null,
          destination: part.destinationType === 'NONE' ? null : {
            type: part.destinationType,
            targetId: part.targetId ? Number(part.targetId) : null,
            manualTargetAmount: part.manualTargetAmount ? Number(part.manualTargetAmount) : null,
          },
        }));
        Object.assign(groupInput, {
          hasTaxBreakdown: includeTax,
          invoiceCurrency,
          invoiceTotal,
          taxableBase: parsedTaxable,
          exemptBase: parsedExempt,
          taxAmount: parsedTax,
          parts,
        });
      } else if (mode === TRANSACTION_GROUP_KINDS.SHARED_EXPENSE) {
        if (sharedOverage > tolerance) {
          throw new Error(`Los consumos de las otras personas superan el subtotal por ${formatMoneyForMessage(sharedOverage, paymentDecimals)} ${selectedAccount.currency}. Reduce uno de esos consumos o corrige el subtotal.`);
        }
        if (!sharedTagId) throw new Error('Selecciona la categoría de tu parte.');
        const participantIds = new Set();
        participants.slice(1).forEach((participant, index) => {
          if (!participant.thirdPartyId) throw new Error(`Selecciona o crea el tercero para la persona ${index + 2}.`);
          if (participantIds.has(participant.thirdPartyId)) throw new Error('Una persona no puede aparecer dos veces en la misma cuenta.');
          participantIds.add(participant.thirdPartyId);
        });
        parts = participants.map((participant, index) => ({
          description: `${description || 'Cuenta compartida'} · ${participant.name || `Persona ${index + 1}`}`,
          paymentPrincipalAmount: sharedShares[index],
          tagId: index === 0 ? Number(sharedTagId) : null,
          ownerThirdPartyId: index === 0 ? null : Number(participant.thirdPartyId),
          destination: index === 0 ? null : { type: 'CREATE_RECEIVABLE' },
        }));
        Object.assign(groupInput, { tipAmount, parts });
      } else {
        if (!counterpartyId) throw new Error('Selecciona la persona a la que enviaste el dinero.');
        const usedDebtIds = new Set();
        parts = debtRows.map((row, index) => {
          const debt = openCounterpartyDebts.find(item => item.id === Number(row.debtId));
          if (!debt) throw new Error(`Selecciona una deuda válida en la fila ${index + 1}.`);
          if (usedDebtIds.has(debt.id)) throw new Error('Una deuda no puede aparecer dos veces en el mismo envío.');
          usedDebtIds.add(debt.id);
          const recognizedTargetAmount = Number(row.recognizedAmount);
          if (!(recognizedTargetAmount > 0)) throw new Error(`Indica el monto reconocido en la fila ${index + 1}.`);
          return {
            description: debt.description,
            paymentPrincipalAmount: Number(row.sentAmount),
            tagId: null,
            destination: {
              type: 'DEBT',
              targetId: debt.id,
              recognizedTargetAmount,
            },
          };
        });
        if (debtRemainder < -tolerance) throw new Error('La suma enviada a las deudas supera el monto del envío.');
        if (debtRemainder > tolerance) {
          if (!remainderType) throw new Error('Clasifica el excedente antes de guardar.');
          if (remainderType === 'EXPENSE' && !remainderTagId) throw new Error('Selecciona la categoría del gasto o regalo excedente.');
          parts.push({
            description: remainderConcept || 'Excedente del envío',
            paymentPrincipalAmount: debtRemainder,
            tagId: remainderType === 'EXPENSE' ? Number(remainderTagId) : null,
            ownerThirdPartyId: remainderType === 'CREATE_RECEIVABLE' ? Number(counterpartyId) : null,
            destination: remainderType === 'CREATE_RECEIVABLE' ? { type: 'CREATE_RECEIVABLE' } : null,
          });
        }
        Object.assign(groupInput, { parts });
      }

      await createTransactionGroup(db, groupInput);
      navigate('/transactions', { replace: true });
    } catch (saveError) {
      setError(saveError.message || 'No se pudo registrar el movimiento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen pb-28 pt-16" style={{ background: '#F5F2ED' }}>
      <div className="mx-auto w-full max-w-md px-6">
        <Header title="Dividir movimiento" showBack backRoute="/transactions" />
        <form onSubmit={handleSave} className="space-y-6 py-5">
          <SegmentedChoice value={mode} onChange={value => { setMode(value); setError(''); }} options={MODE_OPTIONS} />
          <p className="-mt-3 border-l-2 border-[#647C78] pl-3 text-[11px] leading-relaxed text-noria-muted">
            {MODE_DESCRIPTIONS[mode]}
          </p>

          <section className="space-y-4">
            <SectionTitle>Movimiento real</SectionTitle>
            <PaymentMethodSelector
              value={paymentMethod}
              onChange={event => setPaymentMethod(event.target.value)}
              activeAccounts={activeAccounts}
              instruments={instruments}
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Fecha" htmlFor="group-date">
                <DateInput id="group-date" value={date} onChange={event => setDate(event.target.value)} required />
              </FormField>
              <FormField
                label={`${mode === TRANSACTION_GROUP_KINDS.SHARED_EXPENSE ? 'Subtotal' : 'Monto'} (${selectedAccount?.currency || '—'})`}
                htmlFor="group-payment"
              >
                <NumberInput id="group-payment" value={amountInput} onChange={event => setAmountInput(event.target.value)} min="0" step="0.01" required />
              </FormField>
            </div>
            {mode === TRANSACTION_GROUP_KINDS.SHARED_EXPENSE && (
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Propina (%)" htmlFor="shared-tip">
                  <NumberInput id="shared-tip" value={tipPercentage} onChange={event => setTipPercentage(event.target.value)} min="0" step="0.01" />
                </FormField>
                <div className="border border-[#1A1A1A]/25 p-3 font-mono text-[10px]">
                  <p>Total con propina</p>
                  <CurrencyAmount amount={paymentAmount} currencyCode={selectedAccount?.currency} />
                </div>
              </div>
            )}
            {(feeAmount > 0 || mode === TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION) && (
              <p className="border-l-2 border-[#647C78] pl-3 font-mono text-[10px] leading-relaxed text-noria-muted">
                Comisión: <CurrencyAmount amount={feeAmount} currencyCode={selectedAccount?.currency} /> · Débito total: <CurrencyAmount amount={paymentAmount + feeAmount} currencyCode={selectedAccount?.currency} />
                {mode === TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION && ' · La comisión no reduce las deudas.'}
              </p>
            )}
            <FormField label="Descripción" htmlFor="group-description">
              <TextInput id="group-description" value={description} onChange={event => setDescription(event.target.value)} required />
            </FormField>
            <ThirdPartyPicker
              id="group-counterparty"
              label="Contraparte"
              inputValue={counterpartyName}
              selectedId={counterpartyId}
              thirdParties={thirdParties}
              onChange={(name, id) => { setCounterpartyName(name); setCounterpartyId(id); }}
              required={mode === TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION}
              allowCreate={mode !== TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION}
              hint={mode === TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION ? 'Selecciona una persona existente' : 'Opcional · comercio, persona o institución'}
            />
          </section>

          {mode === TRANSACTION_GROUP_KINDS.RECEIPT && (
            <ReceiptFields
              activeCurrencies={activeCurrencies}
              currencies={currencies}
              invoiceCurrency={invoiceCurrency}
              setInvoiceCurrency={setInvoiceCurrency}
              includeTax={includeTax}
              setIncludeTax={setIncludeTax}
              invoiceTotalInput={invoiceTotalInput}
              setInvoiceTotalInput={setInvoiceTotalInput}
              taxableBase={taxableBase}
              setTaxableBase={setTaxableBase}
              exemptBase={exemptBase}
              setExemptBase={setExemptBase}
              taxAmount={taxAmount}
              setTaxAmount={setTaxAmount}
              invoiceTotal={invoiceTotal}
              receiptParts={receiptParts}
              automaticReceiptParts={automaticReceiptParts}
              setReceiptParts={setReceiptParts}
              updateReceiptPart={updateReceiptPart}
              updateReceiptRemainder={updateReceiptRemainder}
              receiptPreview={receiptPreview}
              thirdParties={thirdParties}
              debts={debts}
              goals={goals}
              tags={tags}
              selectedAccount={selectedAccount}
              getDebtLabel={getDebtLabel}
            />
          )}

          {mode === TRANSACTION_GROUP_KINDS.SHARED_EXPENSE && (
            <SharedExpenseFields
              splitMethod={splitMethod}
              setSplitMethod={setSplitMethod}
              numberPeople={numberPeople}
              setNumberPeople={setNumberPeople}
              participants={participants}
              updateParticipant={updateParticipant}
              sharedShares={sharedShares}
              sharedConsumptions={sharedConsumptions}
              sharedTipShares={sharedTipShares}
              sharedOverage={sharedOverage}
              tolerance={tolerance}
              thirdParties={thirdParties}
              sharedTagId={sharedTagId}
              setSharedTagId={setSharedTagId}
              tags={tags}
              currency={selectedAccount?.currency}
              feeAmount={feeAmount}
              paymentDecimals={paymentDecimals}
            />
          )}

          {mode === TRANSACTION_GROUP_KINDS.DEBT_DISTRIBUTION && (
            <DebtDistributionFields
              counterpartyId={counterpartyId}
              openDebts={openCounterpartyDebts}
              debtRows={debtRows}
              setDebtRows={setDebtRows}
              updateDebtRow={updateDebtRow}
              getDebtLabel={getDebtLabel}
              currencies={currencies}
              sourceCurrency={selectedAccount?.currency}
              allocatedAmount={allocatedDebtAmount}
              remainder={debtRemainder}
              tolerance={tolerance}
              onReduceAmount={() => setAmountInput(String(allocatedDebtAmount))}
              remainderType={remainderType}
              setRemainderType={setRemainderType}
              remainderTagId={remainderTagId}
              setRemainderTagId={setRemainderTagId}
              remainderConcept={remainderConcept}
              setRemainderConcept={setRemainderConcept}
              tags={tags}
            />
          )}

          {error && <p className="border-l-2 border-[#9F2F2D] pl-3 text-[12px] font-[500] text-[#9F2F2D]">{error}</p>}
          <FormActions
            primaryLabel={saving ? 'Guardando…' : 'Registrar movimiento'}
            primaryDisabled={saving}
            secondaryLabel="Cancelar"
            onSecondary={() => navigate(-1)}
            primaryColor="#647C78"
          />
        </form>
      </div>
      <BottomNav />
    </div>
  );
}

function ReceiptFields({
  activeCurrencies,
  invoiceCurrency,
  setInvoiceCurrency,
  includeTax,
  setIncludeTax,
  invoiceTotalInput,
  setInvoiceTotalInput,
  taxableBase,
  setTaxableBase,
  exemptBase,
  setExemptBase,
  taxAmount,
  setTaxAmount,
  invoiceTotal,
  receiptParts,
  automaticReceiptParts,
  setReceiptParts,
  updateReceiptPart,
  updateReceiptRemainder,
  receiptPreview,
  thirdParties,
  debts,
  goals,
  tags,
  selectedAccount,
  getDebtLabel,
}) {
  return (
    <>
      <section className="space-y-4">
        <SectionTitle>Documento</SectionTitle>
        <FormField label="Moneda del ticket" htmlFor="receipt-currency">
          <SelectInput id="receipt-currency" value={invoiceCurrency} onChange={event => setInvoiceCurrency(event.target.value)} required>
            <option value="" disabled>Selecciona…</option>
            {activeCurrencies.map(currency => <option key={currency.code} value={currency.code}>{currency.code}</option>)}
          </SelectInput>
        </FormField>
        <label className="flex items-center gap-3 border border-[#1A1A1A]/25 p-3 font-mono text-[10px] font-bold uppercase tracking-[0.08em]">
          <input type="checkbox" checked={includeTax} onChange={event => setIncludeTax(event.target.checked)} />
          Incluir desglose de IVA
        </label>
        {includeTax ? (
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Base gravada" htmlFor="receipt-taxable">
              <NumberInput id="receipt-taxable" value={taxableBase} onChange={event => setTaxableBase(event.target.value)} min="0" step="0.01" />
            </FormField>
            <FormField label="Base exenta" htmlFor="receipt-exempt">
              <NumberInput id="receipt-exempt" value={exemptBase} onChange={event => setExemptBase(event.target.value)} min="0" step="0.01" />
            </FormField>
            <FormField label="IVA impreso" htmlFor="receipt-tax">
              <NumberInput id="receipt-tax" value={taxAmount} onChange={event => setTaxAmount(event.target.value)} min="0" step="0.01" />
            </FormField>
          </div>
        ) : (
          <FormField label={`Total del ticket (${invoiceCurrency || '—'})`} htmlFor="receipt-total">
            <NumberInput id="receipt-total" value={invoiceTotalInput} onChange={event => setInvoiceTotalInput(event.target.value)} min="0" step="0.01" required />
          </FormField>
        )}
        <div className="flex justify-between border border-[#1A1A1A]/25 p-3 font-mono text-[11px]">
          <span>Total del ticket</span>
          <CurrencyAmount amount={invoiceTotal} currencyCode={invoiceCurrency} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle aside={(
          <button type="button" onClick={() => setReceiptParts(current => [...current, newReceiptPart()])} className="flex items-center gap-1 font-mono text-[10px] uppercase text-[#647C78]">
            <Plus size={13} /> Agregar parte
          </button>
        )}>Fragmentos</SectionTitle>
        {invoiceTotal <= 0 && receiptParts.length === 0 && (
          <p className="border-l-2 border-[#647C78] pl-3 text-[11px] leading-relaxed text-noria-muted">
            Ingresa los totales del documento. La app creará “Mi parte” con el monto que quede sin asignar.
          </p>
        )}
        {[...automaticReceiptParts, ...receiptParts].map((part, index) => {
          const isAutomatic = Boolean(part.automatic);
          const manualIndex = index - automaticReceiptParts.length;
          const updatePart = fields => isAutomatic
            ? updateReceiptRemainder(part.bucketKey, fields)
            : updateReceiptPart(manualIndex, fields);
          const ownerId = Number(part.ownerThirdPartyId);
          const availableDebts = debts.filter(debt => debt.type === 'PAGAR' && debt.status !== 'SETTLED' && debt.thirdPartyId === ownerId);
          const selectedDebt = debts.find(debt => debt.id === Number(part.targetId));
          const selectedGoal = goals.find(goal => goal.id === Number(part.targetId));
          const targetCurrency = selectedDebt?.currency || selectedGoal?.currency;
          return (
            <div key={isAutomatic ? `automatic-${part.bucketKey}` : `manual-${manualIndex}`} className={`space-y-4 border p-4 ${isAutomatic ? 'border-[#647C78]' : 'border-[#1A1A1A]'}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase">{isAutomatic ? 'Mi parte · restante automático' : `Parte asignada ${manualIndex + 1}`}</span>
                {!isAutomatic && (
                  <button type="button" onClick={() => setReceiptParts(current => current.filter((_, position) => position !== manualIndex))} className="text-[#9F2F2D]" aria-label={`Eliminar parte asignada ${manualIndex + 1}`}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className={`grid gap-3 ${includeTax ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <FormField label={`${includeTax ? 'Base' : 'Importe'} (${invoiceCurrency})`} htmlFor={`part-amount-${index}`} hint={isAutomatic ? 'Se calcula con lo que falta por asignar' : undefined}>
                  <NumberInput id={`part-amount-${index}`} value={part.amount} onChange={event => updatePart({ amount: event.target.value })} min="0" step="0.01" readOnly={isAutomatic} required />
                </FormField>
                {includeTax && (
                  <FormField label="Condición fiscal" htmlFor={`part-tax-${index}`}>
                    <SelectInput id={`part-tax-${index}`} value={part.taxTreatment} onChange={event => updatePart({ taxTreatment: event.target.value })} disabled={isAutomatic}>
                      <option value="TAXABLE">Gravado</option>
                      <option value="EXEMPT">Exento</option>
                    </SelectInput>
                  </FormField>
                )}
              </div>
              <FormField label="Concepto" htmlFor={`part-description-${index}`} hint="Opcional">
                <TextInput id={`part-description-${index}`} value={part.description} onChange={event => updatePart({ description: event.target.value })} />
              </FormField>
              <FormField label="Consumido por" htmlFor={`part-owner-mode-${index}`}>
                <SelectInput id={`part-owner-mode-${index}`} value={part.ownerMode} disabled={isAutomatic} onChange={event => updatePart({
                  ownerMode: event.target.value,
                  ownerName: '',
                  ownerThirdPartyId: '',
                  destinationType: event.target.value === 'SELF' ? 'NONE' : 'CREATE_RECEIVABLE',
                  targetId: '',
                  tagId: event.target.value === 'SELF' ? part.tagId : '',
                })}>
                  <option value="SELF">Mi consumo</option>
                  <option value="PERSON">Otra persona</option>
                </SelectInput>
              </FormField>
              {part.ownerMode === 'PERSON' && (
                <ThirdPartyPicker
                  id={`part-owner-${index}`}
                  label="Persona"
                  inputValue={part.ownerName}
                  selectedId={part.ownerThirdPartyId}
                  thirdParties={thirdParties}
                  onChange={(name, id) => updatePart({ ownerName: name, ownerThirdPartyId: id, targetId: '' })}
                  required
                />
              )}
              {part.ownerMode === 'SELF' && (
                <CategorySelect id={`part-tag-${index}`} value={part.tagId} onChange={value => updatePart({ tagId: value })} tags={tags} kind="EXPENSE" required />
              )}
              <FormField label="Destino" htmlFor={`part-destination-${index}`}>
                <SelectInput id={`part-destination-${index}`} value={part.destinationType} onChange={event => updatePart({ destinationType: event.target.value, targetId: '' })}>
                  {part.ownerMode === 'SELF' && <option value="NONE">Gasto personal</option>}
                  {part.ownerMode === 'SELF' && <option value="GOAL">Objetivo de gasto</option>}
                  {part.ownerMode === 'PERSON' && <option value="CREATE_RECEIVABLE">Crear deuda por cobrar</option>}
                  {part.ownerMode === 'PERSON' && <option value="DEBT">Abonar deuda por pagar con esa persona</option>}
                </SelectInput>
              </FormField>
              {part.destinationType === 'DEBT' && (
                <FormField label="Deuda" htmlFor={`part-debt-${index}`}>
                  <SelectInput id={`part-debt-${index}`} value={part.targetId} onChange={event => updatePart({ targetId: event.target.value })} required>
                    <option value="" disabled>Selecciona…</option>
                    {availableDebts.map(debt => <option key={debt.id} value={debt.id}>{getDebtLabel(debt)}</option>)}
                  </SelectInput>
                </FormField>
              )}
              {part.destinationType === 'GOAL' && (
                <FormField label="Objetivo" htmlFor={`part-goal-${index}`}>
                  <SelectInput id={`part-goal-${index}`} value={part.targetId} onChange={event => {
                    const goal = goals.find(item => item.id === Number(event.target.value));
                    updatePart({ targetId: event.target.value, tagId: part.tagId || String(goal?.defaultTagId || '') });
                  }} required>
                    <option value="" disabled>Selecciona…</option>
                    {goals.filter(goal => goal.status !== 'ARCHIVED').map(goal => <option key={goal.id} value={goal.id}>{goal.name} · {goal.currency}</option>)}
                  </SelectInput>
                </FormField>
              )}
              {['DEBT', 'GOAL'].includes(part.destinationType) && targetCurrency && targetCurrency !== selectedAccount?.currency && (
                <FormField label={`Equivalente manual (${targetCurrency})`} htmlFor={`part-equivalent-${index}`} hint="Opcional si FIFO o una paridad pueden resolverlo">
                  <NumberInput id={`part-equivalent-${index}`} value={part.manualTargetAmount} onChange={event => updatePart({ manualTargetAmount: event.target.value })} min="0" step="0.01" />
                </FormField>
              )}
              <div className={`grid ${includeTax ? 'grid-cols-3' : 'grid-cols-2'} gap-2 border-t border-[#1A1A1A]/20 pt-3 font-mono text-[9px]`}>
                {includeTax && <span>IVA: <CurrencyAmount amount={receiptPreview[index]?.tax || 0} currencyCode={invoiceCurrency} /></span>}
                <span>Bruto: <CurrencyAmount amount={receiptPreview[index]?.gross || 0} currencyCode={invoiceCurrency} /></span>
                <span>Débito: <CurrencyAmount amount={receiptPreview[index]?.debit || 0} currencyCode={selectedAccount?.currency} /></span>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}

function SharedExpenseFields({
  splitMethod,
  setSplitMethod,
  numberPeople,
  setNumberPeople,
  participants,
  updateParticipant,
  sharedShares,
  sharedConsumptions,
  sharedTipShares,
  sharedOverage,
  tolerance,
  thirdParties,
  sharedTagId,
  setSharedTagId,
  tags,
  currency,
  feeAmount,
  paymentDecimals,
}) {
  let feeShares = participants.map(() => 0);
  try { feeShares = allocateAmount(feeAmount, sharedShares, paymentDecimals); } catch { /* preview stays at zero */ }
  const valid = sharedOverage <= tolerance;
  return (
    <section className="space-y-4">
      <SectionTitle>Reparto</SectionTitle>
      <SegmentedChoice value={splitMethod} onChange={setSplitMethod} options={[
        { value: 'EQUAL', label: 'Equitativo' },
        { value: 'MANUAL', label: 'Manual' },
      ]} />
      <FormField label="Número de personas" htmlFor="shared-people">
        <NumberInput id="shared-people" value={numberPeople} onChange={event => setNumberPeople(Math.min(20, Math.max(2, Number(event.target.value) || 2)))} min="2" max="20" step="1" required />
      </FormField>
      <CategorySelect id="shared-category" label="Categoría de mi parte" value={sharedTagId} onChange={setSharedTagId} tags={tags} kind="EXPENSE" required />

      <div className="space-y-3">
        {participants.map((participant, index) => (
          <div key={index} className="space-y-3 border border-[#1A1A1A]/35 p-3">
            <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase">
              <span>{index === 0 ? 'Mi parte' : `Persona ${index + 1}`}</span>
              <span><CurrencyAmount amount={sharedShares[index] + feeShares[index]} currencyCode={currency} /></span>
            </div>
            {index > 0 && (
              <ThirdPartyPicker
                id={`shared-person-${index}`}
                label="Participante"
                inputValue={participant.name}
                selectedId={participant.thirdPartyId}
                thirdParties={thirdParties}
                onChange={(name, id) => updateParticipant(index, { name, thirdPartyId: id })}
                required
              />
            )}
            {splitMethod === 'MANUAL' && index > 0 && (
              <FormField label={`Consumo sin propina (${currency || '—'})`} htmlFor={`shared-amount-${index}`} hint="Mi consumo se calcula con el subtotal restante">
                <NumberInput id={`shared-amount-${index}`} value={participant.amount} onChange={event => updateParticipant(index, { amount: event.target.value })} min="0" step="0.01" required />
              </FormField>
            )}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#1A1A1A]/20 pt-3 font-mono text-[9px]">
              <span>Consumo: <CurrencyAmount amount={sharedConsumptions[index] || 0} currencyCode={currency} /></span>
              <span>Propina: <CurrencyAmount amount={sharedTipShares[index] || 0} currencyCode={currency} /></span>
              <span>Comisión: <CurrencyAmount amount={feeShares[index] || 0} currencyCode={currency} /></span>
              <span>Total: <CurrencyAmount amount={(sharedShares[index] || 0) + (feeShares[index] || 0)} currencyCode={currency} /></span>
            </div>
            {index > 0 && (
              <p className="font-mono text-[9px] text-noria-muted">Se creará una deuda por cobrar por el total mostrado.</p>
            )}
          </div>
        ))}
      </div>
      <div className={`border-l-2 pl-3 font-mono text-[10px] ${valid ? 'border-[#4F8F58] text-[#4F8F58]' : 'border-[#9F2F2D] text-[#9F2F2D]'}`}>
        {valid
          ? <>{splitMethod === 'MANUAL' ? 'Mi consumo calculado' : 'Subtotal distribuido'}: <CurrencyAmount amount={splitMethod === 'MANUAL' ? sharedConsumptions[0] : sharedConsumptions.reduce((sum, value) => sum + value, 0)} currencyCode={currency} /></>
          : <>Los consumos ajenos exceden el subtotal por <CurrencyAmount amount={sharedOverage} currencyCode={currency} /></>}
      </div>
    </section>
  );
}

function DebtDistributionFields({
  counterpartyId,
  openDebts,
  debtRows,
  setDebtRows,
  updateDebtRow,
  getDebtLabel,
  currencies,
  sourceCurrency,
  allocatedAmount,
  remainder,
  tolerance,
  onReduceAmount,
  remainderType,
  setRemainderType,
  remainderTagId,
  setRemainderTagId,
  remainderConcept,
  setRemainderConcept,
  tags,
}) {
  return (
    <section className="space-y-4">
      <SectionTitle aside={counterpartyId && openDebts.length > 0 ? (
        <button type="button" onClick={() => setDebtRows(current => [...current, newDebtRow()])} className="flex items-center gap-1 font-mono text-[10px] uppercase text-[#647C78]">
          <Plus size={13} /> Otra deuda
        </button>
      ) : null}>Distribución entre deudas</SectionTitle>
      {!counterpartyId && <p className="text-[12px] text-noria-muted">Selecciona primero una contraparte.</p>}
      {counterpartyId && openDebts.length === 0 && <p className="text-[12px] text-[#9F2F2D]">Esta persona no tiene deudas por pagar abiertas.</p>}
      {counterpartyId && openDebts.length > 0 && debtRows.map((row, index) => {
        const debt = openDebts.find(item => item.id === Number(row.debtId));
        const source = Number(row.sentAmount) || 0;
        const recognized = Number(row.recognizedAmount) || 0;
        const rate = source > 0 ? recognized / source : 0;
        const usedByOtherRow = new Set(debtRows.filter((_, position) => position !== index).map(item => Number(item.debtId)));
        return (
          <div key={index} className="space-y-4 border border-[#1A1A1A] p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold uppercase">Deuda {index + 1}</span>
              {debtRows.length > 1 && (
                <button type="button" onClick={() => setDebtRows(current => current.filter((_, position) => position !== index))} className="text-[#9F2F2D]" aria-label={`Eliminar deuda ${index + 1}`}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <FormField label="Deuda" htmlFor={`debt-row-${index}`}>
              <SelectInput id={`debt-row-${index}`} value={row.debtId} onChange={event => updateDebtRow(index, { debtId: event.target.value, recognizedAmount: '' })} required>
                <option value="" disabled>Selecciona…</option>
                {openDebts.filter(item => item.id === Number(row.debtId) || !usedByOtherRow.has(item.id)).map(item => (
                  <option key={item.id} value={item.id}>{getDebtLabel(item)}</option>
                ))}
              </SelectInput>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={`Monto enviado (${sourceCurrency || '—'})`} htmlFor={`debt-source-${index}`}>
                <NumberInput id={`debt-source-${index}`} value={row.sentAmount} onChange={event => updateDebtRow(index, { sentAmount: event.target.value })} min="0" step="0.01" required />
              </FormField>
              <FormField label={`Monto reconocido (${debt?.currency || '—'})`} htmlFor={`debt-target-${index}`}>
                <NumberInput id={`debt-target-${index}`} value={row.recognizedAmount} onChange={event => updateDebtRow(index, { recognizedAmount: event.target.value })} min="0" step="0.01" required />
              </FormField>
            </div>
            {debt && source > 0 && recognized > 0 && (
              <p className="font-mono text-[9px] text-noria-muted">
                Tasa implícita: 1 {sourceCurrency} = {rate.toFixed(6)} {debt.currency}. El costo FIFO se conserva por separado.
              </p>
            )}
          </div>
        );
      })}

      {counterpartyId && openDebts.length > 0 && (
        <div className="space-y-3 border border-[#1A1A1A]/25 p-3">
          <div className="flex justify-between font-mono text-[10px]"><span>Asignado a deudas</span><CurrencyAmount amount={allocatedAmount} currencyCode={sourceCurrency} /></div>
          <div className={`flex justify-between font-mono text-[10px] ${remainder < -tolerance ? 'text-[#9F2F2D]' : ''}`}><span>Excedente</span><CurrencyAmount amount={remainder} currencyCode={sourceCurrency} /></div>
          {remainder > tolerance && (
            <>
              <SegmentedChoice label="Clasificar excedente" value={remainderType} onChange={setRemainderType} options={[
                { value: 'EXPENSE', label: 'Gasto / regalo' },
                { value: 'CREATE_RECEIVABLE', label: 'Deuda por cobrar' },
              ]} />
              <button type="button" onClick={onReduceAmount} className="w-full border border-[#1A1A1A] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em]">
                Reducir el envío al monto asignado
              </button>
              {remainderType && (
                <FormField label="Concepto del excedente" htmlFor="debt-remainder-concept">
                  <TextInput id="debt-remainder-concept" value={remainderConcept} onChange={event => setRemainderConcept(event.target.value)} required />
                </FormField>
              )}
              {remainderType === 'EXPENSE' && (
                <CategorySelect id="debt-remainder-category" value={remainderTagId} onChange={setRemainderTagId} tags={tags} kind="EXPENSE" required />
              )}
              {remainderType === 'CREATE_RECEIVABLE' && (
                <p className="font-mono text-[9px] text-noria-muted">Se creará una deuda por cobrar explícita contra la contraparte. No se crea ninguna deuda inversa automáticamente.</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
