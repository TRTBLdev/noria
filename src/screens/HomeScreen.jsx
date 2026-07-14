import React, { useState, useEffect } from 'react';
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

  // Estados para el Modal de Ejecución de Ahorro (SAVE Anchor)
  const [payingSaveAnchor, setPayingSaveAnchor] = useState(null);
  const [savePayMode, setSavePayMode] = useState('ALLOC'); // 'ALLOC' o 'TRANSFER'
  const [allocAccountId, setAllocAccountId] = useState('');
  const [transFromAccountId, setTransFromAccountId] = useState('');
  const [transToAccountId, setTransToAccountId] = useState('');
  const [transAmountReceived, setTransAmountReceived] = useState('');
  const [transExchangeRate, setTransExchangeRate] = useState('1.00');
  const [savePayError, setSavePayError] = useState('');

  // Estados para el Modal de Ejecución de Gastos (NEED/WANT Anchor)
  const [payingGeneralAnchor, setPayingGeneralAnchor] = useState(null);
  const [generalPayAccountId, setGeneralPayAccountId] = useState('');

  const baseCurrencyObj  = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const baseCurrency     = baseCurrencyObj?.value || 'USD';

  const accounts          = useLiveQuery(() => db.accounts.toArray())          || [];
  const anchors           = useLiveQuery(() => db.anchors.toArray())           || [];
  const transactions      = useLiveQuery(() => db.transactions.toArray())      || [];
  const incomeSources     = useLiveQuery(() => db.income_sources.toArray())    || [];
  const macetas           = useLiveQuery(() => db.macetas.toArray())           || [];
  const macetaAllocations = useLiveQuery(() => db.maceta_allocations.toArray()) || [];

  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
  const thisMonthIncomes = transactions.filter(t => new Date(t.date) >= startOfMonth && t.type === 'IN');

  const activeAccounts = accounts.filter(a => !a.isArchived);
  const aggregatedBalance = activeAccounts.reduce((sum, acc) => sum + acc.balance, 0);

  const incomeSum = thisMonthIncomes.reduce((sum, inc) => sum + inc.amount, 0);

  // Lógica de auto-renovación mensual de plantillas e instancias de cobro
  useEffect(() => {
    if (anchors.length === 0) return;

    const runRecurrenceJob = async () => {
      // 1. Migración en caliente: marcar anclas heredadas sin isTemplate como isTemplate: true
      const legacyAnchors = anchors.filter(a => a.isTemplate === undefined);
      if (legacyAnchors.length > 0) {
        for (const a of legacyAnchors) {
          await db.anchors.update(a.id, { isTemplate: true, isArchived: false });
        }
        return;
      }

      // 2. Generar instancias de cobro para el mes actual
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const startOfCurrentMonth = new Date(currentYear, currentMonth, 1);
      const endOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

      const templates = anchors.filter(a => a.isTemplate === true && !a.isArchived);
      const instances = anchors.filter(a => a.isTemplate === false);

      for (const temp of templates) {
        const hasInstanceThisMonth = instances.some(inst => {
          if (inst.parentAnchorId !== temp.id) return false;
          const instDate = inst.nextDueDate instanceof Date ? inst.nextDueDate : new Date(inst.nextDueDate);
          return instDate >= startOfCurrentMonth && instDate <= endOfCurrentMonth;
        });

        if (!hasInstanceThisMonth) {
          let targetDay = 1;
          if (temp.nextDueDate) {
            const tempDate = temp.nextDueDate instanceof Date ? temp.nextDueDate : new Date(temp.nextDueDate);
            targetDay = tempDate.getDate();
          }

          const lastDayOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
          const finalDay = Math.min(targetDay, lastDayOfCurrentMonth);
          const instanceDueDate = new Date(currentYear, currentMonth, finalDay, 12, 0, 0);

          await db.anchors.add({
            name: temp.name,
            type: temp.type || 'FIXED',
            amount: temp.amount,
            currency: temp.currency || 'USD',
            accountId: temp.accountId || null,
            macetaId: temp.macetaId || null,
            nextDueDate: instanceDueDate,
            status: 'PENDING',
            pillar: temp.pillar,
            isTemplate: false,
            parentAnchorId: temp.id
          });
        }
      }
    };

    runRecurrenceJob();
  }, [anchors]);

  const pendingAnchors = anchors.filter(a => a.isTemplate === false && a.status !== 'PAID');
  const paidAnchors   = anchors.filter(a => a.isTemplate === false && a.status === 'PAID');

  const getSourceName = (id) => incomeSources.find(s => s.id === id)?.name || null;

  const handlePayAnchor = async (anchor) => {
    if (anchor.pillar === 'SAVE' || anchor.type === 'SAVE') {
      setPayingSaveAnchor(anchor);
      setSavePayMode('ALLOC');
      setSavePayError('');
      if (activeAccounts.length > 0) {
        setAllocAccountId(activeAccounts[0].id.toString());
        setTransFromAccountId(activeAccounts[0].id.toString());
        const secondActive = activeAccounts[1] || activeAccounts[0];
        setTransToAccountId(secondActive.id.toString());
      }
      setTransAmountReceived(anchor.amount.toString());
      setTransExchangeRate('1.00');
      return;
    }

    setPayingGeneralAnchor(anchor);
    setGeneralPayAccountId(anchor.accountId ? anchor.accountId.toString() : (activeAccounts[0]?.id.toString() || ''));
  };

  const handleConfirmGeneralPay = async (e) => {
    e.preventDefault();
    if (!payingGeneralAnchor) return;
    const resolvedAccountId = parseInt(generalPayAccountId);
    const account = accounts.find(a => a.id === resolvedAccountId);
    if (!account) { alert('Cuenta no encontrada'); return; }

    try {
      await db.transaction('rw', [db.accounts, db.transactions, db.anchors], async () => {
        await db.transactions.add({
          date: new Date(),
          type: 'OUT',
          amount: payingGeneralAnchor.amount,
          currency: payingGeneralAnchor.currency || 'USD',
          accountId: resolvedAccountId,
          tagId: null,
          pillar: payingGeneralAnchor.pillar,
          incomeSourceId: null,
          anchorId: payingGeneralAnchor.id,
          description: `Ancla: ${payingGeneralAnchor.name}`
        });

        await db.accounts.update(resolvedAccountId, { balance: account.balance - payingGeneralAnchor.amount });
        await db.anchors.update(payingGeneralAnchor.id, { status: 'PAID' });
      });

      setPayingGeneralAnchor(null);
    } catch {
      alert('Error al registrar el pago del gasto programado.');
    }
  };

  const handleExecuteSaveAlloc = async (e) => {
    e.preventDefault();
    if (!payingSaveAnchor) return;
    setSavePayError('');

    try {
      let targetMacetaId = payingSaveAnchor.macetaId;
      if (!targetMacetaId) {
        const namePart = payingSaveAnchor.name.replace('Ahorro: ', '').trim().toLowerCase();
        const found = macetas.find(m => m.name.toLowerCase() === namePart);
        if (!found) {
          setSavePayError('No se encontró la meta de ahorro asociada a este ancla.');
          return;
        }
        targetMacetaId = found.id;
      }

      const maceta = macetas.find(m => m.id === targetMacetaId);
      if (!maceta) {
        setSavePayError('Meta de ahorro asociada no encontrada.');
        return;
      }

      const accountId = parseInt(allocAccountId);
      const amount = payingSaveAnchor.amount;
      const account = accounts.find(a => a.id === accountId);
      if (!account) {
        setSavePayError('Cuenta no encontrada.');
        return;
      }

      // Obtener todas las allocations existentes para esta maceta
      const currentAllocations = macetaAllocations.filter(a => a.macetaId === maceta.id);
      
      let exists = false;
      const updatedAllocations = currentAllocations.map(a => {
        if (a.accountId === accountId) {
          exists = true;
          return { ...a, amount: a.amount + amount };
        }
        return a;
      });

      if (!exists) {
        updatedAllocations.push({
          macetaId: maceta.id,
          accountId,
          amount,
          currency: maceta.currency || 'USD',
          locked: false
        });
      }

      const totalAllocated = updatedAllocations.reduce((sum, a) => sum + a.amount, 0);

      await db.transaction('rw', [db.maceta_allocations, db.macetas, db.anchors], async () => {
        await db.maceta_allocations.where('macetaId').equals(maceta.id).delete();
        for (const alloc of updatedAllocations) {
          await db.maceta_allocations.add({
            macetaId: alloc.macetaId,
            accountId: alloc.accountId,
            amount: alloc.amount,
            currency: alloc.currency,
            locked: !!alloc.locked
          });
        }
        await db.macetas.update(maceta.id, { currentAmount: totalAllocated });
        await db.anchors.update(payingSaveAnchor.id, { status: 'PAID' });
      });

      setPayingSaveAnchor(null);
    } catch (err) {
      setSavePayError('Error al procesar la asignación del ahorro.');
    }
  };

  const handleExecuteSaveTransfer = async (e) => {
    e.preventDefault();
    if (!payingSaveAnchor) return;
    setSavePayError('');

    try {
      const fromId = parseInt(transFromAccountId);
      const toId = parseInt(transToAccountId);
      const amountSent = payingSaveAnchor.amount;
      const amountRec = parseFloat(transAmountReceived);

      if (fromId === toId) {
        setSavePayError('Las cuentas de origen y destino deben ser distintas.');
        return;
      }
      if (isNaN(amountRec) || amountRec <= 0) {
        setSavePayError('El monto recibido debe ser un número positivo.');
        return;
      }

      const fromAccount = accounts.find(a => a.id === fromId);
      const toAccount = accounts.find(a => a.id === toId);

      if (!fromAccount || !toAccount) {
        setSavePayError('Cuenta de origen o destino no encontrada.');
        return;
      }
      if (fromAccount.balance < amountSent) {
        setSavePayError(`Saldo insuficiente en la cuenta de origen (${fromAccount.name}).`);
        return;
      }

      let targetMacetaId = payingSaveAnchor.macetaId;
      if (!targetMacetaId) {
        const namePart = payingSaveAnchor.name.replace('Ahorro: ', '').trim().toLowerCase();
        const found = macetas.find(m => m.name.toLowerCase() === namePart);
        if (!found) {
          setSavePayError('No se encontró la meta de ahorro asociada a este ancla.');
          return;
        }
        targetMacetaId = found.id;
      }

      const maceta = macetas.find(m => m.id === targetMacetaId);
      if (!maceta) {
        setSavePayError('Meta de ahorro asociada no encontrada.');
        return;
      }

      const transferId = 'TX-' + Date.now();

      // Obtener todas las allocations existentes para esta maceta
      const currentAllocations = macetaAllocations.filter(a => a.macetaId === maceta.id);
      
      let exists = false;
      const updatedAllocations = currentAllocations.map(a => {
        if (a.accountId === toId) {
          exists = true;
          return { ...a, amount: a.amount + amountRec };
        }
        return a;
      });

      if (!exists) {
        updatedAllocations.push({
          macetaId: maceta.id,
          accountId: toId,
          amount: amountRec,
          currency: maceta.currency || 'USD',
          locked: false
        });
      }

      const totalAllocated = updatedAllocations.reduce((sum, a) => sum + a.amount, 0);

      await db.transaction('rw', [db.accounts, db.transactions, db.maceta_allocations, db.macetas, db.anchors], async () => {
        // 1. Debitar origen
        await db.accounts.update(fromId, { balance: fromAccount.balance - amountSent });
        // 2. Acreditar destino
        await db.accounts.update(toId, { balance: toAccount.balance + amountRec });

        // 3. Registrar salidas/entradas de transferencia
        await db.transactions.add({
          date: new Date(),
          type: 'TRANSFER_OUT',
          amount: amountSent,
          currency: fromAccount.currency,
          accountId: fromId,
          description: `Transferencia ahorro meta: ${maceta.name}`,
          transferId
        });

        await db.transactions.add({
          date: new Date(),
          type: 'TRANSFER_IN',
          amount: amountRec,
          currency: toAccount.currency,
          accountId: toId,
          description: `Ahorro asignado meta: ${maceta.name}`,
          transferId
        });

        // 4. Actualizar allocations de maceta
        await db.maceta_allocations.where('macetaId').equals(maceta.id).delete();
        for (const alloc of updatedAllocations) {
          await db.maceta_allocations.add({
            macetaId: alloc.macetaId,
            accountId: alloc.accountId,
            amount: alloc.amount,
            currency: alloc.currency,
            locked: !!alloc.locked
          });
        }

        // 5. Actualizar maceta
        await db.macetas.update(maceta.id, { currentAmount: totalAllocated });

        // 6. Marcar anchor como pagado
        await db.anchors.update(payingSaveAnchor.id, { status: 'PAID' });
      });

      setPayingSaveAnchor(null);
    } catch (err) {
      setSavePayError('Error al procesar la transferencia del ahorro.');
    }
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
      status: 'PENDING', pillar: anchorPillar,
      isTemplate: true, isArchived: false
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
                      <p className="text-[15px] font-[400] text-noria-text">
                        {anchor.name}
                        {(() => {
                          const accName = accounts.find(a => a.id === anchor.accountId)?.name;
                          return accName ? (
                            <span className="text-[10px] text-noria-muted font-normal ml-1.5">
                              ({accName})
                            </span>
                          ) : null;
                        })()}
                      </p>
                      <div className="flex items-center space-x-2 mt-0.5">
                        {anchor.nextDueDate && (
                          <span className="label-section">
                            {(() => {
                              const dateObj = anchor.nextDueDate instanceof Date 
                                ? anchor.nextDueDate 
                                : new Date(anchor.nextDueDate + 'T12:00:00');
                              return dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).toUpperCase();
                            })()}
                          </span>
                        )}
                        <span
                          className="noria-pill"
                          style={{ background: pillarBg(anchor.pillar), color: pillarColor(anchor.pillar) }}
                        >
                          {anchor.pillar}
                        </span>
                        {(() => {
                          if (!anchor.nextDueDate) return null;
                          const dateObj = anchor.nextDueDate instanceof Date 
                            ? anchor.nextDueDate 
                            : new Date(anchor.nextDueDate + 'T12:00:00');
                          const now = new Date();
                          const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                          if (dateObj < startOfCurrentMonth) {
                            return (
                              <span className="text-[9px] font-[600] px-1.5 py-0.5 rounded uppercase tracking-wider" 
                                style={{ background: 'rgba(159,47,45,0.1)', color: '#9F2F2D' }}>
                                Atrasado
                              </span>
                            );
                          }
                          return null;
                        })()}
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

      {/* ── Modal de Ejecución de Ahorro ── */}
      {payingSaveAnchor && (
        <>
          <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40" onClick={() => setPayingSaveAnchor(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up"
            style={{ background: '#F5F2ED', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)' }}>
            <div className="px-6 pt-4 pb-10 space-y-4" id="execute-save-modal">
              {/* Handle */}
              <div className="flex justify-center mb-2">
                <div className="w-8 h-[3px] rounded-full" style={{ background: 'rgba(26,26,26,0.12)' }} />
              </div>

              <div className="flex justify-between items-center">
                <h4 className="text-[16px] font-[400] text-noria-text">Cumplir Ahorro Programado</h4>
                <button type="button" onClick={() => setPayingSaveAnchor(null)}
                  className="focus:outline-none p-1" style={{ color: 'rgba(26,26,26,0.4)' }}>✕</button>
              </div>

              <div className="border border-[rgba(184,134,11,0.2)] rounded-lg p-3" style={{ background: 'rgba(184,134,11,0.05)' }}>
                <p className="text-[11px] font-[500]" style={{ color: '#B8860B' }}>META DE AHORRO PENDIENTE</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[15px] font-[400] text-noria-text">{payingSaveAnchor.name}</span>
                  <span className="text-[15px] font-[500] text-noria-text">${fmt(payingSaveAnchor.amount)}</span>
                </div>
              </div>

              {/* Selector de modo */}
              <div className="flex bg-[rgba(26,26,26,0.04)] p-1 rounded-md">
                <button
                  type="button"
                  onClick={() => setSavePayMode('ALLOC')}
                  className="flex-1 py-1.5 text-[11px] font-[600] uppercase tracking-wider rounded transition-all focus:outline-none"
                  style={{
                    background: savePayMode === 'ALLOC' ? '#1A1A1A' : 'transparent',
                    color: savePayMode === 'ALLOC' ? '#F5F2ED' : 'rgba(26,26,26,0.4)'
                  }}
                >
                  Asignar Fondos (In-place)
                </button>
                <button
                  type="button"
                  onClick={() => setSavePayMode('TRANSFER')}
                  className="flex-1 py-1.5 text-[11px] font-[600] uppercase tracking-wider rounded transition-all focus:outline-none"
                  style={{
                    background: savePayMode === 'TRANSFER' ? '#1A1A1A' : 'transparent',
                    color: savePayMode === 'TRANSFER' ? '#F5F2ED' : 'rgba(26,26,26,0.4)'
                  }}
                >
                  Transferir y Asignar
                </button>
              </div>

              {savePayMode === 'ALLOC' ? (
                /* MODO A: ASIGNACIÓN */
                <form onSubmit={handleExecuteSaveAlloc} className="space-y-4">
                  <div>
                    <label className="muji-header block mb-1">Debitar y Bloquear Ahorro en Cuenta:</label>
                    <select
                      id="save-alloc-account"
                      value={allocAccountId}
                      onChange={e => setAllocAccountId(e.target.value)}
                      className="muji-input"
                      required
                    >
                      {activeAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} (${fmt(acc.balance)})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-noria-muted mt-1.5 leading-relaxed">
                      El dinero no sale de tu patrimonio líquido; se retiene mentalmente en esta cuenta para cumplir con tu meta de ahorro.
                    </p>
                  </div>

                  {savePayError && <p className="text-[12px] font-[500]" style={{ color: '#B8860B' }}>{savePayError}</p>}

                  <button
                    type="submit"
                    className="w-full py-3 text-[12px] font-[600] uppercase tracking-wider rounded-[6px] transition-all active:scale-[0.98]"
                    style={{ background: '#5C7A52', color: '#F5F2ED' }}
                  >
                    Marcar Ahorro como Asignado
                  </button>
                </form>
              ) : (
                /* MODO B: TRANSFERENCIA */
                <form onSubmit={handleExecuteSaveTransfer} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="muji-header block mb-1">De Cuenta (Origen)</label>
                      <select
                        id="save-transfer-from"
                        value={transFromAccountId}
                        onChange={e => setTransFromAccountId(e.target.value)}
                        className="muji-input"
                        required
                      >
                        {activeAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} (${fmt(acc.balance)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="muji-header block mb-1">A Cuenta (Destino)</label>
                      <select
                        id="save-transfer-to"
                        value={transToAccountId}
                        onChange={e => setTransToAccountId(e.target.value)}
                        className="muji-input"
                        required
                      >
                        {activeAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} (${fmt(acc.balance)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="muji-header block mb-1">Monto Enviado ({accounts.find(a => a.id === parseInt(transFromAccountId))?.currency || 'USD'})</label>
                      <input
                        type="number"
                        className="muji-input"
                        value={payingSaveAnchor.amount}
                        disabled
                      />
                    </div>
                    <div>
                      <label className="muji-header block mb-1">Monto Recibido ({accounts.find(a => a.id === parseInt(transToAccountId))?.currency || 'USD'})</label>
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        className="muji-input"
                        value={transAmountReceived}
                        onChange={e => {
                          setTransAmountReceived(e.target.value);
                          const rate = parseFloat(e.target.value) / payingSaveAnchor.amount;
                          setTransExchangeRate(isNaN(rate) ? '1.00' : rate.toFixed(4));
                        }}
                        required
                      />
                    </div>
                  </div>

                  {accounts.find(a => a.id === parseInt(transFromAccountId))?.currency !== accounts.find(a => a.id === parseInt(transToAccountId))?.currency && (
                    <div>
                      <label className="muji-header block mb-1">Tasa de Cambio Efectiva</label>
                      <div className="font-mono text-[13px] text-noria-text">
                        1 {accounts.find(a => a.id === parseInt(transFromAccountId))?.currency} = {transExchangeRate} {accounts.find(a => a.id === parseInt(transToAccountId))?.currency}
                      </div>
                    </div>
                  )}

                  {savePayError && <p className="text-[12px] font-[500]" style={{ color: '#B8860B' }}>{savePayError}</p>}

                  <button
                    type="submit"
                    className="w-full py-3 text-[12px] font-[600] uppercase tracking-wider rounded-[6px] transition-all active:scale-[0.98]"
                    style={{ background: '#5C7A52', color: '#F5F2ED' }}
                  >
                    Transferir y Asignar Ahorro
                  </button>
                </form>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── MODAL EJECUCIÓN GASTO PROGRAMADO (NEED/WANT) ── */}
      {payingGeneralAnchor && (
        <>
          <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40" onClick={() => setPayingGeneralAnchor(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up"
            style={{ background: '#F5F2ED', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)' }}>
            <form onSubmit={handleConfirmGeneralPay} className="px-6 pt-4 pb-10 space-y-4">
              <div className="flex justify-center mb-2">
                <div className="w-8 h-[3px] rounded-full" style={{ background: 'rgba(26,26,26,0.12)' }} />
              </div>

              <div className="flex justify-between items-center">
                <h4 className="text-[16px] font-[400] text-noria-text">Confirmar Pago de Gasto Fijo</h4>
                <button type="button" onClick={() => setPayingGeneralAnchor(null)}
                  className="focus:outline-none p-1" style={{ color: 'rgba(26,26,26,0.4)' }}>✕</button>
              </div>

              <div className="bg-[rgba(26,26,26,0.02)] p-4 rounded border border-[rgba(26,26,26,0.04)] text-center">
                <p className="text-[12px] text-noria-muted uppercase tracking-wider">Monto a Debitar</p>
                <p className="text-[28px] font-[500] text-noria-text mt-1">
                  ${fmt(payingGeneralAnchor.amount)}
                </p>
                <p className="text-[13px] text-noria-text/60 mt-1">
                  Gasto: <span className="font-[500] text-noria-text">{payingGeneralAnchor.name}</span>
                </p>
              </div>

              <div>
                <label className="muji-header block mb-1">Debitar de la Cuenta</label>
                <select
                  value={generalPayAccountId}
                  onChange={e => setGeneralPayAccountId(e.target.value)}
                  className="muji-input"
                  required
                >
                  {activeAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (${fmt(acc.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 text-[13px] font-[500] uppercase tracking-wider transition-all active:scale-[0.98] rounded-[6px]"
                style={{ background: '#1A1A1A', color: '#F5F2ED' }}
              >
                Confirmar Pago y Descontar
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
