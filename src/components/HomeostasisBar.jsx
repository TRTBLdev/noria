import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { ChevronUp } from 'lucide-react';

export default function HomeostasisBar() {
  const [expanded, setExpanded] = useState(null); // 'NEED' | 'WANT' | 'SAVE' | null

  const baseCurrencyObj  = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const monthlyIncomeObj = useLiveQuery(() => db.app_config.get('monthlyIncome'));
  // Configurable pillar percentages (default 50/30/20)
  const pillarPctObj     = useLiveQuery(() => db.app_config.get('pillarPct'));

  const baseCurrency   = baseCurrencyObj?.value  || 'USD';
  const monthlyIncome  = monthlyIncomeObj?.value  || 0;
  const pillarPct      = pillarPctObj?.value      || { NEED: 50, WANT: 30, SAVE: 20 };

  const transactions = useLiveQuery(async () => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const all = await db.transactions.toArray();
    return all.filter(t => new Date(t.date) >= start && t.type === 'OUT');
  }) || [];

  let spentNeeds = 0, spentWants = 0, spentSavings = 0;
  transactions.forEach(t => {
    if (t.pillar === 'NEED') spentNeeds  += t.amount;
    if (t.pillar === 'WANT') spentWants  += t.amount;
    if (t.pillar === 'SAVE') spentSavings += t.amount;
  });

  const goalNeeds    = monthlyIncome * (pillarPct.NEED / 100);
  const goalWants    = monthlyIncome * (pillarPct.WANT / 100);
  const goalSavings  = monthlyIncome * (pillarPct.SAVE / 100);

  const pillars = [
    {
      key: 'NEED',
      label: `NECESIDADES (${pillarPct.NEED}%)`,
      shortLabel: 'NECESIDADES',
      spent: spentNeeds,
      goal:  goalNeeds,
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
      goal:  goalWants,
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
      goal:  goalSavings,
      color: '#C58A14',          // ahorro
      barBg: 'rgba(197,138,20,0.12)',
      textColor: '#C58A14',
      desc: 'Dinero reservado para el futuro y fondo de emergencia.',
    },
  ];

  const fmt = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (monthlyIncome === 0) {
    return (
      <article>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[17px] font-[600] text-noria-text leading-tight">Homeostasis</h3>
          <span className="label-section">{new Date().toLocaleString('es-ES', { month: 'long' }).toUpperCase()}</span>
        </div>
        <p className="text-body text-noria-muted py-3">
          Configura tu ingreso mensual en Configuración para ver tu homeostasis.
        </p>
      </article>
    );
  }

  return (
    <article>
      {/* Header */}
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-[17px] font-[600] text-noria-text leading-tight">Homeostasis</h3>
        <span className="label-section">{new Date().toLocaleString('es-ES', { month: 'long' }).toUpperCase()}</span>
      </div>

      {/* ── 3 columnas horizontales (exactamente como la referencia) ── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {pillars.map(p => (
          <button
            key={p.key}
            id={`homeostasis-col-${p.key.toLowerCase()}`}
            onClick={() => setExpanded(prev => prev === p.key ? null : p.key)}
            className="flex flex-col space-y-2 text-left focus:outline-none group"
            style={{ paddingTop: '0' }}
          >
            {/* Barra superior recta */}
            <div className="w-full h-[5px] overflow-hidden" style={{ background: 'rgba(26,26,26,0.12)' }}>
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, p.goal > 0 ? (p.spent / p.goal) * 100 : 0)}%`,
                  background: p.color,
                }}
              />
            </div>
            {/* Label */}
            <p className="label-section leading-tight" style={{ color: '#1A1A1A', fontSize: '9px', opacity: 0.58 }}>
              {p.label}
            </p>
            {/* Monto gastado */}
            <p className="text-[15px] font-[400] text-noria-text leading-none">
              ${fmt(p.spent)}
            </p>
          </button>
        ))}
      </div>

      {/* ── Accordion de desglose — aparece debajo de las columnas ── */}
      {pillars.map(p => expanded === p.key && (
        <div
          key={`detail-${p.key}`}
          id={`homeostasis-detail-${p.key.toLowerCase()}`}
          className="animate-fade-in border border-[#1A1A1A] p-4 mb-2 space-y-3"
          style={{ background: 'transparent' }}
        >
          {/* Barra de progreso individual */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="label-section" style={{ color: p.textColor }}>{p.shortLabel}</span>
              <span className="label-section text-noria-muted">
                {p.goal > 0 ? `${Math.min(100, Math.round((p.spent / p.goal) * 100))}%` : '–'}
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(100, p.goal > 0 ? (p.spent / p.goal) * 100 : 0)}%`,
                  background: p.color,
                }}
              />
            </div>
          </div>

          {/* Monto consumido vs límite */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <p className="label-section mb-0.5">Consumido</p>
              <p className="text-[15px] font-[400]" style={{ color: p.textColor }}>${fmt(p.spent)}</p>
            </div>
            <div>
              <p className="label-section mb-0.5">Límite</p>
              <p className="text-[15px] font-[400] text-noria-text">${fmt(p.goal)}</p>
            </div>
            <div>
              <p className="label-section mb-0.5">Restante</p>
              <p
                className="text-[15px] font-[400]"
                style={{ color: p.spent > p.goal ? '#C58A14' : '#4F8F58' }}
              >
                ${fmt(Math.max(0, p.goal - p.spent))}
              </p>
            </div>
          </div>

          {/* Descripción + alerta si se superó */}
          <p className="text-[12px] text-noria-muted leading-relaxed">{p.desc}</p>
          {p.spent > p.goal && (
            <p className="text-[11px] font-[500]" style={{ color: '#C58A14' }}>
              Superaste el límite por ${fmt(p.spent - p.goal)} {baseCurrency}.
            </p>
          )}

          {/* Cerrar */}
          <button
            onClick={() => setExpanded(null)}
            className="flex items-center space-x-1 pt-1 focus:outline-none"
            style={{ color: 'rgba(26,26,26,0.35)', fontSize: '10px' }}
          >
            <ChevronUp size={12} strokeWidth={1.5} />
            <span className="label-section" style={{ color: 'inherit' }}>Cerrar</span>
          </button>
        </div>
      ))}
    </article>
  );
}
