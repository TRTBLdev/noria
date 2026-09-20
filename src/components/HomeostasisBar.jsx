import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { ChevronUp } from 'lucide-react';
import { convertAmountToBase } from '../utils/currency.js';
import CurrencyAmount from './CurrencyAmount.jsx';

export default function HomeostasisBar() {
  const [expanded, setExpanded] = useState(null); // 'NEED' | 'WANT' | 'SAVE' | null

  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const monthlyIncomeObj = useLiveQuery(() => db.app_config.get('monthlyIncome'));
  const homeostasisBaseObj = useLiveQuery(() => db.app_config.get('homeostasisBase'));
  // Configurable pillar percentages (default 50/30/20)
  const pillarPctObj = useLiveQuery(() => db.app_config.get('pillarPct'));
  const dbCurrencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const lots = useLiveQuery(() => db.lots.toArray()) || [];
  const anchors = useLiveQuery(() => db.anchors.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const savingsContributions = useLiveQuery(() => db.savings_contributions.toArray()) || [];

  const baseCurrency = baseCurrencyObj?.value || '';
  const monthlyIncome = monthlyIncomeObj?.value || 0;
  const pillarPct = pillarPctObj?.value || { NEED: 50, WANT: 30, SAVE: 20 };
  const isRealMode = homeostasisBaseObj?.value === 'REAL';

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Aportes a metas de ahorro de este mes (anclas y aportes a macetas)
  const thisMonthInstances = anchors.filter(a => {
    if (a.isTemplate !== false) return false;
    const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate + 'T12:00:00');
    return d >= startOfMonth && d <= endOfMonth;
  });
  const thisMonthAhorros = thisMonthInstances.filter(a => a.pillar === 'SAVE');
  const paidAhorrosFromAnchors = thisMonthAhorros.reduce((sum, a) => (
    sum + (convertAmountToBase(Number(a.contributedAmount) || (a.status === 'PAID' ? a.amount : 0), a.currency, baseCurrency, lots, dbCurrencies) || 0)
  ), 0);

  const thisMonthAnchorIds = new Set(thisMonthAhorros.map(a => a.id));
  const directContributions = savingsContributions
    .filter(c => {
      const d = new Date(c.date || c.createdAt);
      return d >= startOfMonth && d <= endOfMonth && (!c.anchorId || !thisMonthAnchorIds.has(c.anchorId));
    })
    .reduce((sum, c) => (
      sum + (convertAmountToBase(Number(c.amount) || 0, c.currency, baseCurrency, lots, dbCurrencies) || 0)
    ), 0);

  const totalPaidAhorros = paidAhorrosFromAnchors + directContributions;

  // Transacciones del mes
  const allMonthTransactions = useLiveQuery(async () => {
    const all = await db.transactions.toArray();
    return all.filter(t => new Date(t.date) >= startOfMonth && new Date(t.date) <= endOfMonth);
  }) || [];

  const outTransactions = allMonthTransactions.filter(t => t.type === 'OUT');
  const inTransactions = allMonthTransactions.filter(t => t.type === 'IN' && t.cashflowKind !== 'LOAN_PROCEEDS');

  const realIncomeMonth = inTransactions.reduce((sum, t) => {
    const amtBase = t.baseCurrency === baseCurrency && Number.isFinite(t.baseAmount)
      ? t.baseAmount
      : convertAmountToBase(t.amount, t.currency, baseCurrency, lots, dbCurrencies);
    return sum + (amtBase || 0);
  }, 0);

  // Base efectiva de ingreso
  const effectiveIncome = (isRealMode && realIncomeMonth > 0) ? realIncomeMonth : monthlyIncome;
  const isFallbackToEstimated = isRealMode && realIncomeMonth <= 0 && monthlyIncome > 0;

  const handleToggleBase = async (mode) => {
    await db.app_config.put({ key: 'homeostasisBase', value: mode });
  };

  let spentNeeds = 0, spentWants = 0, spentSavings = totalPaidAhorros;
  outTransactions.forEach(t => {
    const amtBase = t.baseCurrency === baseCurrency && Number.isFinite(t.baseAmount)
      ? t.baseAmount
      : convertAmountToBase(t.amount, t.currency, baseCurrency, lots, dbCurrencies);
    if (amtBase === null) return;
    const pillar = t.pillar || (t.tagId ? tags.find(tg => tg.id === t.tagId)?.pillar : null);
    if (pillar === 'NEED') spentNeeds += amtBase;
    if (pillar === 'WANT') spentWants += amtBase;
    if (pillar === 'SAVE') spentSavings += amtBase;
  });

  const goalNeeds = effectiveIncome * (pillarPct.NEED / 100);
  const goalWants = effectiveIncome * (pillarPct.WANT / 100);
  const goalSavings = effectiveIncome * (pillarPct.SAVE / 100);

  const pillars = [
    {
      key: 'NEED',
      label: `NECESIDADES (${pillarPct.NEED}%)`,
      shortLabel: 'NECESIDADES',
      spent: spentNeeds,
      goal: goalNeeds,
      color: '#4F8F58',          // necesidades
      barBg: 'rgba(79,143,88,0.12)',
      textColor: '#4F8F58',
      desc: 'Gastos vitales: alquiler, comida, luz, servicios básicos.',
    },
    {
      key: 'WANT',
      label: `DESEOS (${pillarPct.WANT}%)`,
      shortLabel: 'DESEOS',
      spent: spentWants,
      goal: goalWants,
      color: '#3F7F9C',          // deseos
      barBg: 'rgba(63,127,156,0.12)',
      textColor: '#3F7F9C',
      desc: 'Estilo de vida, salidas, entretenimiento, suscripciones.',
    },
    {
      key: 'SAVE',
      label: `AHORRO (${pillarPct.SAVE}%)`,
      shortLabel: 'AHORRO',
      spent: spentSavings,
      goal: goalSavings,
      color: '#C58A14',          // ahorro
      barBg: 'rgba(197,138,20,0.12)',
      textColor: '#C58A14',
      desc: 'Dinero reservado para el futuro y fondo de emergencia.',
    },
  ];

  if (effectiveIncome === 0) {
    return (
      <article>
        <div className="flex justify-between items-center pb-3 mb-3 border-b border-[#1A1A1A]">
          <h3 className="text-[17px] font-[600] text-noria-text leading-tight">Homeostasis</h3>
          <span className="label-section">{new Date().toLocaleString('es-ES', { month: 'long' }).toUpperCase()}</span>
        </div>
        <p className="text-body text-noria-muted py-3">
          Configura tu ingreso mensual en Configuración o registra ingresos para ver tu homeostasis.
        </p>
      </article>
    );
  }

  return (
    <article>
      {/* Header */}
      <div className="pb-3 mb-4 border-b border-[#1A1A1A] space-y-1.5">
        <div className="flex justify-between items-center">
          <h3 className="text-[17px] font-[600] text-noria-text leading-tight">Homeostasis</h3>
          {/* Selector Estimado / Real - Estilo tipográfico sutil */}
          <div className="inline-flex items-center font-mono text-[9px] uppercase tracking-[0.12em] text-noria-muted">
            <button
              type="button"
              onClick={() => handleToggleBase('ESTIMATED')}
              className={`transition-colors focus:outline-none ${!isRealMode ? 'text-noria-text font-[700] border-b border-[#1A1A1A] pb-0.5' : 'hover:text-noria-text pb-0.5'}`}
            >
              Estimado
            </button>
            <span className="mx-1.5 opacity-30">|</span>
            <button
              type="button"
              onClick={() => handleToggleBase('REAL')}
              className={`transition-colors focus:outline-none ${isRealMode ? 'text-noria-text font-[700] border-b border-[#1A1A1A] pb-0.5' : 'hover:text-noria-text pb-0.5'}`}
            >
              Real
            </button>
          </div>
        </div>

        {/* Subtítulo contextual de base */}
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.08em] text-noria-muted">
          <span>
            Base: <CurrencyAmount amount={effectiveIncome} currencyCode={baseCurrency} className="text-noria-text font-bold" />
            {isRealMode ? (isFallbackToEstimated ? ' (Sin ingresos · Estimado)' : ' (Ingresos reales)') : ' (Estimado)'}
          </span>
          <span className="text-[9px]">{new Date().toLocaleString('es-ES', { month: 'short' }).toUpperCase()}</span>
        </div>
      </div>

      {/* ── 3 columnas horizontales (Enfoque en acción inmediata: Restan / Exceso) ── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {pillars.map(p => {
          const isOver = p.goal > 0 && p.spent > p.goal;
          const remaining = Math.max(0, p.goal - p.spent);
          const excess = Math.max(0, p.spent - p.goal);
          const pct = p.goal > 0 ? Math.round((p.spent / p.goal) * 100) : 0;

          return (
            <button
              key={p.key}
              id={`homeostasis-col-${p.key.toLowerCase()}`}
              onClick={() => setExpanded(prev => prev === p.key ? null : p.key)}
              className="flex flex-col space-y-1.5 text-left focus:outline-none group p-1 -m-1 transition-colors hover:bg-noria-text/5"
            >
              {/* Barra superior recta */}
              <div className="w-full h-[5px] overflow-hidden" style={{ background: 'rgba(26,26,26,0.12)' }}>
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, p.goal > 0 ? (p.spent / p.goal) * 100 : 0)}%`,
                    background: isOver ? '#9F2F2D' : p.color,
                  }}
                />
              </div>

              {/* Label + % consumido */}
              <div className="flex items-center justify-between w-full">
                <p className="label-section leading-tight truncate" style={{ color: '#1A1A1A', fontSize: '9px', opacity: 0.58 }}>
                  {p.label}
                </p>
                <span
                  className="font-mono text-[8px] font-[700] shrink-0 ml-1"
                  style={{ color: isOver ? '#9F2F2D' : 'rgba(26,26,26,0.5)' }}
                >
                  {pct}%
                </span>
              </div>

              {/* Monto Restante o Exceso */}
              <div>
                <p
                  className="font-mono text-[8px] font-[700] uppercase tracking-[0.1em] mb-0.5"
                  style={{ color: isOver ? '#9F2F2D' : 'rgba(26,26,26,0.5)' }}
                >
                  {isOver ? 'Exceso' : 'Restan'}
                </p>
                <CurrencyAmount
                  amount={isOver ? excess : remaining}
                  currencyCode={baseCurrency}
                  className="text-[14px] font-[600] leading-none tabular-nums"
                  style={{ color: isOver ? '#9F2F2D' : 'inherit' }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Accordion de desglose — desglose matemático completo (Consumido / Límite / Restante) ── */}
      {pillars.map(p => {
        if (expanded !== p.key) return null;
        const isOver = p.goal > 0 && p.spent > p.goal;
        const remaining = Math.max(0, p.goal - p.spent);
        const excess = Math.max(0, p.spent - p.goal);
        const pct = p.goal > 0 ? Math.round((p.spent / p.goal) * 100) : 0;

        return (
          <div
            key={`detail-${p.key}`}
            id={`homeostasis-detail-${p.key.toLowerCase()}`}
            className="animate-fade-in border border-[#1A1A1A] p-4 mb-2 space-y-3"
            style={{ background: 'transparent' }}
          >
            {/* Barra de progreso individual */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="label-section" style={{ color: isOver ? '#9F2F2D' : p.textColor }}>{p.shortLabel}</span>
                <span className="label-section font-bold" style={{ color: isOver ? '#9F2F2D' : 'inherit' }}>
                  {p.goal > 0 ? `${pct}% consumido` : '–'}
                </span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(100, p.goal > 0 ? (p.spent / p.goal) * 100 : 0)}%`,
                    background: isOver ? '#9F2F2D' : p.color,
                  }}
                />
              </div>
            </div>

            {/* Monto consumido vs límite vs restante */}
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[rgba(26,26,26,0.1)]">
              <div>
                <p className="label-section mb-0.5">Consumido</p>
                <CurrencyAmount amount={p.spent} currencyCode={baseCurrency} className="text-[14px] font-[600] tabular-nums" style={{ color: isOver ? '#9F2F2D' : p.textColor }} />
              </div>
              <div>
                <p className="label-section mb-0.5">Límite</p>
                <CurrencyAmount amount={p.goal} currencyCode={baseCurrency} className="text-[14px] font-[600] text-noria-text tabular-nums" />
              </div>
              <div>
                <p className="label-section mb-0.5">{isOver ? 'Exceso' : 'Restante'}</p>
                <CurrencyAmount
                  amount={isOver ? excess : remaining}
                  currencyCode={baseCurrency}
                  className="text-[14px] font-[600] tabular-nums"
                  style={{ color: isOver ? '#9F2F2D' : '#4F8F58' }}
                />
              </div>
            </div>

            {/* Descripción + alerta si se superó */}
            <p className="text-[11px] text-noria-muted leading-relaxed">{p.desc}</p>
            {isOver && (
              <p className="text-[11px] font-[600] p-2 border border-[#9F2F2D]/30 bg-[#9F2F2D]/5" style={{ color: '#9F2F2D' }}>
                Superaste la cuota de {p.shortLabel.toLowerCase()} por <CurrencyAmount amount={excess} currencyCode={baseCurrency} /> ({pct}% del límite).
              </p>
            )}

            {/* Cerrar */}
            <button
              onClick={() => setExpanded(null)}
              className="flex items-center space-x-1 pt-1 focus:outline-none hover:text-noria-text"
              style={{ color: 'rgba(26,26,26,0.5)', fontSize: '10px' }}
            >
              <ChevronUp size={12} strokeWidth={1.5} />
              <span className="label-section" style={{ color: 'inherit' }}>Cerrar</span>
            </button>
          </div>
        );
      })}
    </article>
  );
}
