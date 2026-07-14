import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import HomeostasisBar from '../components/HomeostasisBar.jsx';
import FAB from '../components/FAB.jsx';
import { Plus, Check, ChevronDown, ChevronUp } from 'lucide-react';

export default function HomeScreen() {
  const [showAddAnchorModal, setShowAddAnchorModal] = useState(false);
  const [showIncomes, setShowIncomes] = useState(false);

  const [anchorName, setAnchorName] = useState('');
  const [anchorAmount, setAnchorAmount] = useState('');
  const [anchorPillar, setAnchorPillar] = useState('NEED');
  const [anchorAccountId, setAnchorAccountId] = useState('');
  const [anchorDueDate, setAnchorDueDate] = useState('');
  const [anchorError, setAnchorError] = useState('');

  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const baseCurrency = baseCurrencyObj?.value || 'USD';

  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const anchors = useLiveQuery(() => db.anchors.toArray()) || [];

  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const incomeSources = useLiveQuery(() => db.income_sources.toArray()) || [];
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const thisMonthTrans = transactions.filter(t => new Date(t.date) >= startOfMonth);
  const thisMonthIncomes = thisMonthTrans.filter(t => t.type === 'IN');

  const aggregatedBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const incomeSum = thisMonthIncomes.reduce((sum, inc) => sum + inc.amount, 0);

  const pendingAnchors = anchors.filter(a => a.status === 'PENDING');
  const paidAnchors = anchors.filter(a => a.status === 'PAID');

  const getSourceName = (incomeSourceId) => {
    const src = incomeSources.find(s => s.id === incomeSourceId);
    return src ? src.name : null;
  };

  const handlePayAnchor = async (anchor) => {
    if (!confirm(`¿Marcar "${anchor.name}" como pagado?`)) return;
    try {
      const account = accounts.find(a => a.id === anchor.accountId);
      if (!account) { alert('Cuenta no encontrada'); return; }

      await db.transactions.add({
        date: new Date(),
        type: 'OUT',
        amount: anchor.amount,
        currency: anchor.currency,
        accountId: anchor.accountId,
        tagId: null,
        pillar: anchor.pillar,
        incomeSourceId: null,
        description: `Ancla: ${anchor.name}`
      });

      await db.accounts.update(anchor.accountId, { balance: account.balance - anchor.amount });
      await db.anchors.update(anchor.id, { status: 'PAID' });
    } catch (err) {
      alert('Error al pagar el ancla');
    }
  };

  const handleCreateAnchor = async (e) => {
    e.preventDefault();
    setAnchorError('');
    const amt = parseFloat(anchorAmount);
    if (isNaN(amt) || amt <= 0) { setAnchorError('Monto inválido'); return; }
    if (!anchorAccountId) { setAnchorError('Selecciona una cuenta'); return; }

    try {
      const selectedAcc = accounts.find(a => a.id.toString() === anchorAccountId);
      await db.anchors.add({
        name: anchorName.trim(),
        type: 'FIXED',
        amount: amt,
        currency: selectedAcc.currency,
        accountId: parseInt(anchorAccountId),
        nextDueDate: anchorDueDate ? new Date(anchorDueDate + 'T12:00:00') : null,
        status: 'PENDING',
        pillar: anchorPillar
      });
      setShowAddAnchorModal(false);
      setAnchorName(''); setAnchorAmount(''); setAnchorDueDate(''); setAnchorAccountId('');
    } catch (err) {
      setAnchorError('Error al crear ancla');
    }
  };

  const fmt = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-noria-bg pb-32 pt-16">
      <Header title="Noria" />

      <main className="px-6 max-w-md mx-auto">
        {/* Balance hero */}
        <section className="py-8" id="balance-hero">
          <p className="muji-header mb-1">Current Balance</p>
          <h2 className="text-4xl font-extralight tracking-tight text-noria-text">
            {fmt(aggregatedBalance)}
            <span className="text-lg font-light text-noria-text/40 ml-2">{baseCurrency}</span>
          </h2>
        </section>

        {/* Divider */}
        <div className="border-t border-noria-text/8" />

        {/* Homeostasis — flat, inline expand */}
        <section className="py-6">
          <HomeostasisBar />
        </section>

        {/* Divider */}
        <div className="border-t border-noria-text/8" />

        {/* Línea de Flotación */}
        <section className="py-6" id="anchors-list-section">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="muji-header">Línea de Flotación</h3>
            </div>
            <button
              id="add-anchor-btn"
              onClick={() => {
                setAnchorError('');
                if (accounts.length > 0) setAnchorAccountId(accounts[0].id.toString());
                setShowAddAnchorModal(true);
              }}
              className="flex items-center space-x-1 text-[10px] font-light uppercase tracking-widest text-noria-salvia hover:text-noria-salvia/70 focus:outline-none"
            >
              <Plus size={12} strokeWidth={1.5} />
              <span>Añadir</span>
            </button>
          </div>

          {anchors.length === 0 ? (
            <p className="text-xs font-light text-noria-text/30 py-4">
              No hay gastos ancla. Toca + para agregar uno.
            </p>
          ) : (
            <div className="divide-y divide-noria-text/5">
              {/* Pending */}
              {pendingAnchors.map(anchor => {
                const acc = accounts.find(a => a.id === anchor.accountId);
                return (
                  <div key={anchor.id} className="flex items-center justify-between py-3.5" id={`anchor-item-${anchor.id}`}>
                    <div className="flex items-center space-x-3.5">
                      <button
                        id={`pay-anchor-btn-${anchor.id}`}
                        onClick={() => handlePayAnchor(anchor)}
                        className="w-5 h-5 rounded-full border border-noria-text/20 flex items-center justify-center hover:border-noria-salvia hover:text-noria-salvia text-noria-text/20 transition-colors focus:outline-none flex-shrink-0"
                        title="Marcar como pagado"
                      >
                        <Check size={11} strokeWidth={2} />
                      </button>
                      <div>
                        <p className="text-sm font-light text-noria-text">{anchor.name}</p>
                        <p className="text-[10px] font-light text-noria-text/40 mt-0.5">
                          {anchor.nextDueDate
                            ? new Date(anchor.nextDueDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).toUpperCase()
                            : 'SIN FECHA'
                          }
                          <span className="mx-1.5 opacity-40">·</span>
                          <span className={
                            anchor.pillar === 'NEED' ? 'text-noria-salvia' :
                            anchor.pillar === 'WANT' ? 'text-noria-slate' : 'text-noria-amber'
                          }>{anchor.pillar}</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-light text-noria-text">
                      -{fmt(anchor.amount)} <span className="text-[10px] text-noria-text/40">{anchor.currency}</span>
                    </span>
                  </div>
                );
              })}

              {/* Paid — muted */}
              {paidAnchors.map(anchor => (
                <div key={anchor.id} className="flex items-center justify-between py-3.5 opacity-35">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-5 h-5 rounded-full bg-noria-salvia/20 text-noria-salvia flex items-center justify-center flex-shrink-0">
                      <Check size={11} strokeWidth={2} />
                    </div>
                    <p className="text-sm font-light text-noria-text line-through">{anchor.name}</p>
                  </div>
                  <span className="text-sm font-light text-noria-text">
                    -{fmt(anchor.amount)} <span className="text-[10px] text-noria-text/40">{anchor.currency}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="border-t border-noria-text/8" />

        {/* Incomes collapse */}
        <section className="py-4" id="incomes-collapse-section">
          <button
            id="toggle-incomes-btn"
            onClick={() => setShowIncomes(!showIncomes)}
            className="w-full flex justify-between items-center focus:outline-none"
          >
            <div className="flex items-center space-x-3">
              <h3 className="muji-header">Ingresos del Mes</h3>
              {incomeSum > 0 && (
                <span className="text-[10px] font-light text-noria-salvia">
                  +{fmt(incomeSum)} {baseCurrency}
                </span>
              )}
            </div>
            {showIncomes
              ? <ChevronUp size={14} strokeWidth={1.5} className="text-noria-text/30" />
              : <ChevronDown size={14} strokeWidth={1.5} className="text-noria-text/30" />
            }
          </button>

          {showIncomes && (
            <div className="divide-y divide-noria-text/5 mt-3" id="incomes-detail-list">
              {thisMonthIncomes.length === 0 ? (
                <p className="text-xs font-light text-noria-text/30 py-4">No hay ingresos registrados este mes.</p>
              ) : (
                thisMonthIncomes.map(inc => {
                  const srcName = inc.incomeSourceId ? getSourceName(inc.incomeSourceId) : null;
                  return (
                    <div key={inc.id} className="flex justify-between items-center py-3">
                      <div>
                        <p className="text-sm font-light text-noria-text">{inc.description || 'Ingreso'}</p>
                        {srcName && (
                          <p className="text-[10px] font-light text-noria-text/40 mt-0.5">{srcName}</p>
                        )}
                      </div>
                      <span className="text-sm font-light text-noria-salvia">
                        +{fmt(inc.amount)} <span className="text-[10px] text-noria-text/40">{inc.currency}</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>
      </main>

      {/* Add Anchor Modal — slides from bottom, minimal overlay */}
      {showAddAnchorModal && (
        <>
          <div className="fixed inset-0 bg-noria-text/10 z-40" onClick={() => setShowAddAnchorModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-noria-bg border-t border-noria-text/8 z-50 max-w-md mx-auto animate-slide-up">
            <form onSubmit={handleCreateAnchor} className="px-6 pt-6 pb-10 space-y-4" id="add-anchor-form">
              <div className="flex justify-between items-center">
                <h4 className="muji-header">Nuevo Gasto Ancla</h4>
                <button type="button" id="close-add-anchor-modal" onClick={() => setShowAddAnchorModal(false)}
                  className="text-noria-text/40 hover:text-noria-text text-sm focus:outline-none">✕</button>
              </div>

              <div>
                <label className="muji-header block mb-1">Nombre</label>
                <input id="anchor-name" type="text" value={anchorName}
                  onChange={e => setAnchorName(e.target.value)}
                  placeholder="Ej. Alquiler, Netflix, Internet" className="muji-input" required />
              </div>

              <div className="grid grid-cols-2 gap-6">
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

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="muji-header block mb-1">Cuenta</label>
                  <select id="anchor-account" value={anchorAccountId}
                    onChange={e => setAnchorAccountId(e.target.value)} className="muji-input" required>
                    <option value="" disabled>Selecciona...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="muji-header block mb-2">Pilar</label>
                  <div className="flex space-x-1">
                    {[['NEED', 'N'], ['WANT', 'W'], ['SAVE', 'S']].map(([val, short]) => (
                      <button key={val} type="button" onClick={() => setAnchorPillar(val)}
                        className={`flex-1 py-1 text-[10px] font-light uppercase border rounded transition-all ${
                          anchorPillar === val
                            ? val === 'NEED' ? 'border-noria-salvia text-noria-salvia'
                              : val === 'WANT' ? 'border-noria-slate text-noria-slate'
                              : 'border-noria-amber text-noria-amber'
                            : 'border-noria-text/10 text-noria-text/40'
                        }`}>{short}</button>
                    ))}
                  </div>
                </div>
              </div>

              {anchorError && (
                <p className="text-xs text-noria-amber font-light" id="add-anchor-error">{anchorError}</p>
              )}

              <button id="submit-new-anchor-btn" type="submit"
                className="w-full py-3 border-t border-noria-text/8 text-xs font-light uppercase tracking-widest text-noria-salvia hover:text-noria-salvia/70 transition-colors mt-2">
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
