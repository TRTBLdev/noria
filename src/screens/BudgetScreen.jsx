import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import FAB from '../components/FAB.jsx';
import AnchorFormModal from '../components/AnchorFormModal.jsx';
import TransactionsSection from '../components/TransactionsSection.jsx';
import { useLocation } from 'react-router-dom';
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Wallet, ChevronDown, ChevronUp } from 'lucide-react';

export default function BudgetScreen() {
  const location = useLocation();
  const [showArchived, setShowArchived] = useState(false);
  const [templatesTab, setTemplatesTab] = useState('GASTOS'); // 'GASTOS' o 'AHORROS'
  const [showTransactions, setShowTransactions] = useState(false);

  // Estados de Rango Dinámico de Fechas de Proyección
  const [projectionStart, setProjectionStart] = useState(() => {
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
    return firstDay.toISOString().slice(0, 10);
  });
  const [projectionEnd, setProjectionEnd] = useState(() => {
    const d = new Date();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0);
    return lastDay.toISOString().slice(0, 10);
  });

  // Estados para modales componentizados
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAnchor, setEditingAnchor] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Dexie Queries
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const anchors = useLiveQuery(() => db.anchors.toArray()) || [];
  const macetas = useLiveQuery(() => db.macetas.toArray()) || [];
  const macetaAllocations = useLiveQuery(() => db.maceta_allocations.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];

  // Migración retrospectiva en caliente de anclas heredadas
  React.useEffect(() => {
    if (anchors.length === 0) return;
    const runMigration = async () => {
      const legacy = anchors.filter(a => a.isTemplate === undefined);
      if (legacy.length > 0) {
        for (const a of legacy) {
          await db.anchors.update(a.id, { isTemplate: true, isArchived: false });
        }
      }
    };
    runMigration();
  }, [anchors]);

  const activeAccounts = accounts.filter(a => !a.isArchived);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('section') === 'transactions') {
      setShowTransactions(true);
      requestAnimationFrame(() => {
        document.getElementById('transactions-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [location.search]);

  // 1. Cálculos de Homeostasis Mensual (Mes Actual)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

  // Ingresos reales de este mes
  const thisMonthIncomes = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= startOfMonth && d <= endOfMonth && t.type === 'IN';
  });
  const totalIngresosMes = thisMonthIncomes.reduce((sum, t) => sum + t.amount, 0);

  // Instancias de este mes
  const thisMonthInstances = anchors.filter(a => {
    if (a.isTemplate !== false) return false;
    const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate + 'T12:00:00');
    return d >= startOfMonth && d <= endOfMonth;
  });

  const totalAggregatedBalance = activeAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalAllocatedToMacetas = macetaAllocations.reduce((sum, a) => sum + a.amount, 0);

  // Gastos Recurrentes de este mes
  const thisMonthGastos = thisMonthInstances.filter(a => a.pillar === 'NEED' || a.pillar === 'WANT');
  const planifiedGastos = thisMonthGastos.reduce((sum, a) => sum + a.amount, 0);
  const paidGastos = thisMonthGastos.filter(a => a.status === 'PAID').reduce((sum, a) => sum + a.amount, 0);
  const pendingGastos = thisMonthGastos.filter(a => a.status !== 'PAID').reduce((sum, a) => sum + a.amount, 0);

  // Aportes a Metas de este mes
  const thisMonthAhorros = thisMonthInstances.filter(a => a.pillar === 'SAVE');
  const planifiedAhorros = thisMonthAhorros.reduce((sum, a) => sum + a.amount, 0);
  const paidAhorros = thisMonthAhorros.filter(a => a.status === 'PAID').reduce((sum, a) => sum + a.amount, 0);
  const pendingAhorros = thisMonthAhorros.filter(a => a.status !== 'PAID').reduce((sum, a) => sum + a.amount, 0);

  const totalComprometido = planifiedGastos + planifiedAhorros;

  // Disponible Libre Real
  const disponibleLibreReal = Math.max(0, totalAggregatedBalance - totalAllocatedToMacetas - pendingGastos - pendingAhorros);

  // Filtrar plantillas activas vs pausadas
  const templates = anchors.filter(a => a.isTemplate === true);
  const templatesActive = templates.filter(a => !a.isArchived);
  const templatesPaused = templates.filter(a => a.isArchived);

  const fmt = (n) => {
    if (typeof n !== 'number') return '0.00';
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2 });
  };
  
  const getAccountName = (id) => accounts.find(a => a.id === id)?.name || 'Ninguna';

  const handleCreateAnchor = async (data) => {
    try {
      let currency = 'USD';
      if (data.pillar === 'SAVE') {
        const targetMaceta = macetas.find(m => m.id === data.macetaId);
        if (targetMaceta) currency = targetMaceta.currency;
      } else {
        const selectedAcc = accounts.find(a => a.id === data.accountId);
        if (selectedAcc) currency = selectedAcc.currency;
      }

      await db.anchors.add({
        name: data.name,
        type: 'FIXED',
        amount: data.amount,
        currency,
        accountId: data.accountId || null,
        macetaId: data.macetaId || null,
        nextDueDate: data.nextDueDate || new Date().toISOString().slice(0, 10),
        status: 'PENDING',
        pillar: data.pillar,
        isTemplate: true,
        isArchived: false
      });
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
      alert('Error al crear el elemento programado');
    }
  };

  const handleDeleteTransaction = async (tx) => {
    if (!confirm('¿Seguro que deseas eliminar esta transacción permanentemente? Se revertirá su impacto en los balances.')) return;
    try {
      await db.transaction('rw', [db.accounts, db.transactions, db.anchors], async () => {
        if (tx.type === 'IN') {
          const acc = await db.accounts.get(tx.accountId);
          if (acc) await db.accounts.update(tx.accountId, { balance: acc.balance - tx.amount });
        } else if (tx.type === 'OUT') {
          const acc = await db.accounts.get(tx.accountId);
          if (acc) await db.accounts.update(tx.accountId, { balance: acc.balance + tx.amount });
        } else if (tx.type === 'TRANSFER_OUT' || tx.type === 'TRANSFER_IN') {
          const linkedTxs = await db.transactions.where('transferId').equals(tx.transferId).toArray();
          for (const ltx of linkedTxs) {
            const acc = await db.accounts.get(ltx.accountId);
            if (acc) {
              const delta = ltx.type === 'TRANSFER_OUT' ? ltx.amount : -ltx.amount;
              await db.accounts.update(ltx.accountId, { balance: acc.balance + delta });
            }
            await db.transactions.delete(ltx.id);
          }
          return;
        }

        if (tx.anchorId) {
          await db.anchors.update(tx.anchorId, { status: 'PENDING' });
        } else if (tx.description && tx.description.startsWith('Ancla: ')) {
          const anchorName = tx.description.replace('Ancla: ', '');
          const matchingAnchor = await db.anchors.where('name').equals(anchorName).first();
          if (matchingAnchor) {
            await db.anchors.update(matchingAnchor.id, { status: 'PENDING' });
          }
        }

        await db.transactions.delete(tx.id);
      });
    } catch (err) {
      alert('Error al revertir la transacción');
    }
  };

  const handleUpdateTransaction = async (txId, updatedFields) => {
    try {
      await db.transaction('rw', [db.accounts, db.transactions], async () => {
        const originalTx = await db.transactions.get(txId);
        if (!originalTx) return;

        if (updatedFields.amount !== undefined && updatedFields.amount !== originalTx.amount) {
          const acc = await db.accounts.get(originalTx.accountId);
          if (acc) {
            const diff = updatedFields.amount - originalTx.amount;
            const delta = originalTx.type === 'OUT' ? -diff : diff;
            await db.accounts.update(originalTx.accountId, { balance: acc.balance + delta });
          }
        }

        await db.transactions.update(txId, updatedFields);
      });
    } catch (err) {
      alert('Error al actualizar la transacción');
    }
  };

  const handleEditClick = (anchor) => {
    setEditingAnchor(anchor);
    setShowEditModal(true);
  };

  const handleUpdateAnchor = async (data) => {
    if (!editingAnchor) return;
    try {
      let currency = 'USD';
      if (data.pillar === 'SAVE') {
        const targetMaceta = macetas.find(m => m.id === data.macetaId);
        if (targetMaceta) currency = targetMaceta.currency;
      } else {
        const selectedAcc = accounts.find(a => a.id === data.accountId);
        if (selectedAcc) currency = selectedAcc.currency;
      }

      // 1. Actualizar plantilla
      await db.anchors.update(editingAnchor.id, {
        name: data.name,
        amount: data.amount,
        currency,
        pillar: data.pillar,
        accountId: data.accountId || null,
        macetaId: data.macetaId || null,
        nextDueDate: data.nextDueDate || null
      });

      // 2. Propagar a instancias activas del mes
      const now = new Date();
      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const activeInstances = anchors.filter(a => 
        a.isTemplate === false && 
        a.parentAnchorId === editingAnchor.id && 
        a.status === 'PENDING'
      );

      for (const inst of activeInstances) {
        const instDate = inst.nextDueDate instanceof Date ? inst.nextDueDate : new Date(inst.nextDueDate + 'T12:00:00');
        if (instDate >= startOfCurrentMonth && instDate <= endOfCurrentMonth) {
          await db.anchors.update(inst.id, {
            name: data.name,
            amount: data.amount,
            currency,
            pillar: data.pillar,
            accountId: data.accountId || null,
            macetaId: data.macetaId || null
          });
        }
      }

      setShowEditModal(false);
      setEditingAnchor(null);
    } catch (err) {
      console.error(err);
      alert('Error al actualizar el elemento programado');
    }
  };

  const handleToggleArchiveAnchor = async (anchor) => {
    try {
      const newArchivedState = !anchor.isArchived;
      await db.anchors.update(anchor.id, { isArchived: newArchivedState });
      
      if (newArchivedState) {
        const now = new Date();
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const pendingInstancesThisMonth = anchors.filter(a => 
          a.isTemplate === false && 
          a.parentAnchorId === anchor.id && 
          a.status === 'PENDING'
        );

        for (const inst of pendingInstancesThisMonth) {
          const instDate = inst.nextDueDate instanceof Date ? inst.nextDueDate : new Date(inst.nextDueDate);
          if (instDate >= startOfCurrentMonth && instDate <= endOfCurrentMonth) {
            await db.anchors.delete(inst.id);
          }
        }
      }
    } catch {
      alert('Error al cambiar el estado del gasto programado');
    }
  };

  const handleDeleteAnchorMaster = async (anchor) => {
    const confirmMsg = anchor.pillar === 'SAVE' 
      ? `¿Eliminar permanentemente la meta y plantilla de ahorro "${anchor.name}"?`
      : `¿Eliminar permanentemente la plantilla de gasto fijo "${anchor.name}"?`;
    if (!confirm(confirmMsg)) return;

    try {
      await db.anchors.delete(anchor.id);
      const pendingInstances = anchors.filter(a => 
        a.isTemplate === false && 
        a.parentAnchorId === anchor.id && 
        a.status === 'PENDING'
      );
      for (const inst of pendingInstances) {
        await db.anchors.delete(inst.id);
      }
    } catch {
      alert('Error al eliminar el gasto programado');
    }
  };

  const getFrequencyLabel = (interval, unit) => {
    const intVal = interval || 1;
    const unitVal = unit || 'MONTHS';
    let unitStr = '';
    if (unitVal === 'DAYS') unitStr = intVal === 1 ? 'día' : 'días';
    else if (unitVal === 'WEEKS') unitStr = intVal === 1 ? 'semana' : 'semanas';
    else if (unitVal === 'MONTHS') unitStr = intVal === 1 ? 'mes' : 'meses';
    else if (unitVal === 'YEARS') unitStr = intVal === 1 ? 'año' : 'años';

    if (intVal === 1) {
      if (unitVal === 'MONTHS') return 'mensual';
      if (unitVal === 'WEEKS') return 'semanal';
      if (unitVal === 'DAYS') return 'diario';
      if (unitVal === 'YEARS') return 'anual';
    }
    return `cada ${intVal} ${unitStr}`;
  };

  const renderAnchorRow = (src) => {
    const pilarColor = src.pillar === 'NEED' ? '#5C7A52' : src.pillar === 'WANT' ? '#4A6475' : '#B8860B';
    const pilarBg = src.pillar === 'NEED' ? 'rgba(92,122,82,0.10)' : src.pillar === 'WANT' ? 'rgba(74,100,117,0.10)' : 'rgba(184,134,11,0.10)';

    return (
      <div key={src.id} className="noria-row py-3.5" id={`anchor-row-${src.id}`} style={{ opacity: src.isArchived ? 0.5 : 1 }}>
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center space-x-2">
            <span className="text-[14px] font-[500] text-noria-text truncate">{src.name}</span>
            <span className="text-[9px] font-[600] px-1.5 py-0.5 rounded uppercase tracking-wider" 
              style={{ background: pilarBg, color: pilarColor }}>
              {src.pillar}
            </span>
          </div>
          <p className="text-[11px] text-noria-muted uppercase tracking-wider mt-0.5 font-mono">
            ${fmt(src.amount)} {getFrequencyLabel(src.frequencyInterval, src.frequencyUnit)} {src.accountId && `· De: ${getAccountName(src.accountId)}`}
            {src.nextDueDate && ` · Inicio/Prox: ${typeof src.nextDueDate === 'string' ? src.nextDueDate.slice(5, 10).replace('-', '/') : new Date(src.nextDueDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}`}
          </p>
        </div>
        <div className="flex items-center space-x-1">
          <button onClick={() => handleEditClick(src)} className="p-1.5 focus:outline-none hover:bg-noria-text/5 rounded transition-colors" title="Editar">
            <Pencil size={13} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.5)' }} />
          </button>
          <button onClick={() => handleToggleArchiveAnchor(src)} className="p-1.5 focus:outline-none hover:bg-noria-text/5 rounded transition-colors" title={src.isArchived ? "Re-activar" : "Pausar/Archivar"}>
            {src.isArchived ? (
              <ArchiveRestore size={13} strokeWidth={1.5} style={{ color: '#5C7A52' }} />
            ) : (
              <Archive size={13} strokeWidth={1.5} style={{ color: '#B8860B' }} />
            )}
          </button>
          <button onClick={() => handleDeleteAnchorMaster(src)} className="p-1.5 focus:outline-none hover:bg-[#9F2F2D]/10 rounded transition-colors" title="Eliminar definitivamente">
            <Trash2 size={13} strokeWidth={1.5} style={{ color: '#9F2F2D' }} />
          </button>
        </div>
      </div>
    );
  };

  // Lógica de Proyección de cobros por Rango de Fechas (Strings YYYY-MM-DD)
  const getProjectedInstances = () => {
    if (!projectionStart || !projectionEnd) return [];
    return anchors.filter(a => {
      if (a.isTemplate !== false) return false;
      return a.nextDueDate >= projectionStart && a.nextDueDate <= projectionEnd;
    }).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  };

  const projectedInstances = getProjectedInstances();

  // Filtrar plantillas según la pestaña activa
  const filteredActive = templatesActive.filter(a => {
    if (templatesTab === 'GASTOS') return a.pillar === 'NEED' || a.pillar === 'WANT';
    return a.pillar === 'SAVE';
  });

  const filteredPaused = templatesPaused.filter(a => {
    if (templatesTab === 'GASTOS') return a.pillar === 'NEED' || a.pillar === 'WANT';
    return a.pillar === 'SAVE';
  });

  // Atajos rápidos de rango dinámico
  const setMonthShortcut = () => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0);
    setProjectionStart(start.toISOString().slice(0, 10));
    setProjectionEnd(end.toISOString().slice(0, 10));
  };

  const setRangeShortcut = (days) => {
    const start = new Date();
    start.setHours(12,0,0,0);
    const end = new Date();
    end.setDate(start.getDate() + days);
    end.setHours(12,0,0,0);

    setProjectionStart(start.toISOString().slice(0, 10));
    setProjectionEnd(end.toISOString().slice(0, 10));
  };

  const setQuarterShortcut = () => {
    const start = new Date();
    start.setHours(12,0,0,0);
    // Fin de trimestre (90 días o fin del mes actual + 2)
    const end = new Date(start.getFullYear(), start.getMonth() + 3, 0, 12, 0, 0);
    setProjectionStart(start.toISOString().slice(0, 10));
    setProjectionEnd(end.toISOString().slice(0, 10));
  };

  const setYearShortcut = () => {
    const start = new Date();
    start.setHours(12,0,0,0);
    const end = new Date(start.getFullYear(), 11, 31, 12, 0, 0);
    setProjectionStart(start.toISOString().slice(0, 10));
    setProjectionEnd(end.toISOString().slice(0, 10));
  };

  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const formatTimelineDate = (str) => {
    if (!str || typeof str !== 'string') return '';
    const parts = str.split('-');
    if (parts.length !== 3) return str;
    return `${parts[2]} ${months[parseInt(parts[1]) - 1]} ${parts[0]}`;
  };

  // Agrupar instancias por fecha para el timeline
  const groupedInstances = projectedInstances.reduce((groups, inst) => {
    const dateStr = formatTimelineDate(inst.nextDueDate).toUpperCase();
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(inst);
    return groups;
  }, {});

  // Cálculos para widgets ASCII
  const porcentajeComprometido = totalIngresosMes > 0 ? Math.round((totalComprometido / totalIngresosMes) * 100) : 0;
  const paidTotal = paidGastos + paidAhorros;
  const porcentajePagado = totalComprometido > 0 ? Math.round((paidTotal / totalComprometido) * 100) : 0;

  const filledBlocks = Math.round((porcentajePagado / 100) * 20);
  const progressBarAscii = '█'.repeat(filledBlocks) + '░'.repeat(Math.max(0, 20 - filledBlocks));

  return (
    <div className="min-h-screen pb-32 pt-16" style={{ background: '#F5F2ED' }}>
      <div className="w-full max-w-md mx-auto px-6">
        <Header title="Línea de Flotación" />

        {/* ── 1. Resumen de Homeostasis Mensual (ASCII) ── */}
        <section className="py-4 space-y-4" id="homeostasis-summary-section">
          {/* Widget 1: Disponible Libre Real */}
          <pre className="p-3 border border-[#1A1A1A] bg-white font-mono text-[11px] leading-tight text-noria-text overflow-x-auto">
{`┌─ DISPONIBLE LIBRE REAL ──────────┐
│  $${fmt(disponibleLibreReal).padEnd(31)}│
│  De $${fmt(totalIngresosMes).padEnd(6)} ingresos este mes       │
└──────────────────────────────────┘`}
          </pre>

          {/* Widget 2: Comprometido */}
          <pre className="p-3 border border-[#1A1A1A] bg-white font-mono text-[11px] leading-tight text-noria-text overflow-x-auto">
{`┌─ COMPROMETIDO ──────────────────┐
│  $${fmt(totalComprometido).padEnd(6)} (${porcentajeComprometido}% del ingreso)          │
│  ├─ Gastos: $${fmt(planifiedGastos).padEnd(20)}│
│  └─ Ahorros: $${fmt(planifiedAhorros).padEnd(19)}│
└──────────────────────────────────┘`}
          </pre>

          {/* Widget 3: Pagado */}
          <pre className="p-3 border border-[#1A1A1A] bg-white font-mono text-[11px] leading-tight text-noria-text overflow-x-auto">
{`┌─ PAGADO ESTE MES ────────────────┐
│  $${fmt(paidTotal).padEnd(6)} de $${fmt(totalComprometido).padEnd(6)} (${porcentajePagado}%)         │
│  ${progressBarAscii.padEnd(32)}│
└──────────────────────────────────┘`}
          </pre>
        </section>

        <div className="noria-divider my-2" />

        {/* ── 2. Proyección de Cobros/Ahorros por Rango Dinámico ── */}
        <section className="py-4" id="projections-section">
          <h4 className="text-[11px] font-[600] uppercase tracking-wider text-noria-text opacity-50 mb-3 font-mono">
            [ TELEMETRÍA DE PROYECCIÓN ]
          </h4>

          {/* Controles de Rango Dinámico */}
          <div className="space-y-3 p-3 border border-[#1A1A1A] bg-white mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-mono font-[600] uppercase text-noria-muted block mb-1">Desde:</label>
                <input
                  type="date"
                  value={projectionStart}
                  onChange={(e) => setProjectionStart(e.target.value)}
                  className="muji-input w-full font-mono text-[11px] px-2 py-1.5 border border-[#1A1A1A]"
                />
              </div>
              <div>
                <label className="text-[9px] font-mono font-[600] uppercase text-noria-muted block mb-1">Hasta:</label>
                <input
                  type="date"
                  value={projectionEnd}
                  onChange={(e) => setProjectionEnd(e.target.value)}
                  className="muji-input w-full font-mono text-[11px] px-2 py-1.5 border border-[#1A1A1A]"
                />
              </div>
            </div>

            {/* Atajos Rápidos */}
            <div className="grid grid-cols-5 gap-1 pt-1">
              <button onClick={setMonthShortcut} className="brut-btn brut-btn-secondary py-1 text-[7px] font-mono leading-none px-0.5">
                [ MES ]
              </button>
              <button onClick={() => setRangeShortcut(7)} className="brut-btn brut-btn-secondary py-1 text-[7px] font-mono leading-none px-0.5">
                [ 7 D ]
              </button>
              <button onClick={() => setRangeShortcut(30)} className="brut-btn brut-btn-secondary py-1 text-[7px] font-mono leading-none px-0.5">
                [ 30 D ]
              </button>
              <button onClick={setQuarterShortcut} className="brut-btn brut-btn-secondary py-1 text-[7px] font-mono leading-none px-0.5">
                [ 90 D ]
              </button>
              <button onClick={setYearShortcut} className="brut-btn brut-btn-secondary py-1 text-[7px] font-mono leading-none px-0.5">
                [ AÑO ]
              </button>
            </div>
          </div>

          {/* Timeline Scrollable con Conectores ASCII */}
          {projectedInstances.length === 0 ? (
            <p className="text-[12px] text-noria-muted font-mono text-center py-4">[ Sin telemetry para este periodo ]</p>
          ) : (
            <div className="max-h-72 overflow-y-auto pr-1 bg-[rgba(26,26,26,0.015)] p-3 border border-[#1A1A1A] font-mono text-[12px] leading-relaxed">
              {Object.keys(groupedInstances).map((dateKey, gIdx, gArray) => {
                const dayInstances = groupedInstances[dateKey];
                return (
                  <div key={dateKey} className="mb-3">
                    {/* Encabezado del Día */}
                    <div className="text-noria-text font-[600] text-[10px]">
                      ┌─ {dateKey}
                    </div>

                    {/* Mapeo de Cobros del Día con Conectores */}
                    {dayInstances.map((inst, idx) => {
                      const isLastOfCurrentGroup = idx === dayInstances.length - 1;
                      const isLastOfAll = isLastOfCurrentGroup && gIdx === gArray.length - 1;
                      const connector = isLastOfCurrentGroup ? '└─' : '├─';

                      const todayStr = new Date().toISOString().slice(0, 10);
                      const upcomingLimitStr = new Date(Date.now() + 3*24*60*60*1000).toISOString().slice(0, 10);

                      const isPaid = inst.status === 'PAID';
                      const isOverdue = !isPaid && inst.nextDueDate < todayStr;
                      const isUpcoming = !isPaid && !isOverdue && inst.nextDueDate <= upcomingLimitStr;

                      let statusLabel = 'PROGRAMADO';
                      let statusBg = 'rgba(26,26,26,0.05)';
                      let statusTextCol = 'rgba(26,26,26,0.5)';

                      if (isPaid) {
                        statusLabel = 'PAGADO';
                        statusBg = 'rgba(92,122,82,0.1)';
                        statusTextCol = '#346538';
                      } else if (isOverdue) {
                        statusLabel = 'VENCIDO';
                        statusBg = 'rgba(255,42,42,0.1)';
                        statusTextCol = '#FF2A2A';
                      } else if (isUpcoming) {
                        statusLabel = 'PRÓXIMO';
                        statusBg = 'rgba(184,134,11,0.1)';
                        statusTextCol = '#956400';
                      }

                      return (
                        <div key={inst.id} className="flex justify-between items-baseline pl-4 hover:bg-black/5 transition-colors">
                          <span className={`text-[11px] truncate flex-1 ${isPaid ? 'line-through opacity-40' : ''}`}>
                            {connector} {inst.name.toUpperCase()}
                          </span>
                          <div className="flex items-center space-x-2 pl-2">
                            <span>${fmt(inst.amount)}</span>
                            <span className="text-[8px] font-[600] px-1.5 py-0.5 rounded tracking-wide border border-[#1A1A1A]"
                              style={{ background: statusBg, color: statusTextCol }}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="noria-divider my-2" />

        {/* ── 3. Gestión de Plantillas Maestras ── */}
        <section className="py-4" id="templates-section">
          <div className="flex justify-between items-center mb-3">
            {/* Selector de Pestaña */}
            <div className="flex space-x-3">
              {[
                ['GASTOS', 'Gastos Fijos'],
                ['AHORROS', 'Metas Ahorro']
              ].map(([val, label]) => {
                const isSelected = templatesTab === val;
                return (
                  <button
                    key={val}
                    onClick={() => setTemplatesTab(val)}
                    className="text-[12px] font-[600] uppercase tracking-wider focus:outline-none transition-colors border-b-2 pb-0.5"
                    style={{
                      borderColor: isSelected ? '#5C7A52' : 'transparent',
                      color: isSelected ? '#1A1A1A' : 'rgba(26,26,26,0.35)'
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Botón Añadir Plantilla */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-1 focus:outline-none text-[10px] font-[500] uppercase tracking-wider text-[#5C7A52]"
            >
              <Plus size={10} strokeWidth={2} />
              <span>Añadir</span>
            </button>
          </div>

          {/* Listado de Plantillas Activas */}
          {filteredActive.length === 0 ? (
            <div className="flex flex-col items-center py-8 space-y-2 border border-dashed border-[rgba(0,0,0,0.08)] rounded-[6px] bg-[rgba(0,0,0,0.005)]">
              <p className="text-[12px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin plantillas programadas en esta pestaña</p>
            </div>
          ) : (
            <div className="divide-y divide-noria-text/5 bg-transparent rounded-lg">
              {filteredActive.map(renderAnchorRow)}
            </div>
          )}

          {/* Listado de Plantillas Pausadas */}
          {filteredPaused.length > 0 && (
            <div className="pt-4 mt-4 border-t border-[rgba(0,0,0,0.05)]">
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="w-full flex justify-between items-center py-1 focus:outline-none text-[10px] font-[500] uppercase tracking-wider text-noria-muted"
              >
                <span>Pausadas / Suscripciones desactivadas ({filteredPaused.length})</span>
                <span>{showArchived ? 'Ocultar' : 'Ver'}</span>
              </button>
              {showArchived && (
                <div className="divide-y divide-noria-text/5 mt-2 animate-fade-in">
                  {filteredPaused.map(renderAnchorRow)}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="noria-divider my-2" />

        <section className="py-4" id="transactions-section">
          <button
            type="button"
            onClick={() => setShowTransactions(prev => !prev)}
            className="w-full flex items-center justify-between focus:outline-none"
          >
            <h4 className="text-[18px] font-[400] text-noria-text leading-tight">Transacciones</h4>
            {showTransactions
              ? <ChevronUp size={15} strokeWidth={1.7} />
              : <ChevronDown size={15} strokeWidth={1.7} />
            }
          </button>

          {showTransactions && (
            <div className="pt-4 animate-fade-in">
              <TransactionsSection
                transactions={transactions}
                accounts={accounts}
                onDeleteTransaction={handleDeleteTransaction}
                onUpdateTransaction={handleUpdateTransaction}
              />
            </div>
          )}
        </section>
      </div>

      {/* Modal para Añadir Plantilla */}
      <AnchorFormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreateAnchor}
        activeAccounts={activeAccounts}
        institutions={institutions}
        macetas={macetas}
      />

      {/* Modal para Editar Plantilla */}
      <AnchorFormModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingAnchor(null); }}
        onSubmit={handleUpdateAnchor}
        anchor={editingAnchor}
        activeAccounts={activeAccounts}
        institutions={institutions}
        macetas={macetas}
      />

      {/* FAB Radial */}
      <FAB />

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
