import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import FAB from '../components/FAB.jsx';
import AnchorFormModal from '../components/AnchorFormModal.jsx';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Check } from 'lucide-react';

export default function BudgetScreen() {
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [templatesTab, setTemplatesTab] = useState('GASTOS'); // 'GASTOS' o 'AHORROS'

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
  const [payingGeneralAnchor, setPayingGeneralAnchor] = useState(null);
  const [generalPayAccountId, setGeneralPayAccountId] = useState('');
  const [payingSaveAnchor, setPayingSaveAnchor] = useState(null);
  const [savePayMode, setSavePayMode] = useState('ALLOC');
  const [allocAccountId, setAllocAccountId] = useState('');
  const [transFromAccountId, setTransFromAccountId] = useState('');
  const [transToAccountId, setTransToAccountId] = useState('');
  const [transAmountReceived, setTransAmountReceived] = useState('');
  const [transExchangeRate, setTransExchangeRate] = useState('1.00');
  const [savePayError, setSavePayError] = useState('');

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

  const handleStartQuickPay = (anchor) => {
    if (anchor.pillar === 'SAVE' || anchor.type === 'SAVE') {
      setPayingSaveAnchor(anchor);
      setSavePayMode('ALLOC');
      setSavePayError('');
      const firstAccount = activeAccounts[0];
      const secondAccount = activeAccounts[1] || firstAccount;
      if (firstAccount) {
        setAllocAccountId(firstAccount.id.toString());
        setTransFromAccountId(firstAccount.id.toString());
      }
      if (secondAccount) setTransToAccountId(secondAccount.id.toString());
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
          currency: payingGeneralAnchor.currency || account.currency || 'USD',
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

  const resolveSaveTarget = (anchor) => {
    let targetMacetaId = anchor.macetaId;
    if (!targetMacetaId) {
      const namePart = anchor.name.replace('Ahorro: ', '').trim().toLowerCase();
      const found = macetas.find(m => m.name.toLowerCase() === namePart);
      if (found) targetMacetaId = found.id;
    }
    return macetas.find(m => m.id === targetMacetaId) || null;
  };

  const handleExecuteSaveAlloc = async (e) => {
    e.preventDefault();
    if (!payingSaveAnchor) return;
    setSavePayError('');

    try {
      const maceta = resolveSaveTarget(payingSaveAnchor);
      if (!maceta) {
        setSavePayError('Meta de ahorro asociada no encontrada.');
        return;
      }

      const accountId = parseInt(allocAccountId);
      const account = accounts.find(a => a.id === accountId);
      if (!account) {
        setSavePayError('Cuenta no encontrada.');
        return;
      }

      const amount = payingSaveAnchor.amount;
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
    } catch {
      setSavePayError('Error al procesar la asignacion del ahorro.');
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
        setSavePayError('El monto recibido debe ser un numero positivo.');
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

      const maceta = resolveSaveTarget(payingSaveAnchor);
      if (!maceta) {
        setSavePayError('Meta de ahorro asociada no encontrada.');
        return;
      }

      const transferId = 'TX-' + Date.now();
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
        await db.accounts.update(fromId, { balance: fromAccount.balance - amountSent });
        await db.accounts.update(toId, { balance: toAccount.balance + amountRec });
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
    } catch {
      setSavePayError('Error al procesar la transferencia del ahorro.');
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

        {/* Calendario de pagos */}
        <section className="py-4" id="projections-section">
          <h4 className="text-[17px] font-[600] text-noria-text leading-tight mb-4">Calendario de pagos</h4>

          <div className="space-y-3 p-3 border border-[#1A1A1A] bg-transparent mb-4">
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

            <div className="grid grid-cols-5 gap-1 pt-1">
              <button onClick={setMonthShortcut} className="border border-[#1A1A1A] bg-transparent py-1 text-[7px] font-mono leading-none px-0.5">MES</button>
              <button onClick={() => setRangeShortcut(7)} className="border border-[#1A1A1A] bg-transparent py-1 text-[7px] font-mono leading-none px-0.5">7 D</button>
              <button onClick={() => setRangeShortcut(30)} className="border border-[#1A1A1A] bg-transparent py-1 text-[7px] font-mono leading-none px-0.5">30 D</button>
              <button onClick={setQuarterShortcut} className="border border-[#1A1A1A] bg-transparent py-1 text-[7px] font-mono leading-none px-0.5">90 D</button>
              <button onClick={setYearShortcut} className="border border-[#1A1A1A] bg-transparent py-1 text-[7px] font-mono leading-none px-0.5">ANO</button>
            </div>
          </div>

          {projectedInstances.length === 0 ? (
            <p className="text-[12px] text-noria-muted font-mono text-center py-4">Sin pagos programados para este periodo</p>
          ) : (
            <div className="max-h-72 overflow-y-auto pr-1 bg-transparent p-3 border border-[#1A1A1A] font-mono text-[12px] leading-relaxed">
              {Object.keys(groupedInstances).map((dateKey) => {
                const dayInstances = groupedInstances[dateKey];
                return (
                  <div key={dateKey} className="mb-3">
                    <div className="text-noria-text font-[700] text-[10px] uppercase tracking-[0.12em] mb-1">{dateKey}</div>
                    {dayInstances.map((inst, idx) => {
                      const isLastOfCurrentGroup = idx === dayInstances.length - 1;
                      const connector = isLastOfCurrentGroup ? 'L-' : '|-';
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
                        statusBg = 'rgba(79,143,88,0.12)';
                        statusTextCol = '#4F8F58';
                      } else if (isOverdue) {
                        statusLabel = 'VENCIDO';
                        statusBg = 'rgba(159,47,45,0.10)';
                        statusTextCol = '#9F2F2D';
                      } else if (isUpcoming) {
                        statusLabel = 'PROXIMO';
                        statusBg = 'rgba(197,138,20,0.12)';
                        statusTextCol = '#C58A14';
                      }

                      return (
                        <div key={inst.id} className="flex justify-between items-center gap-2 pl-2 py-1 hover:bg-black/5 transition-colors">
                          <span className={`text-[11px] truncate flex-1 ${isPaid ? 'line-through opacity-40' : ''}`}>
                            {connector} {inst.name.toUpperCase()}
                          </span>
                          <div className="flex items-center space-x-2 pl-2 shrink-0">
                            <span className="text-[11px]">${fmt(inst.amount)}</span>
                            <span className="text-[8px] font-[700] px-1.5 py-0.5 tracking-wide border border-[#1A1A1A]" style={{ background: statusBg, color: statusTextCol }}>
                              {statusLabel}
                            </span>
                            {!isPaid && (
                              <button
                                type="button"
                                onClick={() => handleStartQuickPay(inst)}
                                className="w-6 h-6 border border-[#1A1A1A] bg-transparent flex items-center justify-center text-noria-text focus:outline-none"
                                title={inst.pillar === 'SAVE' ? 'Cumplir ahorro' : 'Pagar'}
                              >
                                <Check size={11} strokeWidth={2} />
                              </button>
                            )}
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

        <button
          type="button"
          onClick={() => navigate('/transactions')}
          className="mb-4 text-[10px] font-mono font-[700] uppercase tracking-wider text-noria-muted hover:text-noria-text focus:outline-none"
        >
          Ver transacciones
        </button>
      </div>

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
                <h4 className="text-[17px] font-[600] text-noria-text leading-tight">Confirmar pago</h4>
                <button type="button" onClick={() => setPayingGeneralAnchor(null)}
                  className="focus:outline-none p-1" style={{ color: 'rgba(26,26,26,0.4)' }}>x</button>
              </div>
              <div className="border border-[#1A1A1A] p-3">
                <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Pago pendiente</p>
                <div className="flex justify-between items-center mt-1 gap-3">
                  <span className="text-[15px] font-[600] text-noria-text">{payingGeneralAnchor.name}</span>
                  <span className="font-mono text-[15px] font-[700] text-noria-text">${fmt(payingGeneralAnchor.amount)}</span>
                </div>
              </div>
              <div>
                <label className="muji-header block mb-1">Cuenta de pago</label>
                <select value={generalPayAccountId} onChange={e => setGeneralPayAccountId(e.target.value)} className="muji-input" required>
                  {activeAccounts.map(acc => {
                    const inst = institutions.find(i => i.id === acc.institutionId);
                    const label = inst ? `${inst.name} - ${acc.name} (${acc.type})` : `${acc.name} (${acc.type})`;
                    return <option key={acc.id} value={acc.id}>{label} (${fmt(acc.balance)})</option>;
                  })}
                </select>
              </div>
              <button type="submit" className="w-full py-3 text-[12px] font-[600] uppercase tracking-wider border transition-colors" style={{ background: 'transparent', color: '#1A1A1A', borderColor: '#1A1A1A' }}>
                Confirmar pago
              </button>
            </form>
          </div>
        </>
      )}

      {payingSaveAnchor && (
        <>
          <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40" onClick={() => setPayingSaveAnchor(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up"
            style={{ background: '#F5F2ED', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)' }}>
            <div className="px-6 pt-4 pb-10 space-y-4">
              <div className="flex justify-center mb-2">
                <div className="w-8 h-[3px] rounded-full" style={{ background: 'rgba(26,26,26,0.12)' }} />
              </div>
              <div className="flex justify-between items-center">
                <h4 className="text-[17px] font-[600] text-noria-text leading-tight">Cumplir ahorro</h4>
                <button type="button" onClick={() => setPayingSaveAnchor(null)}
                  className="focus:outline-none p-1" style={{ color: 'rgba(26,26,26,0.4)' }}>x</button>
              </div>
              <div className="border border-[#1A1A1A] p-3">
                <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em]" style={{ color: '#C58A14' }}>Ahorro pendiente</p>
                <div className="flex justify-between items-center mt-1 gap-3">
                  <span className="text-[15px] font-[600] text-noria-text">{payingSaveAnchor.name}</span>
                  <span className="font-mono text-[15px] font-[700] text-noria-text">${fmt(payingSaveAnchor.amount)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setSavePayMode('ALLOC')} className="py-2 text-[10px] font-[700] uppercase tracking-[0.1em] border focus:outline-none" style={{ borderColor: savePayMode === 'ALLOC' ? '#647C78' : 'rgba(26,26,26,0.18)', color: savePayMode === 'ALLOC' ? '#647C78' : 'rgba(26,26,26,0.45)' }}>
                  Asignar
                </button>
                <button type="button" onClick={() => setSavePayMode('TRANSFER')} className="py-2 text-[10px] font-[700] uppercase tracking-[0.1em] border focus:outline-none" style={{ borderColor: savePayMode === 'TRANSFER' ? '#647C78' : 'rgba(26,26,26,0.18)', color: savePayMode === 'TRANSFER' ? '#647C78' : 'rgba(26,26,26,0.45)' }}>
                  Transferir
                </button>
              </div>

              {savePayMode === 'ALLOC' ? (
                <form onSubmit={handleExecuteSaveAlloc} className="space-y-4">
                  <div>
                    <label className="muji-header block mb-1">Cuenta donde se retiene</label>
                    <select value={allocAccountId} onChange={e => setAllocAccountId(e.target.value)} className="muji-input" required>
                      {activeAccounts.map(acc => {
                        const inst = institutions.find(i => i.id === acc.institutionId);
                        const label = inst ? `${inst.name} - ${acc.name} (${acc.type})` : `${acc.name} (${acc.type})`;
                        return <option key={acc.id} value={acc.id}>{label} (${fmt(acc.balance)})</option>;
                      })}
                    </select>
                  </div>
                  {savePayError && <p className="text-[12px] font-[500]" style={{ color: '#C58A14' }}>{savePayError}</p>}
                  <button type="submit" className="w-full py-3 text-[12px] font-[600] uppercase tracking-wider border transition-colors" style={{ background: 'transparent', color: '#4F8F58', borderColor: '#4F8F58' }}>
                    Marcar como asignado
                  </button>
                </form>
              ) : (
                <form onSubmit={handleExecuteSaveTransfer} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="muji-header block mb-1">Origen</label>
                      <select value={transFromAccountId} onChange={e => setTransFromAccountId(e.target.value)} className="muji-input" required>
                        {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} (${fmt(acc.balance)})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="muji-header block mb-1">Destino</label>
                      <select value={transToAccountId} onChange={e => setTransToAccountId(e.target.value)} className="muji-input" required>
                        {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} (${fmt(acc.balance)})</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="muji-header block mb-1">Monto recibido</label>
                    <input type="number" step="0.01" inputMode="decimal" value={transAmountReceived} onChange={e => {
                      setTransAmountReceived(e.target.value);
                      const rate = parseFloat(e.target.value) / payingSaveAnchor.amount;
                      setTransExchangeRate(isNaN(rate) ? '1.00' : rate.toFixed(4));
                    }} className="muji-input" required />
                    <p className="font-mono text-[10px] text-noria-muted mt-1">Tasa efectiva: {transExchangeRate}</p>
                  </div>
                  {savePayError && <p className="text-[12px] font-[500]" style={{ color: '#C58A14' }}>{savePayError}</p>}
                  <button type="submit" className="w-full py-3 text-[12px] font-[600] uppercase tracking-wider border transition-colors" style={{ background: 'transparent', color: '#4F8F58', borderColor: '#4F8F58' }}>
                    Transferir y asignar
                  </button>
                </form>
              )}
            </div>
          </div>
        </>
      )}

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
