import React, { useState, useEffect, useRef } from 'react';
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
    <div className="w-9 h-9 flex items-center justify-center"
      style={{ background: 'transparent', color: 'rgba(26,26,26,0.55)' }}>
      {icon}
    </div>
  );
  // Fallback: first letter
  return (
    <div className="w-9 h-9 flex items-center justify-center"
      style={{ background: 'transparent', color: 'rgba(26,26,26,0.55)' }}>
      <span className="text-[13px] font-mono font-[700]">{name?.[0]?.toUpperCase() || '?'}</span>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';

export default function HomeScreen() {
  const navigate = useNavigate();
  const [showAddAnchorModal, setShowAddAnchorModal] = useState(false);
  const isRunningRecurrence = useRef(false);
  const [showIncomes, setShowIncomes] = useState(true);

  const [anchorName, setAnchorName] = useState('');
  const [anchorAmount, setAnchorAmount] = useState('');
  const [anchorPillar, setAnchorPillar] = useState('NEED');
  const [anchorAccountId, setAnchorAccountId] = useState('');
  const [anchorDueDate, setAnchorDueDate] = useState('');
  const [anchorError, setAnchorError] = useState('');

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

  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const baseCurrency = baseCurrencyObj?.value || 'USD';

  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const anchors = useLiveQuery(() => db.anchors.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const incomeSources = useLiveQuery(() => db.income_sources.toArray()) || [];
  const macetas = useLiveQuery(() => db.macetas.toArray()) || [];
  const macetaAllocations = useLiveQuery(() => db.maceta_allocations.toArray()) || [];

  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const thisMonthIncomes = transactions.filter(t => new Date(t.date) >= startOfMonth && t.type === 'IN');

  const activeAccounts = accounts.filter(a => !a.isArchived);
  const aggregatedBalance = activeAccounts.reduce((sum, acc) => sum + acc.balance, 0);

  // Estado para la burbuja del día seleccionado en la Línea de Flotación Semanal
  const [selectedDate, setSelectedDate] = useState(null);
  const [showHeroDetail, setShowHeroDetail] = useState(false);

  // Helper para obtener los 7 días de la semana actual (Lunes a Domingo)
  const getWeekDays = () => {
    const today = new Date();
    const currentDay = today.getDay(); // 0: Dom, 1: Lun, ...
    const distance = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(today);
    monday.setDate(today.getDate() + distance);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const weekDays = getWeekDays();
  const startOfWeek = new Date(weekDays[0]);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(weekDays[6]);
  endOfWeek.setHours(23, 59, 59, 999);

  const incomeSum = thisMonthIncomes.reduce((sum, inc) => sum + inc.amount, 0);

  // Lógica de auto-renovación mensual de plantillas e instancias de cobro
  useEffect(() => {
    if (anchors.length === 0) return;
    if (isRunningRecurrence.current) return;

    const runRecurrenceJob = async () => {
      isRunningRecurrence.current = true;
      try {
        await db.transaction('rw', [db.anchors], async () => {
          const freshAnchors = await db.anchors.toArray();

          // 1. Migración en caliente: convertir nextDueDate de objeto Date/Timestamp a String YYYY-MM-DD usando UTC getters
          const legacyDates = freshAnchors.filter(a => a.nextDueDate && typeof a.nextDueDate !== 'string');
          if (legacyDates.length > 0) {
            for (const a of legacyDates) {
              const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate);
              if (!isNaN(d.getTime())) {
                const yr = d.getUTCFullYear();
                const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
                const dy = String(d.getUTCDate()).padStart(2, '0');
                const localDateStr = `${yr}-${mo}-${dy}`;
                await db.anchors.update(a.id, { nextDueDate: localDateStr });
              }
            }
            return; // Reiniciar transacción
          }

          // Reparación automática de fechas desplazadas por desfase horario en la corrida anterior
          const shiftedDates = freshAnchors.filter(a => a.nextDueDate === '2026-07-29' || a.nextDueDate === '2026-06-30');
          if (shiftedDates.length > 0) {
            for (const a of shiftedDates) {
              if (a.nextDueDate === '2026-07-29') {
                await db.anchors.update(a.id, { nextDueDate: '2026-07-30' });
              } else if (a.nextDueDate === '2026-06-30') {
                await db.anchors.update(a.id, { nextDueDate: '2026-07-01' });
              }
            }
            return;
          }

          // 2. Migración en caliente: marcar anclas heredadas sin isTemplate como isTemplate: true
          const legacyAnchors = freshAnchors.filter(a => a.isTemplate === undefined);
          if (legacyAnchors.length > 0) {
            for (const a of legacyAnchors) {
              await db.anchors.update(a.id, { isTemplate: true, isArchived: false });
            }
            return;
          }

          // 3. Generar fechas límite locales para el mes actual
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth();
          const startOfCurrentMonth = new Date(currentYear, currentMonth, 1, 12, 0, 0);
          const endOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0, 12, 0, 0);

          const templates = freshAnchors.filter(a => a.isTemplate === true && !a.isArchived);
          const instances = freshAnchors.filter(a => a.isTemplate === false);

          // 4. Limpieza de duplicados accidentales para el mes actual
          const instancesThisMonth = instances.filter(inst => {
            if (!inst.nextDueDate) return false;
            const instDate = inst.nextDueDate instanceof Date ? inst.nextDueDate : new Date(inst.nextDueDate + 'T12:00:00');
            return instDate >= startOfCurrentMonth && instDate <= endOfCurrentMonth;
          });

          const groups = {};
          for (const inst of instancesThisMonth) {
            if (!inst.parentAnchorId) continue;
            if (!groups[inst.parentAnchorId]) {
              groups[inst.parentAnchorId] = [];
            }
            groups[inst.parentAnchorId].push(inst);
          }

          for (const parentId in groups) {
            const list = groups[parentId];
            if (list.length > 1) {
              // Si hay duplicados, conservar la pagada (PAID), o en su defecto la primera.
              const keeper = list.find(a => a.status === 'PAID') || list[0];
              for (const item of list) {
                if (item.id !== keeper.id) {
                  await db.anchors.delete(item.id);
                }
              }
            }
          }

          // 5. Generación de las instancias proyectadas según la frecuencia flexible (Strings YYYY-MM-DD)
          const updatedAnchors = await db.anchors.toArray();
          const freshInstances = updatedAnchors.filter(a => a.isTemplate === false);

          const getProjectedDatesInMonth = (startDateStr, interval, unit, startOfMonth, endOfMonth) => {
            const dates = [];
            if (!startDateStr || typeof startDateStr !== 'string') return dates;
            const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
            let current = new Date(sYear, sMonth - 1, sDay, 12, 0, 0);

            const safeInterval = Math.max(1, interval || 1);

            const addInterval = (d) => {
              const next = new Date(d);
              if (unit === 'DAYS') next.setDate(next.getDate() + safeInterval);
              else if (unit === 'WEEKS') next.setDate(next.getDate() + (safeInterval * 7));
              else if (unit === 'MONTHS') next.setMonth(next.getMonth() + safeInterval);
              else if (unit === 'YEARS') next.setFullYear(next.getFullYear() + safeInterval);
              next.setHours(12, 0, 0, 0);
              return next;
            };

            if (current > endOfMonth) {
              return dates;
            }

            let iter = 0;
            while (current < startOfMonth && iter < 1000) {
              current = addInterval(current);
              iter++;
            }

            iter = 0;
            while (current >= startOfMonth && current <= endOfMonth && iter < 100) {
              const yr = current.getFullYear();
              const mo = String(current.getMonth() + 1).padStart(2, '0');
              const dy = String(current.getDate()).padStart(2, '0');
              dates.push(`${yr}-${mo}-${dy}`);
              current = addInterval(current);
              iter++;
            }

            // Incluir fecha original si corresponde
            const startLocal = new Date(startOfMonth);
            const endLocal = new Date(endOfMonth);
            const orig = new Date(sYear, sMonth - 1, sDay, 12, 0, 0);
            if (orig >= startLocal && orig <= endLocal) {
              if (!dates.includes(startDateStr)) {
                dates.push(startDateStr);
              }
            }

            return dates.sort();
          };

          for (const temp of templates) {
            const startDateStr = temp.nextDueDate || new Date().toISOString().slice(0, 10);
            const interval = temp.frequencyInterval || 1;
            const unit = temp.frequencyUnit || 'MONTHS';

            const projectedDates = getProjectedDatesInMonth(startDateStr, interval, unit, startOfCurrentMonth, endOfCurrentMonth);

            for (const projDate of projectedDates) {
              const hasInstance = freshInstances.some(inst => {
                if (inst.parentAnchorId !== temp.id) return false;
                return inst.nextDueDate === projDate;
              });

              if (!hasInstance) {
                await db.anchors.add({
                  name: temp.name,
                  type: temp.type || 'FIXED',
                  amount: temp.amount,
                  currency: temp.currency || 'USD',
                  accountId: temp.accountId || null,
                  macetaId: temp.macetaId || null,
                  nextDueDate: projDate,
                  status: 'PENDING',
                  pillar: temp.pillar,
                  isTemplate: false,
                  parentAnchorId: temp.id
                });
              }
            }
          }
        });
      } catch (err) {
        console.error('Error in recurrence job transaction:', err);
      } finally {
        isRunningRecurrence.current = false;
      }
    };

    runRecurrenceJob();
  }, [anchors]);

  // 1. Obtener todas las instancias de anchors que caen en la semana actual
  const thisWeekAnchors = anchors.filter(a => {
    if (a.isTemplate !== false) return false;
    const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate + 'T12:00:00');
    const t = new Date(d); t.setHours(0, 0, 0, 0);
    const start = new Date(startOfWeek); start.setHours(0, 0, 0, 0);
    const end = new Date(endOfWeek); end.setHours(23, 59, 59, 999);
    return t >= start && t <= end;
  });

  // 2. Filtrar si hay una fecha seleccionada
  const displayedAnchors = thisWeekAnchors.filter(a => {
    if (!selectedDate) return true;
    const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate + 'T12:00:00');
    return d.getFullYear() === selectedDate.getFullYear() &&
      d.getMonth() === selectedDate.getMonth() &&
      d.getDate() === selectedDate.getDate();
  });

  // 3. Cálculos de Homeostasis Mensual (Mes Actual) para el Disponible del Mes
  const now = new Date();
  const thisMonthInstances = anchors.filter(a => {
    if (a.isTemplate !== false) return false;
    const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate + 'T12:00:00');
    const startM = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const endM = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return d >= startM && d <= endM;
  });

  const totalAllocatedToMacetas = macetaAllocations.reduce((sum, a) => sum + a.amount, 0);

  const pendingGastos = thisMonthInstances
    .filter(a => a.status !== 'PAID' && (a.pillar === 'NEED' || a.pillar === 'WANT'))
    .reduce((sum, a) => sum + a.amount, 0);

  const pendingAhorros = thisMonthInstances
    .filter(a => a.status !== 'PAID' && a.pillar === 'SAVE')
    .reduce((sum, a) => sum + a.amount, 0);

  const disponibleDelMes = Math.max(0, aggregatedBalance - totalAllocatedToMacetas - pendingGastos - pendingAhorros);

  const pendingAnchors = displayedAnchors.filter(a => a.status !== 'PAID').slice(0, 3);
  const paidAnchors = displayedAnchors.filter(a => a.status === 'PAID').slice(0, 3);

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
    p === 'NEED' ? '#4F8F58' : p === 'WANT' ? '#3F7F9C' : '#C58A14';
  const pillarBg = (p) =>
    p === 'NEED' ? 'rgba(79,143,88,0.12)' : p === 'WANT' ? 'rgba(63,127,156,0.12)' : 'rgba(197,138,20,0.12)';
  const pillarLabel = (p) =>
    p === 'NEED' ? 'NECESIDAD' : p === 'WANT' ? 'DESEO' : 'AHORRO';
  const isAnchorOverdue = (anchor) => {
    if (!anchor.nextDueDate) return false;
    const dateObj = anchor.nextDueDate instanceof Date
      ? anchor.nextDueDate
      : new Date(anchor.nextDueDate + 'T12:00:00');
    const startOfCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return dateObj < startOfCurrentMonth;
  };
  const anchorBadgeLabel = (anchor) => isAnchorOverdue(anchor) ? 'ATRASADO' : pillarLabel(anchor.pillar);
  const anchorBadgeColor = (anchor) => isAnchorOverdue(anchor) ? '#9F2F2D' : pillarColor(anchor.pillar);
  const anchorBadgeBg = (anchor) => isAnchorOverdue(anchor) ? 'rgba(159,47,45,0.08)' : pillarBg(anchor.pillar);
  const heroAmount = `$${fmt(disponibleDelMes)}`;
  const heroFontSize = heroAmount.length > 11 ? '50px' : heroAmount.length > 9 ? '58px' : '66px';

  return (
    <div className="min-h-screen pb-32 pt-16" style={{ background: '#F5F2ED' }}>
      <Header title="Noria" />

      <main className="px-6 max-w-md mx-auto">

        {/* ── Balance hero — Disponible del Mes Brutalista ── */}
        <section className="py-7 cursor-pointer" id="balance-hero" onClick={() => setShowHeroDetail(!showHeroDetail)}>
          <p className="text-[10px] font-[700] uppercase tracking-[0.18em] text-noria-text opacity-55 font-mono mb-2">
            DISPONIBLE DEL MES
          </p>
          <p
            className="text-noria-text font-sans font-[500]"
            style={{ lineHeight: 0.92, fontSize: heroFontSize, letterSpacing: '-0.01em' }}
          >
            {heroAmount}
          </p>
          <p className="text-[11px] text-noria-muted font-mono mt-2 underline underline-offset-2 decoration-[rgba(26,26,26,0.35)]">
            {showHeroDetail ? '▲ Ocultar desglose' : '▼ Presiona para ver desglose'}
          </p>

          {showHeroDetail && (
            <div className="mt-5 border-2 border-[#1A1A1A] p-4 font-mono text-noria-text bg-transparent animate-fade-in">
              <div className="flex items-start justify-between gap-3 mb-5">
                <p className="text-[10px] font-[700] tracking-[0.16em] uppercase opacity-55">CALCULO DISPONIBLE</p>
                <span className="border border-[#1A1A1A] px-2 py-1 text-[9px] font-[700] tracking-[0.12em] uppercase leading-none">{baseCurrency}</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between gap-3">
                  <span>Patrimonio Total:</span>
                  <span>${fmt(aggregatedBalance)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>(-) Asignado a Metas:</span>
                  <span>-${fmt(totalAllocatedToMacetas)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>(-) Gastos Pendientes:</span>
                  <span>-${fmt(pendingGastos)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>(-) Ahorros Pend.:</span>
                  <span>-${fmt(pendingAhorros)}</span>
                </div>
              </div>
              <div className="border-t border-[#1A1A1A] mt-4 pt-3 flex justify-between gap-3 text-[12px] font-[700]">
                <span>Disponible Neto:</span>
                <span>${fmt(disponibleDelMes)}</span>
              </div>
            </div>
          )}
        </section>

        <div className="noria-divider" />

        {/* ── Homeostasis ── */}
        <section className="py-6">
          <HomeostasisBar />
        </section>

        <div className="noria-divider" />

        {/* ── Línea de Flotación Semanal ── */}
        <section className="py-6" id="anchors-list-section">
          <div className="flex justify-between items-baseline mb-4">
            <h3 className="text-[17px] font-[600] text-noria-text leading-tight">Línea de Flotación</h3>
            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="text-[10px] font-mono font-[700] uppercase tracking-wider text-noria-muted hover:text-noria-text transition-colors focus:outline-none"
              >
                Ver toda la semana
              </button>
            )}
          </div>

          {/* Burbujas de los 7 Días de la Semana Actual */}
          <div className="grid grid-cols-7 gap-1.5 mb-5">
            {weekDays.map((date, idx) => {
              const isToday = new Date().toDateString() === date.toDateString();
              const isSelected = selectedDate && selectedDate.toDateString() === date.toDateString();
              const dayName = date.toLocaleDateString('es-ES', { weekday: 'narrow' }).toUpperCase();
              const dayNum = date.getDate();

              // Calcular compromisos de este día exacto
              const dayAnchors = thisWeekAnchors.filter(a => {
                const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate + 'T12:00:00');
                return d.toDateString() === date.toDateString();
              });

              let dotColor = null;
              if (dayAnchors.length > 0) {
                const hasPending = dayAnchors.some(a => a.status !== 'PAID');
                if (hasPending) {
                  const hasOverdue = dayAnchors.some(a => {
                    if (a.status === 'PAID') return false;
                    const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate);
                    const todayCl = new Date(); todayCl.setHours(0, 0, 0, 0);
                    return d < todayCl;
                  });
                  const hasToday = dayAnchors.some(a => {
                    if (a.status === 'PAID') return false;
                    const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate);
                    const todayCl = new Date(); todayCl.setHours(0, 0, 0, 0);
                    return d.toDateString() === todayCl.toDateString();
                  });

                  if (hasOverdue) dotColor = '#9F2F2D'; // Rojo (vencido)
                  else if (hasToday) dotColor = '#C58A14'; // Ocre (vence hoy)
                  else dotColor = 'rgba(26,26,26,0.3)'; // Gris (futuro)
                } else {
                  dotColor = '#4F8F58'; // Verde (completado)
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedDate(null);
                    } else {
                      setSelectedDate(date);
                    }
                  }}
                  className="relative flex aspect-square flex-col items-center justify-center border focus:outline-none transition-all"
                  style={{
                    background: isSelected ? '#647C78' : 'transparent',
                    borderColor: isSelected ? '#647C78' : isToday ? 'rgba(100,124,120,0.45)' : 'rgba(26,26,26,0.18)',
                    color: isSelected ? '#F5F2ED' : '#1A1A1A',
                  }}
                >
                  <span className="text-[8px] font-mono font-[700] opacity-60 mb-0.5">{dayName}</span>
                  <span className="text-[16px] font-[700] leading-none">
                    {dayNum}
                  </span>
                  <div className="absolute bottom-1 h-[2px] w-3" style={{ background: dotColor || 'transparent' }} />
                </button>
              );
            })}
          </div>

          <h4 className="text-[17px] font-[600] text-noria-text leading-tight mb-3">Pagos Pendientes</h4>

          {pendingAnchors.length === 0 && paidAnchors.length === 0 ? (
            <div className="flex flex-col items-center py-8 space-y-2" id="anchors-empty-state">
              <p className="text-[12px]" style={{ color: 'rgba(26,26,26,0.35)' }}>
                {selectedDate
                  ? `Sin obligaciones para el ${selectedDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
                  : 'Sin obligaciones para esta semana'
                }
              </p>
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
                          style={{ background: anchorBadgeBg(anchor), color: anchorBadgeColor(anchor) }}
                        >
                          {anchorBadgeLabel(anchor)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <p className="text-[15px] font-mono font-[700] text-noria-text">
                      ${fmt(anchor.amount)}
                    </p>
                    <button
                      id={`pay-anchor-btn-${anchor.id}`}
                      onClick={() => handlePayAnchor(anchor)}
                      className="w-7 h-7 border flex items-center justify-center transition-colors focus:outline-none"
                      style={{ borderColor: 'rgba(26,26,26,0.22)', color: 'rgba(26,26,26,0.34)' }}
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
                    <div className="w-7 h-7 border flex items-center justify-center"
                      style={{ background: 'rgba(100,124,120,0.10)', borderColor: 'rgba(100,124,120,0.35)', color: '#647C78' }}>
                      <Check size={11} strokeWidth={2} />
                    </div>
                    <p className="text-[15px] font-[400] text-noria-text line-through">{anchor.name}</p>
                  </div>
                  <p className="text-[15px] font-mono font-[700] text-noria-text">${fmt(anchor.amount)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Botón ASCII de navegación brutalista */}
          <button
            onClick={() => navigate('/budget')}
            className="w-full mt-5 py-3.5 text-[10px] font-mono font-[700] uppercase tracking-wider bg-transparent text-noria-text hover:bg-[rgba(26,26,26,0.04)] transition-all active:scale-[0.98]"
          >
            {`>>> VER TODA LA FLOTACIÓN [CALENDARIO]`}
          </button>
        </section>

        <div className="noria-divider" />

        {/* ── Ingresos del mes (collapse) ── */}
        <section className="py-6" id="incomes-collapse-section">
          <button
            id="toggle-incomes-btn"
            onClick={() => setShowIncomes(!showIncomes)}
            className="w-full flex justify-between items-center focus:outline-none"
          >
            <div className="flex items-baseline space-x-3">
              <h3 className="text-[17px] font-[600] text-noria-text leading-tight">Ingresos del Mes</h3>
              {incomeSum > 0 && (
                <span className="text-[13px] font-mono font-[700]" style={{ color: '#647C78' }}>
                  +${fmt(incomeSum)}
                </span>
              )}
            </div>
            {showIncomes
              ? <ChevronUp size={14} strokeWidth={1.8} style={{ color: 'rgba(26,26,26,0.42)' }} />
              : <ChevronDown size={14} strokeWidth={1.8} style={{ color: 'rgba(26,26,26,0.42)' }} />
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
                        <p className="text-[15px] font-[500] text-noria-text">{inc.description || 'Ingreso'}</p>
                        {srcName && <p className="label-section mt-0.5">{srcName}</p>}
                      </div>
                      <p className="text-[15px] font-mono font-[700]" style={{ color: '#647C78' }}>
                        +${fmt(inc.amount)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate('/transactions')}
            className="mt-4 text-[10px] font-mono font-[700] uppercase tracking-wider text-noria-muted hover:text-noria-text focus:outline-none"
          >
            Ver transacciones
          </button>
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
                    {[['NEED', 'NEC', '#4F8F58'], ['WANT', 'DES', '#3F7F9C'], ['SAVE', 'AHO', '#C58A14']].map(([val, short, col]) => (
                      <button key={val} type="button" onClick={() => setAnchorPillar(val)}
                        className="flex-1 py-1 text-[9px] font-mono font-[700] uppercase border transition-all"
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

              {anchorError && <p className="text-[12px] font-[500]" style={{ color: '#C58A14' }}>{anchorError}</p>}

              <button id="submit-new-anchor-btn" type="submit"
                className="w-full py-3.5 text-[13px] font-[500] uppercase tracking-wider transition-colors border mt-2"
                style={{ background: 'transparent', color: '#1A1A1A', borderColor: '#1A1A1A' }}>
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

              <div className="border border-[rgba(197,138,20,0.24)] rounded-lg p-3" style={{ background: 'rgba(197,138,20,0.06)' }}>
                <p className="text-[11px] font-[500]" style={{ color: '#C58A14' }}>META DE AHORRO PENDIENTE</p>
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
                      {activeAccounts.map(acc => {
                        const inst = institutions.find(i => i.id === acc.institutionId);
                        const label = inst ? `${inst.name} · ${acc.name} (${acc.type})` : `${acc.name} (${acc.type})`;
                        return (
                          <option key={acc.id} value={acc.id}>
                            {label} (${fmt(acc.balance)})
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-[10px] text-noria-muted mt-1.5 leading-relaxed">
                      El dinero no sale de tu patrimonio líquido; se retiene mentalmente en esta cuenta para cumplir con tu meta de ahorro.
                    </p>
                  </div>

                  {savePayError && <p className="text-[12px] font-[500]" style={{ color: '#C58A14' }}>{savePayError}</p>}

                  <button
                    type="submit"
                    className="w-full py-3 text-[12px] font-[600] uppercase tracking-wider border transition-colors"
                    style={{ background: 'transparent', color: '#4F8F58', borderColor: '#4F8F58' }}
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
                        {activeAccounts.map(acc => {
                          const inst = institutions.find(i => i.id === acc.institutionId);
                          const label = inst ? `${inst.name} · ${acc.name} (${acc.type})` : `${acc.name} (${acc.type})`;
                          return (
                            <option key={acc.id} value={acc.id}>
                              {label} (${fmt(acc.balance)})
                            </option>
                          );
                        })}
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
                        {activeAccounts.map(acc => {
                          const inst = institutions.find(i => i.id === acc.institutionId);
                          const label = inst ? `${inst.name} · ${acc.name} (${acc.type})` : `${acc.name} (${acc.type})`;
                          return (
                            <option key={acc.id} value={acc.id}>
                              {label} (${fmt(acc.balance)})
                            </option>
                          );
                        })}
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

                  {savePayError && <p className="text-[12px] font-[500]" style={{ color: '#C58A14' }}>{savePayError}</p>}

                  <button
                    type="submit"
                    className="w-full py-3 text-[12px] font-[600] uppercase tracking-wider border transition-colors"
                    style={{ background: 'transparent', color: '#4F8F58', borderColor: '#4F8F58' }}
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
                  {activeAccounts.map(acc => {
                    const inst = institutions.find(i => i.id === acc.institutionId);
                    const label = inst ? `${inst.name} · ${acc.name} (${acc.type})` : `${acc.name} (${acc.type})`;
                    return (
                      <option key={acc.id} value={acc.id}>
                        {label} (${fmt(acc.balance)})
                      </option>
                    );
                  })}
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 text-[13px] font-[500] uppercase tracking-wider transition-colors border"
                style={{ background: 'transparent', color: '#1A1A1A', borderColor: '#1A1A1A' }}
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
