import React, { useEffect, useState } from 'react';
import CategorySelect from './CategorySelect.jsx';
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

export default function AnchorFormModal({
  isOpen,
  onClose,
  onSubmit,
  anchor = null,
  activeAccounts = [],
  institutions = [],
  macetas = [],
  tags = [],
  allowedPillars = ['NEED', 'WANT', 'SAVE'],
}) {
  const defaultPillar = allowedPillars[0] || 'NEED';
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [macetaId, setMacetaId] = useState('');
  const [tagId, setTagId] = useState('');
  const [pillar, setPillar] = useState(defaultPillar);
  const [frequencyInterval, setFrequencyInterval] = useState(1);
  const [frequencyUnit, setFrequencyUnit] = useState('MONTHS');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (anchor) {
      setName(anchor.name || '');
      setAmount(anchor.amount || '');
      setAccountId(anchor.accountId ? anchor.accountId.toString() : '');
      setMacetaId(anchor.macetaId ? anchor.macetaId.toString() : '');
      setTagId(anchor.tagId ? anchor.tagId.toString() : '');
      setPillar(allowedPillars.includes(anchor.pillar) ? anchor.pillar : defaultPillar);
      setFrequencyInterval(anchor.frequencyInterval || 1);
      setFrequencyUnit(anchor.frequencyUnit || 'MONTHS');

      if (anchor.nextDueDate) {
        if (typeof anchor.nextDueDate === 'string') {
          setDueDate(anchor.nextDueDate.slice(0, 10));
        } else {
          const dateValue = anchor.nextDueDate instanceof Date ? anchor.nextDueDate : new Date(anchor.nextDueDate);
          setDueDate(!isNaN(dateValue.getTime()) ? dateValue.toISOString().slice(0, 10) : '');
        }
      } else {
        setDueDate('');
      }
    } else {
      setName('');
      setAmount('');
      setDueDate(new Date().toISOString().slice(0, 10));
      setAccountId('');
      setMacetaId('');
      setTagId('');
      setPillar(defaultPillar);
      setFrequencyInterval(1);
      setFrequencyUnit('MONTHS');
    }

    setError('');
  }, [anchor, allowedPillars, defaultPillar, isOpen]);

  if (!isOpen) return null;

  const isEdit = !!anchor;
  const pillarOptions = [
    { value: 'NEED', label: 'Necesidad', color: '#4F8F58' },
    { value: 'WANT', label: 'Deseo', color: '#3F7F9C' },
    { value: 'SAVE', label: 'Ahorro', color: '#C58A14' }
  ].filter(option => allowedPillars.includes(option.value));
  const disabledPillars = isEdit && anchor?.pillar === 'SAVE' ? ['NEED', 'WANT'] : [];

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('El monto debe ser mayor a cero.');
      return;
    }

    const intervalVal = parseInt(frequencyInterval, 10);
    if (isNaN(intervalVal) || intervalVal <= 0) {
      setError('El intervalo debe ser al menos 1.');
      return;
    }

    if (!allowedPillars.includes(pillar)) {
      setError('Este tipo de programacion no esta disponible aqui.');
      return;
    }

    if (pillar !== 'SAVE' && !accountId) {
      setError('Selecciona una cuenta de debito.');
      return;
    }

    if (pillar === 'SAVE' && !macetaId) {
      setError('Selecciona una meta de ahorro.');
      return;
    }

    onSubmit({
      name: name.trim(),
      amount: parsedAmount,
      nextDueDate: dueDate || null,
      pillar,
      accountId: pillar !== 'SAVE' ? parseInt(accountId, 10) : null,
      macetaId: pillar === 'SAVE' ? parseInt(macetaId, 10) : null,
      tagId: pillar !== 'SAVE' && tagId ? parseInt(tagId, 10) : null,
      frequencyInterval: intervalVal,
      frequencyUnit,
    });
  };

  return (
    <FormSheet title={isEdit ? 'Editar Programacion' : 'Nueva Programacion'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4" id="anchor-form">
        <FormField label="Nombre" htmlFor="anchor-name">
          <TextInput
            id="anchor-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej. Alquiler, Aporte Fondo Emergencia, Netflix"
            required
            autoFocus={!isEdit}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Monto (USD)" htmlFor="anchor-amount">
            <NumberInput
              id="anchor-amount"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </FormField>
          <FormField label="Fecha de inicio/estimada" htmlFor="anchor-date">
            <DateInput id="anchor-date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </FormField>
        </div>

        <SegmentedChoice
          label="Pilar"
          value={pillar}
          onChange={setPillar}
          options={pillarOptions}
          disabledValues={disabledPillars}
        />

        {pillar !== 'SAVE' && (
          <CategorySelect
            id="anchor-form-category"
            value={tagId}
            onChange={setTagId}
            tags={tags}
            kind="EXPENSE"
            className="max-w-[320px]"
          />
        )}

        {pillar === 'SAVE' ? (
          <FormField label="Vincular a meta" htmlFor="anchor-maceta">
            <SelectInput id="anchor-maceta" value={macetaId} onChange={e => setMacetaId(e.target.value)} required>
              <option value="" disabled>Selecciona Meta...</option>
              {macetas.map(maceta => (
                <option key={maceta.id} value={maceta.id}>{maceta.name}</option>
              ))}
            </SelectInput>
          </FormField>
        ) : (
          <FormField label="Cuenta de debito" htmlFor="anchor-account">
            <SelectInput id="anchor-account" value={accountId} onChange={e => setAccountId(e.target.value)} required>
              <option value="" disabled>Selecciona Cuenta...</option>
              {activeAccounts.map(account => {
                const inst = institutions.find(item => item.id === account.institutionId);
                const label = inst ? `${inst.name} - ${account.name} (${account.type})` : `${account.name} (${account.type})`;
                return <option key={account.id} value={account.id}>{label}</option>;
              })}
            </SelectInput>
          </FormField>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Repetir cada" htmlFor="anchor-frequency-interval">
            <NumberInput
              id="anchor-frequency-interval"
              min="1"
              step="1"
              value={frequencyInterval}
              onChange={e => setFrequencyInterval(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Unidad" htmlFor="anchor-frequency-unit">
            <SelectInput id="anchor-frequency-unit" value={frequencyUnit} onChange={e => setFrequencyUnit(e.target.value)} required>
              <option value="DAYS">Dias</option>
              <option value="WEEKS">Semanas</option>
              <option value="MONTHS">Meses</option>
              <option value="YEARS">Anos</option>
            </SelectInput>
          </FormField>
        </div>

        {error && <p className="text-[12px] font-[500] text-[#9F2F2D]">{error}</p>}

        <FormActions primaryLabel={isEdit ? 'Guardar cambios' : 'Confirmar programacion'} />
      </form>
    </FormSheet>
  );
}
