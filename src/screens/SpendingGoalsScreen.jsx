import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { Archive, Link2, Plus } from 'lucide-react';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import FAB from '../components/FAB.jsx';
import CurrencyAmount from '../components/CurrencyAmount.jsx';
import CategorySelect from '../components/CategorySelect.jsx';
import TransactionApplicationSheet from '../components/TransactionApplicationSheet.jsx';
import {
  DateInput,
  FormActions,
  FormField,
  FormSheet,
  NumberInput,
  SelectInput,
  TextInput,
} from '../components/FormSystem.jsx';
import { ensureGoalPeriodsInTransaction, getCurrentGoalPeriod, syncSpendingGoalPeriods } from '../db/spendingGoals.js';

const FREQUENCY_LABELS = {
  DAYS: ['día', 'días'],
  WEEKS: ['semana', 'semanas'],
  MONTHS: ['mes', 'meses'],
  YEARS: ['año', 'años'],
};

const PERIOD_STATUS_LABELS = {
  ACTIVE: 'Activo',
  ACTIVE_PARTIAL: 'Activo parcial',
  COMPLETED: 'Completado',
  PARTIAL: 'Parcial',
  EXPIRED: 'Vencido',
};

const formatFrequency = (interval, unit) => {
  const amount = Math.max(1, Number(interval) || 1);
  const labels = FREQUENCY_LABELS[unit] || ['período', 'períodos'];
  return `Cada ${amount} ${labels[amount === 1 ? 0 : 1]}`;
};

