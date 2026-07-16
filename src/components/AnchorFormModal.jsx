import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function AnchorFormModal({
  isOpen,
  onClose,
  onSubmit,
  anchor = null, // null significa modo creación
  activeAccounts = [],
  institutions = [],
  macetas = [],
  allowedPillars = ['NEED', 'WANT', 'SAVE'],
}) {
  const defaultPillar = allowedPillars[0] || 'NEED';
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [macetaId, setMacetaId] = useState('');
  const [pillar, setPillar] = useState('NEED');
  const [frequencyInterval, setFrequencyInterval] = useState(1);
  const [frequencyUnit, setFrequencyUnit] = useState('MONTHS');
  const [error, setError] = useState('');

  // Sincronizar el formulario con el anchor provisto (si es edición)
  useEffect(() => {
    if (anchor) {
      setName(anchor.name || '');
      setAmount(anchor.amount || '');
      // Formatear fecha para input type="date" (YYYY-MM-DD)
      if (anchor.nextDueDate) {
        if (typeof anchor.nextDueDate === 'string') {
          setDueDate(anchor.nextDueDate.slice(0, 10));
        } else {
          const d = anchor.nextDueDate instanceof Date ? anchor.nextDueDate : new Date(anchor.nextDueDate);
          if (!isNaN(d.getTime())) {
            setDueDate(d.toISOString().slice(0, 10));
          } else {
            setDueDate('');
          }
        }
      } else {
        setDueDate('');
      }
      setAccountId(anchor.accountId ? anchor.accountId.toString() : '');
      setMacetaId(anchor.macetaId ? anchor.macetaId.toString() : '');
      setPillar(allowedPillars.includes(anchor.pillar) ? anchor.pillar : defaultPillar);
      setFrequencyInterval(anchor.frequencyInterval || 1);
      setFrequencyUnit(anchor.frequencyUnit || 'MONTHS');
    } else {
      // Valores por defecto para creación
      setName('');
      setAmount('');
      setDueDate(new Date().toISOString().slice(0, 10));
      setAccountId('');
      setMacetaId('');
      setPillar(defaultPillar);
      setFrequencyInterval(1);
      setFrequencyUnit('MONTHS');
    }
    setError('');
  }, [anchor, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('El monto debe ser un número mayor a cero.');
      return;
    }

    const intervalVal = parseInt(frequencyInterval);
    if (isNaN(intervalVal) || intervalVal <= 0) {
      setError('El intervalo de frecuencia debe ser al menos 1.');
      return;
    }

    if (!allowedPillars.includes(pillar)) {
      setError('Este tipo de programacion no esta disponible en esta seccion.');
      return;
    }

    if (pillar !== 'SAVE' && !accountId) {
      setError('Debes seleccionar una cuenta asociada de débito para gastos programados.');
      return;
    }

    if (pillar === 'SAVE' && !macetaId) {
      setError('Debes vincular este ahorro programado a una de tus Metas.');
      return;
    }

    const data = {
      name: name.trim(),
      amount: parsedAmount,
      nextDueDate: dueDate || null,
      pillar,
      accountId: pillar !== 'SAVE' ? parseInt(accountId) : null,
      macetaId: pillar === 'SAVE' ? parseInt(macetaId) : null,
      frequencyInterval: intervalVal,
      frequencyUnit,
    };

    onSubmit(data);
  };

  const isEdit = !!anchor;
  const pillarOptions = [
    ['NEED', 'N', '#5C7A52'],
    ['WANT', 'W', '#4A6475'],
    ['SAVE', 'S', '#B8860B']
  ].filter(([val]) => allowedPillars.includes(val));

  return (
    <>
      <div className="fixed inset-0 bg-[rgba(26,26,26,0.15)] z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up border-t-2 border-l-2 border-r-2 border-[#1A1A1A]"
        style={{ background: '#F5F2ED' }}>
        <form onSubmit={handleSubmit} className="px-6 pt-6 pb-10 space-y-4" id="anchor-form">

          <div className="flex justify-between items-center">
            <h4 className="text-[16px] font-[400] text-noria-text">
              {isEdit ? 'Editar Programación' : 'Nueva Programación'}
            </h4>
            <button type="button" onClick={onClose}
              className="focus:outline-none p-1 text-noria-muted hover:text-noria-text transition-colors">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Nombre */}
          <div>
            <label className="muji-header block mb-1">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej. Alquiler, Aporte Fondo Emergencia, Netflix"
              className="muji-input"
              required
              autoFocus={!isEdit}
            />
          </div>

          {/* Monto y Fecha */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="muji-header block mb-1">Monto (USD)</label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="muji-input"
                required
              />
            </div>
            <div>
              <label className="muji-header block mb-1">Fecha de inicio/Estimada</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="muji-input"
              />
            </div>
          </div>

          {/* Frecuencia Flexible */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="muji-header block mb-1">Repetir cada</label>
              <input
                type="number"
                min="1"
                step="1"
                value={frequencyInterval}
                onChange={e => setFrequencyInterval(e.target.value)}
                className="muji-input"
                required
              />
            </div>
            <div>
              <label className="muji-header block mb-1">Unidad</label>
              <select
                value={frequencyUnit}
                onChange={e => setFrequencyUnit(e.target.value)}
                className="muji-input"
                required
              >
                <option value="DAYS">Días</option>
                <option value="WEEKS">Semanas</option>
                <option value="MONTHS">Meses</option>
                <option value="YEARS">Años</option>
              </select>
            </div>
          </div>

          {/* Pilar y Condicional */}
          <div className="grid grid-cols-2 gap-4">
            {/* Pilar */}
            <div>
              <label className="muji-header block mb-2">Pilar</label>
              <div className="flex space-x-1">
                {pillarOptions.map(([val, short, col]) => {
                  const isSelected = pillar === val;
                  // Si estamos editando y el anchor es de tipo SAVE, deshabilitamos cambiar a otros pilares
                  // para evitar desastres y pérdida de consistencia con las macetas
                  const disabled = isEdit && anchor?.pillar === 'SAVE' && val !== 'SAVE';

                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPillar(val)}
                      disabled={disabled}
                      className="flex-1 py-1 text-[10px] font-[500] uppercase rounded border transition-all disabled:opacity-30"
                      style={{
                        borderColor: isSelected ? col : 'rgba(26,26,26,0.10)',
                        color: isSelected ? col : 'rgba(26,26,26,0.35)',
                        background: isSelected ? 'rgba(26,26,26,0.02)' : 'transparent',
                      }}
                    >
                      {short}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cuenta Asociada o Meta Asociada según Pilar */}
            <div>
              {pillar === 'SAVE' ? (
                <>
                  <label className="muji-header block mb-1">Vincular a Meta</label>
                  <select
                    value={macetaId}
                    onChange={e => setMacetaId(e.target.value)}
                    className="muji-input animate-fade-in"
                    required
                  >
                    <option value="" disabled>Selecciona Meta...</option>
                    {macetas.map(m => (
                      <option key={m.id} value={m.id}>
                        🎯 {m.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="muji-header block mb-1">Cuenta de Débito</label>
                  <select
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                    className="muji-input animate-fade-in"
                    required
                  >
                    <option value="" disabled>Selecciona Cuenta...</option>
                    {activeAccounts.map(acc => {
                      const inst = institutions.find(i => i.id === acc.institutionId);
                      const label = inst ? `${inst.name} · ${acc.name} (${acc.type})` : `${acc.name} (${acc.type})`;
                      return <option key={acc.id} value={acc.id}>{label}</option>;
                    })}
                  </select>
                </>
              )}
            </div>
          </div>

          {error && (
            <p className="text-[12px] font-[500] text-center" style={{ color: '#B8860B' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="brut-btn w-full py-3.5 mt-2"
          >
            {isEdit ? 'Guardar Cambios' : 'Confirmar Programación'}
          </button>
        </form>
      </div>
    </>
  );
}
