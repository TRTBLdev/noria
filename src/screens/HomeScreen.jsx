import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import HomeostasisBar from '../components/HomeostasisBar.jsx';
import FAB from '../components/FAB.jsx';
import { Plus, Check, ChevronDown, ChevronUp, Home, Zap, Monitor } from 'lucide-react';

// Semantic icon map for anchor types
const ANCHOR_ICONS = {
  Alquiler: <Home size={16} strokeWidth={1.5} />,
  Luz: <Zap size={16} strokeWidth={1.5} />,
  Internet: <Monitor size={16} strokeWidth={1.5} />,
  default: null, // Will show a simple circle marker
};

function AnchorIcon({ name }) {
  const icon = ANCHOR_ICONS[name] || null;
  if (icon) return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center"
      style={{ background: 'rgba(26,26,26,0.05)', color: 'rgba(26,26,26,0.4)' }}>
      {icon}
    </div>
  );
  // Fallback: first letter
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center"
      style={{ background: 'rgba(26,26,26,0.05)', color: 'rgba(26,26,26,0.4)' }}>
      <span className="text-[13px] font-[500]">{name?.[0]?.toUpperCase() || '?'}</span>
    </div>
  );
}

export default function HomeScreen() {
  const [showAddAnchorModal, setShowAddAnchorModal] = useState(false);
  const [showIncomes, setShowIncomes] = useState(false);

  const [anchorName, setAnchorName]         = useState('');
  const [anchorAmount, setAnchorAmount]     = useState('');
  const [anchorPillar, setAnchorPillar]     = useState('NEED');
  const [anchorAccountId, setAnchorAccountId] = useState('');
  const [anchorDueDate, setAnchorDueDate]   = useState('');
  const [anchorError, setAnchorError]       = useState('');

  const baseCurrencyObj  = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const baseCurrency     = baseCurrencyObj?.value || 'USD';

  const accounts      = useLiveQuery(() => db.accounts.toArray())      || [];
  const anchors       = useLiveQuery(() => db.anchors.toArray())       || [];
  const transactions  = useLiveQuery(() => db.transactions.toArray())  || [];
  const incomeSources = useLiveQuery(() => db.income_sources.toArray()) || [];

  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
  const thisMonthIncomes = transactions.filter(t => new Date(t.date) >= startOfMonth && t.type === 'IN');

  const activeAccounts = accounts.filter(a => !a.isArchived);
  const aggregatedBalance = activeAccounts.reduce((sum, acc) => sum + acc.balance, 0);

  const incomeSum = thisMonthIncomes.reduce((sum, inc) => sum + inc.amount, 0);

  const pendingAnchors = anchors.filter(a => a.status === 'PENDING');
  const paidAnchors   = anchors.filter(a => a.status === 'PAID');

  const getSourceName = (id) => incomeSources.find(s => s.id === id)?.name || null;

  const handlePayAnchor = async (anchor) => {
    if (!confirm(`¿Marcar "${anchor.name}" como pagado?`)) return;
    const account = accounts.find(a => a.id === anchor.accountId);
    if (!account) { alert('Cuenta no encontrada'); return; }
    await db.transactions.add({
      date: new Date(), type: 'OUT', amount: anchor.amount, currency: anchor.currency,
      accountId: anchor.accountId, tagId: null, pillar: anchor.pillar,
      incomeSourceId: null, description: `Ancla: ${anchor.name}`
    });
    await db.accounts.update(anchor.accountId, { balance: account.balance - anchor.amount });
    await db.anchors.update(anchor.id, { status: 'PAID' });
  };

  const handleCreateAnchor = async (e) => {
    e.preventDefault(); setAnchorError('');
    const amt = parseFloat(anchorAmount);
    if (isNaN(amt) || amt <= 0) { setAnchorError('Monto inválido'); return; }
    if (!anchorAccountId) { setAnchorError('Selecciona una cuenta'); return; }
    const selectedAcc = accounts.find(a => a.id.toString() === anchorAccountId);
    await db.anchors.add({
      name: anchorName.trim(), type: 'FIXED', amount: amt, currency: selectedAcc.currency,
      accountId: parseInt(anchorAccountId),
      nextDueDate: anchorDueDate ? new Date(anchorDueDate + 'T12:00:00') : null,
      status: 'PENDING', pillar: anchorPillar
    });
    setShowAddAnchorModal(false);
    setAnchorName(''); setAnchorAmount(''); setAnchorDueDate(''); setAnchorAccountId('');
  };

  const fmt = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2 });

  const pillarColor = (p) =>
    p === 'NEED' ? '#5C7A52' : p === 'WANT' ? '#4A6475' : '#B8860B';
  const pillarBg = (p) =>
    p === 'NEED' ? 'rgba(92,122,82,0.10)' : p === 'WANT' ? 'rgba(74,100,117,0.10)' : 'rgba(184,134,11,0.10)';

  return (
    <div className="min-h-screen pb-32 pt-16" style={{ background: '#F5F2ED' }}>
      <Header title="Noria" />

      <main className="px-6 max-w-md mx-auto">

        {/* ── Balance hero — solo número, sin label ── */}
        <section className="py-8" id="balance-hero">
          <p className="text-hero text-noria-text" style={{ lineHeight: 1 }}>
            ${fmt(aggregatedBalance)}
          </p>
          <p className="text-[13px] font-[400] mt-1.5" style={{ color: 'rgba(26,26,26,0.4)' }}>{baseCurrency}</p>
        </section>

        <div className="noria-divider" />

        {/* ── Homeostasis ── */}
        <section className="py-6">
          <HomeostasisBar />
        </section>

        <div className="noria-divider" />

        {/* ── Línea de Flotación ── */}
        <section className="py-6" id="anchors-list-section">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-subtitle font-[400] text-noria-text">Línea de Flotación</h3>
            <button
              id="add-anchor-btn"
              onClick={() => { setAnchorError(''); if (activeAccounts.length > 0) setAnchorAccountId(activeAccounts[0].id.toString()); setShowAddAnchorModal(true); }}
              className="flex items-center space-x-1 focus:outline-none"
              style={{ color: '#5C7A52', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}
            >
              <Plus size={12} strokeWidth={2} />
              <span>Añadir</span>
            </button>
          </div>

          {anchors.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center py-8 space-y-3" id="anchors-empty-state">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(26,26,26,0.05)' }}>
                <Home size={18} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.2)' }} />
              </div>
              <p className="text-[13px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin gastos ancla aún</p>
              <button onClick={() => { setAnchorError(''); if (activeAccounts.length > 0) setAnchorAccountId(activeAccounts[0].id.toString()); setShowAddAnchorModal(true); }}
                className="text-[12px] font-[500] uppercase tracking-wider underline underline-offset-2 focus:outline-none"
                style={{ color: '#5C7A52' }}>
                Agregar el primero
              </button>
            </div>
          ) : (
            <div>
              {/* Pending */}
              {pendingAnchors.map(anchor => (
                <div key={anchor.id} className="noria-row" id={`anchor-item-${anchor.id}`}>
                  <div className="flex items-center space-x-3">
                    <AnchorIcon name={anchor.name} />
                    <div>
                      <p className="text-[15px] font-[400] text-noria-text">{anchor.name}</p>
                      <div className="flex items-center space-x-2 mt-0.5">
                        {anchor.nextDueDate && (
                          <span className="label-section">
                            {new Date(anchor.nextDueDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).toUpperCase()}
                          </span>
                        )}
                        <span
                          className="noria-pill"
                          style={{ background: pillarBg(anchor.pillar), color: pillarColor(anchor.pillar) }}
                        >
                          {anchor.pillar}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <p className="text-[15px] font-[400] text-noria-text">
                      ${fmt(anchor.amount)}
                    </p>
                    <button
                      id={`pay-anchor-btn-${anchor.id}`}
                      onClick={() => handlePayAnchor(anchor)}
                      className="w-6 h-6 rounded-full border flex items-center justify-center transition-colors focus:outline-none"
                      style={{ borderColor: 'rgba(26,26,26,0.15)', color: 'rgba(26,26,26,0.15)' }}
                      title="Marcar como pagado"
                    >
                      <Check size={11} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Paid — muted with strikethrough */}
              {paidAnchors.map(anchor => (
                <div key={anchor.id} className="noria-row" style={{ opacity: 0.3 }}>
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(92,122,82,0.15)', color: '#5C7A52' }}>
                      <Check size={11} strokeWidth={2} />
                    </div>
                    <p className="text-[15px] font-[400] text-noria-text line-through">{anchor.name}</p>
                  </div>
                  <p className="text-[15px] font-[400] text-noria-text">${fmt(anchor.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="noria-divider" />

        {/* ── Ingresos del mes (collapse) ── */}
        <section className="py-5" id="incomes-collapse-section">
          <button
            id="toggle-incomes-btn"
            onClick={() => setShowIncomes(!showIncomes)}
            className="w-full flex justify-between items-center focus:outline-none"
          >
            <div className="flex items-center space-x-3">
              <h3 className="text-subtitle font-[400] text-noria-text">Ingresos del Mes</h3>
              {incomeSum > 0 && (
                <span className="text-[13px] font-[500]" style={{ color: '#5C7A52' }}>
                  +${fmt(incomeSum)}
                </span>
              )}
            </div>
            {showIncomes
              ? <ChevronUp size={14} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.3)' }} />
              : <ChevronDown size={14} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.3)' }} />
            }
          </button>

          {showIncomes && (
            <div className="mt-3 animate-fade-in" id="incomes-detail-list">
              {thisMonthIncomes.length === 0 ? (
                <p className="text-[13px] py-4" style={{ color: 'rgba(26,26,26,0.3)' }}>
                  No hay ingresos registrados este mes.
                </p>
              ) : (
                thisMonthIncomes.map(inc => {
                  const srcName = inc.incomeSourceId ? getSourceName(inc.incomeSourceId) : null;
                  return (
                    <div key={inc.id} className="noria-row">
                      <div>
                        <p className="text-[15px] font-[400] text-noria-text">{inc.description || 'Ingreso'}</p>
                        {srcName && <p className="label-section mt-0.5">{srcName}</p>}
                      </div>
                      <p className="text-[15px] font-[500]" style={{ color: '#5C7A52' }}>
                        +${fmt(inc.amount)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>
      </main>

      {/* ── Add Anchor Bottom Sheet ── */}
      {showAddAnchorModal && (
        <>
          <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40" onClick={() => setShowAddAnchorModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up"
            style={{ background: '#F5F2ED', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)' }}>
            <form onSubmit={handleCreateAnchor} className="px-6 pt-4 pb-10 space-y-4" id="add-anchor-form">
              {/* Handle */}
              <div className="flex justify-center mb-2">
                <div className="w-8 h-[3px] rounded-full" style={{ background: 'rgba(26,26,26,0.12)' }} />
              </div>

              <div className="flex justify-between items-center">
                <h4 className="text-[16px] font-[400] text-noria-text">Nuevo Gasto Ancla</h4>
                <button type="button" id="close-add-anchor-modal" onClick={() => setShowAddAnchorModal(false)}
                  className="focus:outline-none p-1" style={{ color: 'rgba(26,26,26,0.4)' }}>✕</button>
              </div>

              <div>
                <label className="muji-header block mb-1">Nombre</label>
                <input id="anchor-name" type="text" value={anchorName} onChange={e => setAnchorName(e.target.value)}
                  placeholder="Ej. Alquiler, Netflix, Internet" className="muji-input" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="muji-header block mb-1">Monto</label>
                  <input id="anchor-amount" type="number" step="0.01" inputMode="decimal"
                    value={anchorAmount} onChange={e => setAnchorAmount(e.target.value)}
                    placeholder="0.00" className="muji-input" required />
                </div>
                <div>
                  <label className="muji-header block mb-1">Vencimiento</label>
                  <input id="anchor-duedate" type="date" value={anchorDueDate}
                    onChange={e => setAnchorDueDate(e.target.value)} className="muji-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="muji-header block mb-1">Cuenta</label>
                  <select id="anchor-account" value={anchorAccountId}
                    onChange={e => setAnchorAccountId(e.target.value)} className="muji-input" required>
                    <option value="" disabled>Selecciona...</option>
                    {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="muji-header block mb-2">Pilar</label>
                  <div className="flex space-x-1">
                    {[['NEED','N','#5C7A52'],['WANT','W','#4A6475'],['SAVE','S','#B8860B']].map(([val, short, col]) => (
                      <button key={val} type="button" onClick={() => setAnchorPillar(val)}
                        className="flex-1 py-1 text-[10px] font-[500] uppercase rounded border transition-all"
                        style={{
                          borderColor: anchorPillar === val ? col : 'rgba(26,26,26,0.10)',
                          color: anchorPillar === val ? col : 'rgba(26,26,26,0.35)',
                        }}>
                        {short}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {anchorError && <p className="text-[12px] font-[500]" style={{ color: '#B8860B' }}>{anchorError}</p>}

              <button id="submit-new-anchor-btn" type="submit"
                className="w-full py-3.5 text-[13px] font-[500] uppercase tracking-wider transition-all active:scale-[0.98] rounded-[6px] mt-2"
                style={{ background: '#1A1A1A', color: '#F5F2ED' }}>
                Crear Gasto Ancla
              </button>
            </form>
          </div>
        </>
      )}

      <BottomNav />
      <FAB />
    </div>
  );
}