export default function SpendingGoalsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const goals = useLiveQuery(() => db.spending_goals.toArray()) || [];
  const periods = useLiveQuery(() => db.spending_goal_periods.toArray()) || [];
  const currencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const baseCurrencyConfig = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const baseCurrency = baseCurrencyConfig?.value || '';
  const [showForm, setShowForm] = useState(false);
  const [linkingGoal, setLinkingGoal] = useState(null);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [defaultTagId, setDefaultTagId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(true);
  const [frequencyInterval, setFrequencyInterval] = useState('1');
  const [frequencyUnit, setFrequencyUnit] = useState('MONTHS');
  const [error, setError] = useState('');

  useEffect(() => { syncSpendingGoalPeriods(db).catch(console.error); }, [goals.length]);
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setShowForm(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  useEffect(() => { if (!currency && baseCurrency) setCurrency(baseCurrency); }, [currency, baseCurrency]);
  useEffect(() => {
    if (!showForm || defaultTagId) return;
    const suggested = tags.find(tag => (tag.kind || 'EXPENSE') === 'EXPENSE' && tag.pillar === 'WANT');
    if (suggested) setDefaultTagId(String(suggested.id));
  }, [showForm, defaultTagId, tags]);

  const currentPeriods = useMemo(() => {
    return new Map(goals.map(goal => [goal.id, getCurrentGoalPeriod(periods, goal.id)]));
  }, [goals, periods]);

  const resetForm = () => {
    setName(''); setTargetAmount(''); setCurrency(baseCurrency); setDefaultTagId('');
    setStartDate(new Date().toISOString().slice(0, 10)); setEndDate(new Date().toISOString().slice(0, 10));
    setIsRecurring(true); setFrequencyInterval('1'); setFrequencyUnit('MONTHS'); setError('');
  };

  const handleCreate = async event => {
    event.preventDefault();
    setError('');
    const amount = Number(targetAmount);
    if (!name.trim() || !Number.isFinite(amount) || amount <= 0) { setError('Indica un nombre y monto válidos.'); return; }
    if (!isRecurring && endDate < startDate) { setError('La fecha final no puede ser anterior al inicio.'); return; }
    try {
      const id = await db.spending_goals.add({
        name: name.trim(),
        targetAmount: amount,
        currency,
        defaultTagId: defaultTagId ? Number(defaultTagId) : null,
        defaultPillar: tags.find(tag => tag.id === Number(defaultTagId))?.pillar || 'WANT',
        startDate,
        endDate: isRecurring ? null : endDate,
        isRecurring,
        frequencyInterval: isRecurring ? Number(frequencyInterval) : null,
        frequencyUnit: isRecurring ? frequencyUnit : null,
        status: 'ACTIVE',
        createdAt: new Date(),
      });
      const goal = await db.spending_goals.get(id);
      await db.transaction('rw', [db.spending_goal_periods, db.transaction_applications], async () => {
        await ensureGoalPeriodsInTransaction(db, goal, new Date());
      });
      setShowForm(false);
      resetForm();
    } catch (createError) {
      setError(createError.message || 'No se pudo crear el objetivo.');
    }
  };

  return (
    <div className="min-h-screen pb-28 pt-16" style={{ background: '#F5F2ED' }}>
      <div className="w-full max-w-md mx-auto px-6">
        <Header title="Objetivos de gasto" showBack backRoute="/budget" />
        <div className="py-5 space-y-5">
          <div className="flex justify-between items-end border-b border-[#1A1A1A] pb-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-noria-muted">Dinero ya gastado</p>
              <h2 className="text-[18px] font-[600]">Objetivos flexibles</h2>
            </div>
            <button type="button" onClick={() => setShowForm(true)} className="flex items-center gap-1 font-mono text-[10px] uppercase text-[#647C78]"><Plus size={13} /> Nuevo</button>
          </div>
          {goals.filter(goal => goal.status !== 'ARCHIVED').length === 0 ? (
            <p className="border border-[#1A1A1A]/20 p-5 text-center text-[12px] text-noria-muted">Sin objetivos de gasto activos.</p>
          ) : goals.filter(goal => goal.status !== 'ARCHIVED').map(goal => {
            const period = currentPeriods.get(goal.id);
            const progress = Number(period?.progressAmount) || 0;
            const percentage = goal.targetAmount > 0 ? Math.min(100, progress / goal.targetAmount * 100) : 0;
            return (
              <article key={goal.id} className="border border-[#1A1A1A] p-4 space-y-3">
                <div className="flex justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-[600]">{goal.name}</h3>
                    <p className="font-mono text-[9px] uppercase text-noria-muted">
                      {goal.isRecurring ? formatFrequency(goal.frequencyInterval, goal.frequencyUnit) : 'Objetivo único'} · {PERIOD_STATUS_LABELS[period?.status] || 'Activo'}
                    </p>
                  </div>
                  <div className="text-right">
                    <CurrencyAmount amount={progress} currencyCode={goal.currency} className="font-mono text-[13px] font-bold" />
                    <p className="font-mono text-[9px] text-noria-muted">de <CurrencyAmount amount={goal.targetAmount} currencyCode={goal.currency} /></p>
                  </div>
                </div>
                <div className="h-2 border border-[#1A1A1A]/30"><div className="h-full bg-[#647C78]" style={{ width: `${percentage}%` }} /></div>
                {period && <p className="font-mono text-[9px] text-noria-muted">{period.startDate} → {period.endDate}</p>}
                <div className="flex gap-2 border-t border-[#1A1A1A]/15 pt-3">
                  <button type="button" onClick={() => setLinkingGoal(goal)} className="flex items-center gap-1 font-mono text-[9px] uppercase"><Link2 size={12} /> Vincular transacción</button>
                  <button type="button" onClick={() => db.spending_goals.update(goal.id, { status: 'ARCHIVED' })} className="ml-auto flex items-center gap-1 font-mono text-[9px] uppercase text-noria-muted"><Archive size={12} /> Archivar</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <BottomNav />
      <FAB />

      {showForm && (
        <FormSheet title="Nuevo objetivo de gasto" onClose={() => { setShowForm(false); resetForm(); }}>
          <form onSubmit={handleCreate} className="space-y-4">
            <p className="border-l-2 border-[#647C78] pl-3 text-[11px] leading-relaxed text-noria-muted">
              Registra gastos flexibles, como una donación mensual. El período puede cerrar parcial y no reserva dinero como una maceta ni queda pendiente como un pago fijo.
            </p>
            <FormField label="Nombre" htmlFor="goal-name"><TextInput id="goal-name" value={name} onChange={event => setName(event.target.value)} placeholder="Ej. Donación mensual" required /></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Objetivo" htmlFor="goal-amount"><NumberInput id="goal-amount" value={targetAmount} onChange={event => setTargetAmount(event.target.value)} step="0.01" required /></FormField>
              <FormField label="Moneda" htmlFor="goal-currency"><SelectInput id="goal-currency" value={currency} onChange={event => setCurrency(event.target.value)} required>{currencies.filter(item => item.isActive).map(item => <option key={item.code} value={item.code}>{item.code}</option>)}</SelectInput></FormField>
            </div>
            <div>
              <CategorySelect id="goal-category" value={defaultTagId} onChange={setDefaultTagId} tags={tags} kind="EXPENSE" />
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-noria-muted">Para donaciones se sugiere una categoría WANT.</p>
            </div>
            <FormField label="Tipo" htmlFor="goal-type"><SelectInput id="goal-type" value={isRecurring ? 'RECURRING' : 'ONE_TIME'} onChange={event => setIsRecurring(event.target.value === 'RECURRING')}><option value="RECURRING">Recurrente</option><option value="ONE_TIME">Único</option></SelectInput></FormField>
            <FormField label="Inicio" htmlFor="goal-start"><DateInput id="goal-start" value={startDate} onChange={event => setStartDate(event.target.value)} required /></FormField>
            {isRecurring ? (
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Cada" htmlFor="goal-interval"><NumberInput id="goal-interval" value={frequencyInterval} onChange={event => setFrequencyInterval(event.target.value)} min="1" required /></FormField>
                <FormField label="Unidad" htmlFor="goal-unit"><SelectInput id="goal-unit" value={frequencyUnit} onChange={event => setFrequencyUnit(event.target.value)}><option value="DAYS">Días</option><option value="WEEKS">Semanas</option><option value="MONTHS">Meses</option><option value="YEARS">Años</option></SelectInput></FormField>
              </div>
            ) : <FormField label="Final" htmlFor="goal-end"><DateInput id="goal-end" value={endDate} onChange={event => setEndDate(event.target.value)} required /></FormField>}
            {error && <p className="text-[12px] text-[#9F2F2D]">{error}</p>}
            <FormActions primaryLabel="Crear objetivo" />
          </form>
        </FormSheet>
      )}
      <TransactionApplicationSheet
        isOpen={!!linkingGoal}
        onClose={() => setLinkingGoal(null)}
        presetTargetType="SPENDING_GOAL"
        presetTargetId={linkingGoal?.id}
      />
    </div>
  );
}
