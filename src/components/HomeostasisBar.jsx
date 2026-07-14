import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function HomeostasisBar() {
  const [expandedPillar, setExpandedPillar] = useState(null); // 'NEED' | 'WANT' | 'SAVE' | null

  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const monthlyIncomeObj = useLiveQuery(() => db.app_config.get('monthlyIncome'));
  const baseCurrency = baseCurrencyObj?.value || 'USD';
  const monthlyIncome = monthlyIncomeObj?.value || 0;

  const transactions = useLiveQuery(async () => {
    const all = await db.transactions.toArray();
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return all.filter(t => new Date(t.date) >= start && t.type === 'OUT');
  }) || [];

  let spentNeeds = 0, spentWants = 0, spentSavings = 0;
  transactions.forEach(t => {
    if (t.pillar === 'NEED') spentNeeds += t.amount;
    if (t.pillar === 'WANT') spentWants += t.amount;
    if (t.pillar === 'SAVE') spentSavings += t.amount;
  });

  const goalNeeds = monthlyIncome * 0.50;
  const goalWants = monthlyIncome * 0.30;
  const goalSavings = monthlyIncome * 0.20;
  const totalSpent = spentNeeds + spentWants + spentSavings || 1;

  const pillars = [
    {
      key: 'NEED',
      label: 'NEEDS',
      pct: '50%',
      spent: spentNeeds,
      goal: goalNeeds,
      color: 'bg-noria-salvia',
      textColor: 'text-noria-salvia',
      segWidth: (spentNeeds / totalSpent) * 100,
      desc: 'Gastos vitales: alquiler, comida, luz, servicios básicos.',
    },
    {
      key: 'WANT',
      label: 'WANTS',
      pct: '30%',
      spent: spentWants,
      goal: goalWants,
      color: 'bg-noria-slate',
      textColor: 'text-noria-slate',
      segWidth: (spentWants / totalSpent) * 100,
      desc: 'Estilo de vida, salidas, entretenimiento, suscripciones.',
    },
    {
      key: 'SAVE',
      label: 'SAVE',
      pct: '20%',
      spent: spentSavings,
      goal: goalSavings,
      color: 'bg-noria-amber',
      textColor: 'text-noria-amber',
      segWidth: (spentSavings / totalSpent) * 100,
      desc: 'Dinero reservado para el futuro y fondo de emergencia.',
    },
  ];

  const togglePillar = (key) => {
    setExpandedPillar(prev => prev === key ? null : key);
  };

  const fmt = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <article>
      {/* Section Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="muji-header">Homeostasis</h3>
        <span className="text-[10px] font-light text-noria-text/40 tracking-wider">
          {new Date().toLocaleString('es-ES', { month: 'long' }).toUpperCase()}
        </span>
      </div>

      {monthlyIncome === 0 ? (
        <p className="text-xs font-light text-noria-text/40 py-2">
          Configura tus ingresos en Configuración para activar la Homeostasis.
        </p>
      ) : (
        <>
          {/* Single segmented bar */}
          <div className="w-full h-[3px] flex rounded-full overflow-hidden mb-5">
            {pillars.map(p => (
              <div
                key={p.key}
                style={{ width: `${Math.max(2, p.segWidth)}%` }}
                className={`${p.color} h-full transition-all duration-500`}
              />
            ))}
          </div>

          {/* Pillar Columns — tappable, each expands inline */}
          <div className="divide-y divide-noria-text/5">
            {pillars.map(p => (
              <div key={p.key}>
                {/* Pillar Row */}
                <button
                  id={`homeostasis-${p.key.toLowerCase()}-btn`}
                  onClick={() => togglePillar(p.key)}
                  className="w-full flex items-center justify-between py-3 focus:outline-none group"
                >
                  <div className="flex items-center space-x-3">
                    <span className={`w-1.5 h-1.5 rounded-full ${p.color}`} />
                    <span className="text-[10px] font-light tracking-widest uppercase text-noria-text/50">
                      {p.label} <span className="text-noria-text/30">({p.pct})</span>
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-light text-noria-text">
                      {fmt(p.spent)} <span className="text-[10px] text-noria-text/40">{baseCurrency}</span>
                    </span>
                    {expandedPillar === p.key
                      ? <ChevronUp size={12} strokeWidth={1.5} className="text-noria-text/30" />
                      : <ChevronDown size={12} strokeWidth={1.5} className="text-noria-text/20 group-hover:text-noria-text/40 transition-colors" />
                    }
                  </div>
                </button>

                {/* Inline Expanded Detail */}
                {expandedPillar === p.key && (
                  <div className="pb-4 pl-4 space-y-3 animate-fade-in" id={`homeostasis-detail-${p.key.toLowerCase()}`}>
                    <p className="text-[11px] font-light text-noria-text/55 leading-relaxed">{p.desc}</p>
                    <div className="flex space-x-8">
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-noria-text/30 mb-0.5">Consumido</p>
                        <p className={`text-base font-light ${p.textColor}`}>{fmt(p.spent)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-noria-text/30 mb-0.5">Límite ideal</p>
                        <p className="text-base font-light text-noria-text">{fmt(p.goal)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-noria-text/30 mb-0.5">Restante</p>
                        <p className={`text-base font-light ${p.spent > p.goal ? 'text-noria-amber' : 'text-noria-text'}`}>
                          {fmt(Math.max(0, p.goal - p.spent))}
                        </p>
                      </div>
                    </div>
                    {p.spent > p.goal && (
                      <p className="text-[10px] text-noria-amber font-light">
                        Superaste el límite por {fmt(p.spent - p.goal)} {baseCurrency}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
