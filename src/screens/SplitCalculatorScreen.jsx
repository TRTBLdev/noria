import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { db } from '../db/db.js';
import BottomNav from '../components/BottomNav.jsx';
import FAB from '../components/FAB.jsx';
import CategorySelect from '../components/CategorySelect.jsx';
import CurrencyAmount from '../components/CurrencyAmount.jsx';
import PillarTag from '../components/PillarTag.jsx';
import {
  DateInput,
  FormActions,
  FormField,
  FormSheet,
  NumberInput,
  SegmentedChoice,
  SelectInput,
  TextInput,
} from '../components/FormSystem.jsx';
import { consumeCurrencyLots, stringifyLotConsumption } from '../db/currencyLots.js';
import { convertAmountToBase } from '../utils/currency.js';

const createParticipant = index => ({
  name: index === 0 ? 'Tú' : '',
  amount: '',
  isUser: index === 0,
  selectedThirdPartyId: '',
  thirdPartyInput: index === 0 ? 'Tú' : '',
});

export default function SplitCalculatorScreen({ isSheet = false }) {
  const navigate = useNavigate();

  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const thirdParties = useLiveQuery(() => db.third_parties.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const dbCurrencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const lotCurrencyObj = useLiveQuery(() => db.app_config.get('lotCurrency'));
  const baseCurrency = baseCurrencyObj?.value || '';
  const lotCurrency = lotCurrencyObj?.value || '';

  const activeAccounts = accounts.filter(account => !account.isArchived);
  const activeCurrencies = dbCurrencies.filter(currencyItem => currencyItem.isActive);

  const [totalAmount, setTotalAmount] = useState('');
  const [numPeople, setNumPeople] = useState('2');
  const [isEquitative, setIsEquitative] = useState(true);
  const [tipPercentage, setTipPercentage] = useState('0');
  const [currency, setCurrency] = useState('');
  const [manualPeople, setManualPeople] = useState([createParticipant(0), createParticipant(1)]);
  const [focusedIndex, setFocusedIndex] = useState(null);

  const [showSaveFields, setShowSaveFields] = useState(false);
  const [description, setDescription] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!currency && baseCurrency) setCurrency(baseCurrency);
  }, [currency, baseCurrency]);

  useEffect(() => {
    const count = Math.max(1, parseInt(numPeople, 10) || 1);
    setManualPeople(previous => Array.from({ length: count }, (_, index) => {
      const existing = previous[index];
      if (!existing) return createParticipant(index);
      return index === 0
        ? { ...existing, name: 'Tú', thirdPartyInput: 'Tú', isUser: true }
        : { ...existing, isUser: false };
    }));
  }, [numPeople]);

  const compatibleAccounts = activeAccounts.filter(account => account.currency === currency);

  useEffect(() => {
    setSelectedAccountId(current => (
      compatibleAccounts.some(account => account.id.toString() === current)
        ? current
        : (compatibleAccounts[0]?.id.toString() || '')
    ));
  }, [currency, accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedTotal = parseFloat(totalAmount) || 0;
  const parsedTip = parseFloat(tipPercentage) || 0;
  const grandTotal = parsedTotal * (1 + parsedTip / 100);
  const nPeople = Math.max(1, parseInt(numPeople, 10) || 1);
  const equalShareWithTip = grandTotal / nPeople;
  const equalShareNoTip = parsedTotal / nPeople;
  const tipPerPerson = (parsedTotal * (parsedTip / 100)) / nPeople;
  const selectedCurrency = dbCurrencies.find(item => item.code === currency);
  const decimalPlaces = Math.max(0, Number(selectedCurrency?.decimalPlaces ?? 2));
  const precisionFactor = 10 ** decimalPlaces;
  const amountStep = decimalPlaces === 0 ? '1' : (1 / precisionFactor).toFixed(decimalPlaces);
  const manualSum = manualPeople.reduce((sum, person) => sum + (parseFloat(person.amount) || 0), 0);
  const manualDifference = grandTotal - manualSum;
  const manualMatches = Math.round(grandTotal * precisionFactor) === Math.round(manualSum * precisionFactor);
  const userSharePreview = isEquitative ? equalShareWithTip : (parseFloat(manualPeople[0]?.amount) || 0);
  const amountToCollect = Math.max(0, grandTotal - userSharePreview);
  const selectedTag = tags.find(tag => tag.id === parseInt(selectedTagId, 10));

  const getAccountLabel = account => {
    const institution = institutions.find(item => item.id === account.institutionId);
    const baseName = institution
      ? (institution.name.toLowerCase() === account.name.toLowerCase()
        ? institution.name
        : `${institution.name} · ${account.name}`)
      : account.name;
    return `${baseName} (${account.currency})`;
  };

  const handleModeChange = mode => {
    const nextEquitative = mode === 'EQUITATIVE';
    if (!nextEquitative && isEquitative) {
      const initialShare = nPeople > 0 ? (grandTotal / nPeople).toFixed(decimalPlaces) : '';
      setManualPeople(previous => previous.map(person => ({ ...person, amount: initialShare })));
    }
    setIsEquitative(nextEquitative);
    setShowSaveFields(false);
    setSaveError('');
  };

  const handleNameChange = (index, name) => {
    setManualPeople(previous => previous.map((person, position) => (
      position === index
        ? { ...person, name, thirdPartyInput: name, selectedThirdPartyId: '' }
        : person
    )));
  };

  const handleSelectThirdParty = (index, thirdParty) => {
    setManualPeople(previous => previous.map((person, position) => (
      position === index
        ? {
            ...person,
            name: thirdParty.name,
            thirdPartyInput: thirdParty.name,
            selectedThirdPartyId: thirdParty.id.toString(),
          }
        : person
    )));
    setFocusedIndex(null);
  };

  const handleManualAmountChange = (index, value) => {
    setManualPeople(previous => previous.map((person, position) => (
      position === index ? { ...person, amount: value } : person
    )));
  };

  const validateCalculation = () => {
    if (!selectedCurrency?.isActive) return 'Selecciona una moneda activa.';
    if (!Number.isFinite(grandTotal) || grandTotal <= 0) return 'El monto total debe ser mayor a cero.';
    if (nPeople < 2) return 'Se necesitan al menos dos personas para crear deudas.';
    if (!isEquitative) {
      if (manualPeople.some(person => !Number.isFinite(parseFloat(person.amount)) || parseFloat(person.amount) <= 0)) {
        return 'Cada participante debe tener un monto mayor a cero.';
      }
      if (!manualMatches) return 'La suma manual debe coincidir con el total con propina.';
    }
    return '';
  };

  const handlePrepareSave = event => {
    event.preventDefault();
    const validationError = validateCalculation();
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    setSaveError('');
    setShowSaveFields(true);
  };

  const handleSaveToDB = async event => {
    event.preventDefault();
    setSaveError('');
    setSaveSuccess(false);

    const validationError = validateCalculation();
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    if (!description.trim()) {
      setSaveError('Ingresa una descripción para el split.');
      return;
    }
    if (!effectiveDate) {
      setSaveError('Selecciona la fecha efectiva.');
      return;
    }
    if (!selectedTag) {
      setSaveError('Selecciona una categoría de gasto.');
      return;
    }
    if (!selectedTag.pillar) {
      setSaveError('La categoría seleccionada no tiene un pilar configurado. Edítala o crea otra categoría.');
      return;
    }
    if (!selectedAccountId) {
      setSaveError(`No hay una cuenta disponible en ${currency}.`);
      return;
    }

    const payingAccount = compatibleAccounts.find(account => account.id.toString() === selectedAccountId);
    if (!payingAccount) {
      setSaveError(`Selecciona una cuenta activa en ${currency}.`);
      return;
    }

    const participants = manualPeople.slice(1, nPeople);
    if (participants.some(person => !person.thirdPartyInput.trim())) {
      setSaveError('Identifica a todas las personas que tendrán una deuda.');
      return;
    }

    const userShare = isEquitative ? equalShareWithTip : (parseFloat(manualPeople[0].amount) || 0);
    const participantDeeds = participants.map(person => ({
      name: person.thirdPartyInput.trim(),
      selectedThirdPartyId: person.selectedThirdPartyId,
      amount: isEquitative ? equalShareWithTip : (parseFloat(person.amount) || 0),
    }));
    const transactionDate = new Date(`${effectiveDate}T12:00:00`);

    try {
      await db.transaction('rw', [db.accounts, db.transactions, db.lots, db.third_parties, db.debts, db.debt_payments], async () => {
        const splitGroupId = `SPLIT-${Date.now()}`;
        const proportion = userShare / grandTotal;

        let lotConsumptions = [];
        let transactionBaseAmount = convertAmountToBase(grandTotal, payingAccount.currency, baseCurrency, [], dbCurrencies);
        let transactionBaseCurrency = transactionBaseAmount === null ? null : baseCurrency;

        if (payingAccount.currency === lotCurrency) {
          const consumed = await consumeCurrencyLots(db, {
            accountId: payingAccount.id,
            currency: lotCurrency,
            amount: grandTotal,
          });
          lotConsumptions = consumed.consumptions;
          transactionBaseAmount = consumed.baseAmount;
          transactionBaseCurrency = consumed.baseCurrency;
        }

        const userBaseAmount = transactionBaseAmount !== null ? transactionBaseAmount * proportion : null;
        const userLotConsumptions = lotConsumptions.map(consumption => ({
          lotId: consumption.lotId,
          amountConsumed: consumption.amountConsumed * proportion,
          costConsumed: consumption.costConsumed * proportion,
          costCurrency: consumption.costCurrency,
        }));

        await db.transactions.add({
          date: transactionDate,
          type: 'OUT',
          amount: userShare,
          currency: payingAccount.currency,
          accountId: payingAccount.id,
          tagId: selectedTag.id,
          pillar: selectedTag.pillar,
          description: `${description.trim()} (Tu parte)`,
          baseAmount: userBaseAmount,
          baseCurrency: transactionBaseCurrency,
          lotConsumption: stringifyLotConsumption(userLotConsumptions),
          splitGroupId,
        });

        for (const participant of participantDeeds) {
          let thirdPartyId = participant.selectedThirdPartyId ? parseInt(participant.selectedThirdPartyId, 10) : null;
          if (!thirdPartyId) {
            const match = thirdParties.find(item => item.name.toLowerCase() === participant.name.toLowerCase());
            thirdPartyId = match?.id || await db.third_parties.add({ name: participant.name });
          }

          await db.debts.add({
            description: `${description.trim()} (Split)`,
            thirdPartyId,
            type: 'COBRAR',
            amount: participant.amount,
            totalAmount: participant.amount,
            paidAmount: 0,
            currency: payingAccount.currency,
            status: 'ACTIVE',
            dueDate: null,
            splitGroupId,
            createdAt: transactionDate,
          });
        }

        await db.accounts.update(payingAccount.id, {
          balance: payingAccount.balance - grandTotal,
        });
      });

      setSaveSuccess(true);
      if (isSheet) {
        navigate('/debts', { replace: true });
      } else {
        setTimeout(() => navigate('/debts', { replace: true }), 1000);
      }
    } catch (error) {
      console.error('Error saving split from calculator:', error);
      setSaveError(error.message || 'Error al registrar el split en la base de datos.');
    }
  };

  const handleClose = () => (isSheet ? navigate(-1) : navigate('/debts'));

  const renderSuggestions = (person, index) => {
    if (index === 0 || focusedIndex !== index || !person.thirdPartyInput) return null;
    const matches = thirdParties.filter(thirdParty => (
      thirdParty.name.toLowerCase().includes(person.thirdPartyInput.toLowerCase())
    ));
    if (matches.length === 0) return null;

    return (
      <div className="absolute left-0 right-0 top-full z-50 max-h-28 overflow-y-auto border border-[#1A1A1A] bg-[#F5F2ED] font-mono text-[10px]">
        {matches.map(thirdParty => (
          <button
            key={thirdParty.id}
            type="button"
            onMouseDown={() => handleSelectThirdParty(index, thirdParty)}
            className="block w-full px-2 py-2 text-left text-noria-text hover:bg-[#1A1A1A]/5"
          >
            {thirdParty.name}
          </button>
        ))}
      </div>
    );
  };

  const sectionTitle = title => (
    <div className="border-b border-[#1A1A1A] pb-2">
      <h3 className="text-[17px] font-[600] leading-tight text-noria-text">{title}</h3>
    </div>
  );

  const formContent = (
    <form onSubmit={showSaveFields ? handleSaveToDB : handlePrepareSave} className="space-y-7">
      <section className="space-y-4">
        {sectionTitle('Cálculo')}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Monto total" htmlFor="split-total">
            <NumberInput
              id="split-total"
              value={totalAmount}
              onChange={event => setTotalAmount(event.target.value)}
              min={amountStep}
              step={amountStep}
              inputMode="decimal"
              placeholder="0"
              required
              autoFocus
            />
          </FormField>
          <FormField label="Moneda" htmlFor="split-currency">
            <SelectInput id="split-currency" value={currency} onChange={event => setCurrency(event.target.value)} required>
              {activeCurrencies.map(currencyItem => (
                <option key={currencyItem.code} value={currencyItem.code}>{currencyItem.code}</option>
              ))}
            </SelectInput>
          </FormField>
          <FormField label="N.º de personas" htmlFor="split-people" hint="Te incluye">
            <NumberInput
              id="split-people"
              value={numPeople}
              onChange={event => setNumPeople(event.target.value)}
              min="2"
              step="1"
              inputMode="numeric"
              required
            />
          </FormField>
          <FormField label="Propina (%)" htmlFor="split-tip">
            <NumberInput
              id="split-tip"
              value={tipPercentage}
              onChange={event => setTipPercentage(event.target.value)}
              min="0"
              step="0.01"
              inputMode="decimal"
            />
          </FormField>
        </div>
        <SegmentedChoice
          label="Tipo de reparto"
          value={isEquitative ? 'EQUITATIVE' : 'MANUAL'}
          onChange={handleModeChange}
          options={[
            { value: 'EQUITATIVE', label: 'Equitativo', color: '#647C78' },
            { value: 'MANUAL', label: 'Manual', color: '#647C78' },
          ]}
        />
      </section>

      <section className="space-y-3">
        {sectionTitle('Resultado')}
        <div className="border-y border-[rgba(26,26,26,0.16)] py-4">
          <p className="font-mono text-[9px] font-[700] uppercase tracking-[0.14em] text-noria-muted">Total con propina</p>
          <output className="mt-1 block text-[30px] font-[700] leading-none tracking-[-0.03em] text-noria-text">
            <CurrencyAmount amount={grandTotal} currencyCode={currency} />
          </output>
          <dl className="mt-4 grid grid-cols-2 gap-px bg-[rgba(26,26,26,0.16)] border border-[rgba(26,26,26,0.16)]">
            <div className="bg-[#F5F2ED] p-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-noria-muted">Tu parte</dt>
              <dd className="mt-1 font-mono text-[13px] font-[700] text-noria-text"><CurrencyAmount amount={userSharePreview} currencyCode={currency} /></dd>
            </div>
            <div className="bg-[#F5F2ED] p-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-noria-muted">Por cobrar</dt>
              <dd className="mt-1 font-mono text-[13px] font-[700] text-[#647C78]"><CurrencyAmount amount={amountToCollect} currencyCode={currency} /></dd>
            </div>
          </dl>
          {isEquitative ? (
            <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-noria-muted">
              Base por persona: <CurrencyAmount amount={equalShareNoTip} currencyCode={currency} />
              {parsedTip > 0 && <> · Propina: <CurrencyAmount amount={tipPerPerson} currencyCode={currency} /></>}
            </p>
          ) : (
            <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-noria-muted">
              Distribuido: <CurrencyAmount amount={manualSum} currencyCode={currency} />
              {' · '}Diferencia: <CurrencyAmount amount={manualDifference} currencyCode={currency} />
            </p>
          )}
        </div>
      </section>

      {!isEquitative && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3 border-b border-[#1A1A1A] pb-2">
            <h3 className="text-[17px] font-[600] leading-tight text-noria-text">Participantes</h3>
            <span className={`border px-1.5 py-0.5 font-mono text-[8px] font-[700] uppercase tracking-[0.08em] ${manualMatches ? 'border-[#4F8F58] text-[#4F8F58]' : 'border-[#9F2F2D] text-[#9F2F2D]'}`}>
              {manualMatches ? 'Validado' : 'Diferencia'}
            </span>
          </div>
          <div className="divide-y divide-[rgba(26,26,26,0.16)]">
            {manualPeople.map((person, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 py-3">
                <FormField label={person.isUser ? 'Persona 1 · Tú' : `Persona ${index + 1}`} htmlFor={`split-person-${index}`} className="relative">
                  <TextInput
                    id={`split-person-${index}`}
                    value={person.name}
                    onChange={event => handleNameChange(index, event.target.value)}
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() => setFocusedIndex(null)}
                    placeholder="Nombre"
                    disabled={person.isUser}
                    required={!person.isUser}
                  />
                  {renderSuggestions(person, index)}
                </FormField>
                <FormField label="Monto" htmlFor={`split-person-amount-${index}`}>
                  <NumberInput
                    id={`split-person-amount-${index}`}
                    value={person.amount}
                    onChange={event => handleManualAmountChange(index, event.target.value)}
                    min={amountStep}
                    step={amountStep}
                    inputMode="decimal"
                    placeholder="0"
                    required
                  />
                </FormField>
              </div>
            ))}
          </div>
          {!manualMatches && (
            <p className="font-mono text-[10px] text-[#9F2F2D]">
              Diferencia: <CurrencyAmount amount={manualDifference} currencyCode={currency} />
            </p>
          )}
        </section>
      )}

      {showSaveFields && (
        <section className="space-y-4 animate-fade-in">
          {sectionTitle('Registrar deudas')}

          {isEquitative && (
            <div className="space-y-1">
              <p className="font-mono text-[9px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Personas por cobrar</p>
              <div className="divide-y divide-[rgba(26,26,26,0.16)]">
                {manualPeople.slice(1, nPeople).map((person, offset) => {
                  const index = offset + 1;
                  return (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 py-3">
                      <FormField label={`Persona ${index + 1}`} htmlFor={`split-creditor-${index}`} className="relative">
                        <TextInput
                          id={`split-creditor-${index}`}
                          value={person.thirdPartyInput}
                          onChange={event => handleNameChange(index, event.target.value)}
                          onFocus={() => setFocusedIndex(index)}
                          onBlur={() => setFocusedIndex(null)}
                          placeholder="Nombre"
                          required
                        />
                        {renderSuggestions(person, index)}
                      </FormField>
                      <div className="pb-2 text-right font-mono text-[12px] font-[700] text-noria-text">
                        <CurrencyAmount amount={equalShareWithTip} currencyCode={currency} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Descripción" htmlFor="split-description" className="col-span-2">
              <TextInput
                id="split-description"
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder="Ej. Cena grupal"
                required
              />
            </FormField>
            <FormField label="Fecha efectiva" htmlFor="split-date">
              <DateInput id="split-date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} required />
            </FormField>
            <FormField label="Cuenta de pago" htmlFor="split-account">
              <SelectInput id="split-account" value={selectedAccountId} onChange={event => setSelectedAccountId(event.target.value)} required>
                <option value="">Selecciona...</option>
                {compatibleAccounts.map(account => (
                  <option key={account.id} value={account.id}>{getAccountLabel(account)}</option>
                ))}
              </SelectInput>
            </FormField>
          </div>

          <CategorySelect
            id="calculator-category"
            value={selectedTagId}
            onChange={setSelectedTagId}
            tags={tags}
            kind="EXPENSE"
            required
          />

          {selectedTag?.pillar && (
            <div className="flex items-center justify-between border-y border-[rgba(26,26,26,0.16)] py-2">
              <span className="font-mono text-[9px] font-[700] uppercase tracking-[0.1em] text-noria-muted">Pilar derivado</span>
              <PillarTag pillar={selectedTag.pillar} size="xs" />
            </div>
          )}

          {compatibleAccounts.length === 0 && (
            <p className="border-l-2 border-[#9F2F2D] pl-3 text-[11px] leading-relaxed text-[#9F2F2D]">
              No existe una cuenta activa en {currency}. Crea o activa una cuenta compatible antes de registrar este split.
            </p>
          )}
        </section>
      )}

      {saveError && <p className="text-[12px] font-[500] text-[#9F2F2D]">{saveError}</p>}
      {saveSuccess && <p className="font-mono text-[11px] text-[#4F8F58]">Split registrado correctamente.</p>}

      <FormActions
        primaryLabel={showSaveFields ? 'Confirmar y registrar' : 'Crear deudas'}
        primaryDisabled={showSaveFields && compatibleAccounts.length === 0}
        primaryColor="#647C78"
        secondaryLabel={showSaveFields ? 'Volver' : 'Cerrar'}
        onSecondary={() => {
          if (showSaveFields) {
            setShowSaveFields(false);
            setSaveError('');
          } else {
            handleClose();
          }
        }}
      />
    </form>
  );

  if (isSheet) {
    return (
      <FormSheet title="Dividir cuenta" onClose={() => navigate(-1)} showHandle maxHeight="85vh">
        {formContent}
      </FormSheet>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F2ED] pb-24">
      <header className="sticky top-0 z-30 mx-auto flex h-14 max-w-md items-center justify-between border-b border-[#1A1A1A] bg-[#F5F2ED] px-4">
        <button type="button" onClick={() => navigate(-1)} className="-ml-1 p-1 text-noria-text focus:outline-none" aria-label="Volver">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <h2 className="text-[17px] font-[600] leading-tight text-noria-text">Dividir cuenta</h2>
        <div className="h-7 w-7" />
      </header>
      <main className="mx-auto max-w-md px-5 py-5">{formContent}</main>
      <FAB />
      <BottomNav />
    </div>
  );
}
