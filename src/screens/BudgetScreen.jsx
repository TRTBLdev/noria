import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import FAB from '../components/FAB.jsx';
import AnchorFormModal from '../components/AnchorFormModal.jsx';
import PillarTag from '../components/PillarTag.jsx';
import CategoryTag from '../components/CategoryTag.jsx';
import CategoryIcon from '../components/CategoryIcon.jsx';
import { CurrencyAmount } from '../components/CurrencyAmount.jsx';
import { convertAmountToBase } from '../utils/currency.js';
import { useNavigate } from 'react-router-dom';
import { formatNumber, formatCurrency, formatAmountWithSymbol } from '../utils/format';
import { consumeCurrencyLots, createCurrencyLot, stringifyLotConsumption } from '../db/currencyLots.js';
import { addAnchorTemplateWithCurrentInstances, syncAnchorTemplateCurrentInstances } from '../db/anchorRecurrence.js';
import { isPersonalExpenseTransaction } from '../db/transactionApplications.js';
import { addSavingsContributionInTransaction, syncSavingsContributionPeriods } from '../db/savingsContributions.js';
import { getCurrentGoalPeriod, syncSpendingGoalPeriods } from '../db/spendingGoals.js';
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Check, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react';

const GOAL_PERIOD_STATUS_LABELS = {
  ACTIVE: 'Activo',
  ACTIVE_PARTIAL: 'Activo parcial',
  COMPLETED: 'Completado',
  PARTIAL: 'Parcial',
  EXPIRED: 'Vencido',
};

export default function BudgetScreen() {
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [isPaymentCalendarOpen, setIsPaymentCalendarOpen] = useState(true);
  const [isFixedExpensesOpen, setIsFixedExpensesOpen] = useState(true);
  const [isSpendingGoalsOpen, setIsSpendingGoalsOpen] = useState(true);
  const [isSavingsTemplatesOpen, setIsSavingsTemplatesOpen] = useState(true);
  const [addAllowedPillars, setAddAllowedPillars] = useState(['NEED', 'WANT']);
  const [openAnchorMenuId, setOpenAnchorMenuId] = useState(null);

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
  const [generalPayDate, setGeneralPayDate] = useState('');
  const [payingSaveAnchor, setPayingSaveAnchor] = useState(null);
  const [savePayMode, setSavePayMode] = useState('ALLOC');
  const [allocAccountId, setAllocAccountId] = useState('');
  const [transFromAccountId, setTransFromAccountId] = useState('');
  const [transToAccountId, setTransToAccountId] = useState('');
  const [transAmountReceived, setTransAmountReceived] = useState('');
  const [transExchangeRate, setTransExchangeRate] = useState('1.00');
  const [savePayError, setSavePayError] = useState('');
  const [saveContributionAmount, setSaveContributionAmount] = useState('');

  // Dexie Queries
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const anchors = useLiveQuery(() => db.anchors.toArray()) || [];
  const macetas = useLiveQuery(() => db.macetas.toArray()) || [];
  const macetaAllocations = useLiveQuery(() => db.maceta_allocations.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const dbCurrencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const lots = useLiveQuery(() => db.lots.toArray()) || [];
  const spendingGoals = useLiveQuery(() => db.spending_goals.toArray()) || [];
  const spendingGoalPeriods = useLiveQuery(() => db.spending_goal_periods.toArray()) || [];
  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const lotCurrencyObj = useLiveQuery(() => db.app_config.get('lotCurrency'));
  const monthlyIncomeObj = useLiveQuery(() => db.app_config.get('monthlyIncome'));
  const pillarPctObj = useLiveQuery(() => db.app_config.get('pillarPct'));
  const baseCurrency = baseCurrencyObj?.value || '';
  const lotCurrency = lotCurrencyObj?.value || '';
  const monthlyIncome = monthlyIncomeObj?.value || 0;
  const pillarPct = pillarPctObj?.value || { NEED: 50, WANT: 30, SAVE: 20 };

  const getAccountBalanceInBase = (acc) => {
    return convertAmountToBase(acc.balance, acc.currency, baseCurrency, lots, dbCurrencies) ?? 0;
  };
  const transactionAmountInBase = (transaction) => {
    if (transaction.baseCurrency === baseCurrency && Number.isFinite(transaction.baseAmount)) return transaction.baseAmount;
    return convertAmountToBase(transaction.amount, transaction.currency, baseCurrency, lots, dbCurrencies) ?? 0;
  };

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

  React.useEffect(() => {
    if (anchors.length > 0) syncSavingsContributionPeriods(db).catch(console.error);
  }, [anchors.length]);

  React.useEffect(() => {
    syncSpendingGoalPeriods(db).catch(console.error);
  }, [spendingGoals.length]);

  const activeSpendingGoals = useMemo(() => spendingGoals
    .filter(goal => goal.status !== 'ARCHIVED')
    .map(goal => ({ ...goal, currentPeriod: getCurrentGoalPeriod(spendingGoalPeriods, goal.id) })), [spendingGoals, spendingGoalPeriods]);

  const activeAccounts = accounts.filter(a => !a.isArchived);
  const excludedCurrencies = [...new Set(activeAccounts
    .filter(account => Math.abs(account.balance) > 0.005 && convertAmountToBase(account.balance, account.currency, baseCurrency, lots, dbCurrencies) === null)
    .map(account => account.currency))];

  // 1. Cálculos de Homeostasis Mensual (Mes Actual)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

  // Ingresos reales de este mes
  const thisMonthIncomes = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= startOfMonth && d <= endOfMonth && t.type === 'IN' && t.cashflowKind !== 'LOAN_PROCEEDS';
  });
  const totalIngresosMes = thisMonthIncomes.reduce((sum, t) => sum + transactionAmountInBase(t), 0);

  // Instancias de este mes
  const thisMonthInstances = anchors.filter(a => {
    if (a.isTemplate !== false) return false;
    const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate + 'T12:00:00');
    return d >= startOfMonth && d <= endOfMonth;
  });

  const totalAggregatedBalance = activeAccounts.reduce((sum, a) => sum + getAccountBalanceInBase(a), 0);
  const totalAllocatedToMacetas = macetaAllocations.reduce((sum, a) => sum + convertAmountToBase(a.amount, a.currency, baseCurrency, lots, dbCurrencies), 0);

  // Gastos Recurrentes de este mes
  const thisMonthGastos = thisMonthInstances.filter(a => a.pillar === 'NEED' || a.pillar === 'WANT');
  const planifiedGastos = thisMonthGastos.reduce((sum, a) => sum + convertAmountToBase(a.amount, a.currency, baseCurrency, lots, dbCurrencies), 0);
  const paidGastos = thisMonthGastos.filter(a => a.status === 'PAID').reduce((sum, a) => sum + convertAmountToBase(a.amount, a.currency, baseCurrency, lots, dbCurrencies), 0);
  const pendingGastos = thisMonthGastos.filter(a => a.status !== 'PAID').reduce((sum, a) => sum + convertAmountToBase(a.amount, a.currency, baseCurrency, lots, dbCurrencies), 0);

  // Aportes a Metas de este mes
  const thisMonthAhorros = thisMonthInstances.filter(a => a.pillar === 'SAVE');
  const planifiedAhorros = thisMonthAhorros.reduce((sum, a) => sum + convertAmountToBase(a.amount, a.currency, baseCurrency, lots, dbCurrencies), 0);
  const paidAhorros = thisMonthAhorros.reduce((sum, a) => sum + (convertAmountToBase(Number(a.contributedAmount) || (a.status === 'PAID' ? a.amount : 0), a.currency, baseCurrency, lots, dbCurrencies) || 0), 0);
  const pendingAhorros = thisMonthAhorros
    .filter(a => !['EXPIRED', 'PARTIAL_EXPIRED'].includes(a.status))
    .reduce((sum, a) => sum + (convertAmountToBase(Math.max(0, Number(a.amount) - (Number(a.contributedAmount) || 0)), a.currency, baseCurrency, lots, dbCurrencies) || 0), 0);

  const totalComprometido = planifiedGastos + planifiedAhorros;

  // Disponible Libre Real
  const disponibleLibreReal = Math.max(0, totalAggregatedBalance - totalAllocatedToMacetas - pendingGastos - pendingAhorros);

  // Filtrar plantillas activas vs pausadas
  const templates = anchors.filter(a => a.isTemplate === true);
  const templatesActive = templates.filter(a => !a.isArchived);
  const templatesPaused = templates.filter(a => a.isArchived);

  const fmt = (n, currencyCode = baseCurrency) => {
    return formatCurrency(n, currencyCode, dbCurrencies);
  };

  const getAccountName = (id) => accounts.find(a => a.id === id)?.name || 'Ninguna';
  const getTag = (id, kind = 'EXPENSE') => tags.find(t => t.id === id && (t.kind || 'EXPENSE') === kind) || null;

  const handleCreateAnchor = async (data) => {
    try {
      let currency = baseCurrency;
      if (data.pillar === 'SAVE') {
        const targetMaceta = macetas.find(m => m.id === data.macetaId);
        if (targetMaceta) currency = targetMaceta.currency;
      } else {
        const selectedAcc = accounts.find(a => a.id === data.accountId);
        if (selectedAcc) currency = selectedAcc.currency;
      }

      await addAnchorTemplateWithCurrentInstances(db, {
        name: data.name,
        type: 'FIXED',
        amount: data.amount,
        currency,
        accountId: data.accountId || null,
        macetaId: data.macetaId || null,
        nextDueDate: data.nextDueDate || new Date().toISOString().slice(0, 10),
        status: 'PENDING',
        pillar: data.pillar,
        tagId: data.tagId || null,
        frequencyInterval: data.frequencyInterval,
        frequencyUnit: data.frequencyUnit,
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
      const remaining = Math.max(0, Number(anchor.amount) - (Number(anchor.contributedAmount) || 0));
      setSaveContributionAmount(remaining.toString());
      setTransAmountReceived(remaining.toString());
      setTransExchangeRate('1.00');
      return;
    }

    setPayingGeneralAnchor(anchor);
    setGeneralPayAccountId(anchor.accountId ? anchor.accountId.toString() : (activeAccounts[0]?.id.toString() || ''));
    setGeneralPayDate('');
  };

  const handleConfirmGeneralPay = async (e) => {
    e.preventDefault();
    if (!payingGeneralAnchor) return;
    const resolvedAccountId = parseInt(generalPayAccountId);
    const account = accounts.find(a => a.id === resolvedAccountId);
    if (!account) { alert('Cuenta no encontrada'); return; }
    if (!generalPayDate) { alert('Selecciona la fecha en que realizaste el pago.'); return; }
    const paidAt = new Date(`${generalPayDate}T12:00:00`);
    const paymentCurrency = payingGeneralAnchor.currency || account.currency;
    if (paymentCurrency !== account.currency) { alert('El gasto y la cuenta usan monedas distintas. Registra primero la conversión.'); return; }

    try {
      await db.transaction('rw', [db.accounts, db.transactions, db.anchors, db.lots], async () => {
        let baseAmount = convertAmountToBase(payingGeneralAnchor.amount, paymentCurrency, baseCurrency, [], dbCurrencies);
        let transactionBaseCurrency = baseAmount === null ? null : baseCurrency;
        let lotConsumption = null;
        if (account.currency === lotCurrency) {
          const consumed = await consumeCurrencyLots(db, {
            accountId: resolvedAccountId,
            currency: lotCurrency,
            amount: payingGeneralAnchor.amount,
          });
          baseAmount = consumed.baseAmount;
          transactionBaseCurrency = consumed.baseCurrency;
          lotConsumption = stringifyLotConsumption(consumed.consumptions);
        }
        await db.transactions.add({
          date: paidAt,
          type: 'OUT',
          amount: payingGeneralAnchor.amount,
          currency: paymentCurrency,
          accountId: resolvedAccountId,
          tagId: payingGeneralAnchor.tagId || null,
          pillar: payingGeneralAnchor.pillar,
          incomeSourceId: null,
          anchorId: payingGeneralAnchor.id,
          description: `Ancla: ${payingGeneralAnchor.name}`,
          baseAmount,
          baseCurrency: transactionBaseCurrency,
          lotConsumption,
        });

        await db.accounts.update(resolvedAccountId, { balance: account.balance - payingGeneralAnchor.amount });
        await db.anchors.update(payingGeneralAnchor.id, { status: 'PAID', paidAt });
      });

      setPayingGeneralAnchor(null);
    } catch (err) {
      alert(err.message || 'Error al registrar el pago del gasto programado.');
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
      if (account.currency !== maceta.currency) {
        setSavePayError(`La cuenta debe estar en ${maceta.currency}.`);
        return;
      }

      const amount = parseFloat(saveContributionAmount);
      const remaining = Math.max(0, Number(payingSaveAnchor.amount) - (Number(payingSaveAnchor.contributedAmount) || 0));
      if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.001) {
        setSavePayError(`El aporte debe estar entre 0 y ${remaining.toFixed(2)} ${payingSaveAnchor.currency}.`);
        return;
      }
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
          currency: maceta.currency || baseCurrency,
          locked: false
        });
      }

      const totalAllocated = updatedAllocations.reduce((sum, a) => sum + a.amount, 0);

      await db.transaction('rw', [db.maceta_allocations, db.macetas, db.anchors, db.savings_contributions], async () => {
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
        await addSavingsContributionInTransaction(db, {
          macetaId: maceta.id,
          anchorId: payingSaveAnchor.id,
          accountId,
          amount,
          currency: payingSaveAnchor.currency,
          method: 'ALLOCATION',
          date: new Date(),
        });
      });

      setPayingSaveAnchor(null);
    } catch {
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
      const amountSent = parseFloat(saveContributionAmount);
      const amountRec = parseFloat(transAmountReceived);

      if (fromId === toId) {
        setSavePayError('Las cuentas de origen y destino deben ser distintas.');
        return;
      }
      if (!Number.isFinite(amountSent) || amountSent <= 0 || isNaN(amountRec) || amountRec <= 0) {
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

      const maceta = resolveSaveTarget(payingSaveAnchor);
      if (!maceta) {
        setSavePayError('Meta de ahorro asociada no encontrada.');
        return;
      }
      if (toAccount.currency !== maceta.currency) {
        setSavePayError(`La cuenta destino debe estar en ${maceta.currency}.`);
        return;
      }
      const remaining = Math.max(0, Number(payingSaveAnchor.amount) - (Number(payingSaveAnchor.contributedAmount) || 0));
      if (amountRec > remaining + 0.001) {
        setSavePayError(`El aporte recibido excede lo pendiente (${remaining.toFixed(2)} ${maceta.currency}).`);
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
          currency: maceta.currency || baseCurrency,
          locked: false
        });
      }

      const totalAllocated = updatedAllocations.reduce((sum, a) => sum + a.amount, 0);

      await db.transaction('rw', [db.accounts, db.transactions, db.maceta_allocations, db.macetas, db.anchors, db.lots, db.savings_contributions], async () => {
        let transferConsumptions = [];
        let transferBaseAmount = convertAmountToBase(amountSent, fromAccount.currency, baseCurrency, [], dbCurrencies);
        let transferBaseCurrency = transferBaseAmount === null ? null : baseCurrency;
        if (fromAccount.currency === lotCurrency) {
          if (toAccount.currency === lotCurrency && Math.abs(amountSent - amountRec) > 0.005) {
            throw new Error(`Una transferencia entre cuentas ${lotCurrency} debe conservar el mismo monto.`);
          }
          const consumed = await consumeCurrencyLots(db, { accountId: fromId, currency: lotCurrency, amount: amountSent });
          transferConsumptions = consumed.consumptions;
          transferBaseAmount = consumed.baseAmount;
          transferBaseCurrency = consumed.baseCurrency;
        }

        if (toAccount.currency === lotCurrency) {
          if (fromAccount.currency === lotCurrency) {
            for (const consumption of transferConsumptions) {
              await createCurrencyLot(db, {
                transactionId: transferId,
                accountId: toId,
                currency: lotCurrency,
                amount: consumption.amountConsumed,
                costCurrency: consumption.costCurrency,
                costAmount: consumption.costConsumed,
                date: new Date(),
                sourceType: 'SAVINGS_TRANSFER',
              });
            }
          } else {
            if (transferBaseAmount === null || transferBaseAmount <= 0) {
              throw new Error(`La divisa ${fromAccount.currency} no tiene una conversión válida a ${baseCurrency}.`);
            }
            await createCurrencyLot(db, {
              transactionId: transferId,
              accountId: toId,
              currency: lotCurrency,
              amount: amountRec,
              costCurrency: baseCurrency,
              costAmount: transferBaseAmount,
              date: new Date(),
              sourceType: 'SAVINGS_TRANSFER',
            });
          }
        }

        await db.accounts.update(fromId, { balance: fromAccount.balance - amountSent });
        await db.accounts.update(toId, { balance: toAccount.balance + amountRec });
        const targetBaseAmount = toAccount.currency === lotCurrency
          ? transferBaseAmount
          : convertAmountToBase(amountRec, toAccount.currency, baseCurrency, [], dbCurrencies);
        await db.transactions.add({
          date: new Date(),
          type: 'TRANSFER_OUT',
          amount: amountSent,
          currency: fromAccount.currency,
          accountId: fromId,
          description: `Transferencia ahorro meta: ${maceta.name}`,
          transferId,
          baseAmount: transferBaseAmount,
          baseCurrency: transferBaseCurrency,
          lotConsumption: stringifyLotConsumption(transferConsumptions),
        });
        const incomingTransactionId = await db.transactions.add({
          date: new Date(),
          type: 'TRANSFER_IN',
          amount: amountRec,
          currency: toAccount.currency,
          accountId: toId,
          description: `Ahorro asignado meta: ${maceta.name}`,
          transferId,
          baseAmount: targetBaseAmount,
          baseCurrency: targetBaseAmount === null ? null : baseCurrency,
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
        await addSavingsContributionInTransaction(db, {
          macetaId: maceta.id,
          anchorId: payingSaveAnchor.id,
          transactionId: incomingTransactionId,
          accountId: toId,
          amount: amountRec,
          currency: maceta.currency,
          method: 'TRANSFER',
          date: new Date(),
        });
      });

      setPayingSaveAnchor(null);
    } catch (err) {
      setSavePayError(err.message || 'Error al procesar la transferencia del ahorro.');
    }
  };

  const handleEditClick = (anchor) => {
    setEditingAnchor(anchor);
    setShowEditModal(true);
  };

  const handleUpdateAnchor = async (data) => {
    if (!editingAnchor) return;
    try {
      let currency = baseCurrency;
      if (data.pillar === 'SAVE') {
        const targetMaceta = macetas.find(m => m.id === data.macetaId);
        if (targetMaceta) currency = targetMaceta.currency;
      } else {
        const selectedAcc = accounts.find(a => a.id === data.accountId);
        if (selectedAcc) currency = selectedAcc.currency;
      }

      // 1. Actualizar plantilla
      const normalizedTagId = data.pillar === 'SAVE' ? null : (data.tagId || null);
      await db.anchors.update(editingAnchor.id, {
        name: data.name,
        amount: data.amount,
        currency,
        pillar: data.pillar,
        accountId: data.accountId || null,
        macetaId: data.macetaId || null,
        tagId: normalizedTagId,
        nextDueDate: data.nextDueDate || null,
        frequencyInterval: data.frequencyInterval,
        frequencyUnit: data.frequencyUnit,
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

      const childInstances = anchors.filter(a =>
        a.isTemplate === false &&
        a.parentAnchorId === editingAnchor.id
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
            macetaId: data.macetaId || null,
            tagId: normalizedTagId
          });
        }
      }

      for (const inst of childInstances) {
        await db.anchors.update(inst.id, { tagId: normalizedTagId });
      }

      const relatedAnchorIds = [editingAnchor.id, ...childInstances.map(inst => inst.id)];
      const relatedTransactions = await db.transactions.where('anchorId').anyOf(relatedAnchorIds).toArray();
      for (const tx of relatedTransactions) {
        if (tx.type === 'OUT') await db.transactions.update(tx.id, { tagId: normalizedTagId, pillar: data.pillar });
      }
      await syncAnchorTemplateCurrentInstances(db, editingAnchor.id);

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
    const nextDate = src.nextDueDate
      ? (typeof src.nextDueDate === 'string'
        ? src.nextDueDate.slice(5, 10).replace('-', '/')
        : new Date(src.nextDueDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }))
      : '--';
    const isMenuOpen = openAnchorMenuId === src.id;
    const category = getTag(src.tagId, 'EXPENSE');

    return (
      <div key={src.id} className="relative py-4 border-b border-[rgba(26,26,26,0.10)]" id={`anchor-row-${src.id}`} style={{ opacity: src.isArchived ? 0.5 : 1 }}>
        <div className="flex items-start justify-between gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
            <CategoryIcon iconKey={category?.iconKey} size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[15px] font-[600] text-noria-text truncate">{src.name}</span>
              <PillarTag pillar={src.pillar} />
              <CategoryTag name={category?.name} size="xs" />
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.09em] text-noria-muted leading-relaxed">
              <span>{formatAmountWithSymbol(src.amount, src.currency, dbCurrencies)}</span>
              <span> · {getFrequencyLabel(src.frequencyInterval, src.frequencyUnit)}</span>
              {src.accountId && <span> · De: {getAccountName(src.accountId)}</span>}
              <span> · Inicio/Prox: {nextDate}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpenAnchorMenuId(isMenuOpen ? null : src.id)}
            className="w-8 h-8 shrink-0 border border-transparent flex items-center justify-center text-noria-muted hover:text-noria-text focus:outline-none"
            title="Acciones"
          >
            <MoreHorizontal size={17} strokeWidth={1.8} />
          </button>
        </div>

        {isMenuOpen && (
          <div className="absolute right-0 top-11 z-20 w-40 border border-[#1A1A1A] bg-[#F5F2ED] font-mono text-[10px] uppercase tracking-[0.08em] shadow-none">
            <button
              type="button"
              onClick={() => { setOpenAnchorMenuId(null); handleEditClick(src); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-noria-text/5 focus:outline-none"
            >
              <Pencil size={12} strokeWidth={1.5} />
              <span>Editar</span>
            </button>
            <button
              type="button"
              onClick={() => { setOpenAnchorMenuId(null); handleToggleArchiveAnchor(src); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-noria-text/5 focus:outline-none"
            >
              {src.isArchived ? <ArchiveRestore size={12} strokeWidth={1.5} /> : <Archive size={12} strokeWidth={1.5} />}
              <span>{src.isArchived ? 'Reactivar' : 'Pausar'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setOpenAnchorMenuId(null); handleDeleteAnchorMaster(src); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#9F2F2D]/10 focus:outline-none"
              style={{ color: '#9F2F2D' }}
            >
              <Trash2 size={12} strokeWidth={1.5} />
              <span>Eliminar</span>
            </button>
          </div>
        )}
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



  const fixedExpenseTemplates = (anchor) => anchor.pillar === 'NEED' || anchor.pillar === 'WANT';
  const filteredActive = templatesActive.filter(fixedExpenseTemplates);
  const filteredPaused = templatesPaused.filter(fixedExpenseTemplates);
  const savingsTemplates = (anchor) => anchor.pillar === 'SAVE';
  const savingsActive = templatesActive.filter(savingsTemplates);
  const savingsPaused = templatesPaused.filter(savingsTemplates);

  const dateToInputValue = (date) => date.toISOString().slice(0, 10);

  const setMonthShortcut = () => {
    const [start, end] = getShortcutRange('month');
    setProjectionStart(start);
    setProjectionEnd(end);
  };

  const setRangeShortcut = (days) => {
    const [start, end] = getShortcutRange(days.toString());
    setProjectionStart(start);
    setProjectionEnd(end);
  };

  const setQuarterShortcut = () => {
    const [start, end] = getShortcutRange('quarter');
    setProjectionStart(start);
    setProjectionEnd(end);
  };

  const setYearShortcut = () => {
    const [start, end] = getShortcutRange('year');
    setProjectionStart(start);
    setProjectionEnd(end);
  };

  const getShortcutRange = (key) => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);

    if (key === 'month') {
      return [
        dateToInputValue(new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0)),
        dateToInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0, 12, 0, 0))
      ];
    }
    if (key === 'year') {
      return [
        dateToInputValue(now),
        dateToInputValue(new Date(now.getFullYear(), 11, 31, 12, 0, 0))
      ];
    }
    if (key === 'quarter') {
      return [
        dateToInputValue(now),
        dateToInputValue(new Date(now.getFullYear(), now.getMonth() + 3, 0, 12, 0, 0))
      ];
    }

    const days = Number(key);
    const end = new Date(now);
    end.setDate(now.getDate() + days);
    end.setHours(12, 0, 0, 0);
    return [dateToInputValue(now), dateToInputValue(end)];
  };

  const getActiveShortcut = () => {
    const shortcuts = ['month', '7', '30', 'quarter', 'year'];
    return shortcuts.find((key) => {
      const [start, end] = getShortcutRange(key);
      return projectionStart === start && projectionEnd === end;
    });
  };

  const activeShortcut = getActiveShortcut();

  const shortcutButtonClass = (key) => [
    'py-1.5 text-[9px] font-mono font-[700] uppercase tracking-[0.12em] leading-none border-b-2 bg-transparent focus:outline-none',
    activeShortcut === key ? 'text-noria-text border-[#647C78]' : 'text-noria-muted border-transparent'
  ].join(' ');

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

  // Calculos para resumen superior
  const totalVariableBudget = tags
    .filter(t => t.kind === 'EXPENSE' && t.monthlyBudget > 0)
    .reduce((sum, t) => sum + t.monthlyBudget, 0);

  const totalPresupuestoGeneral = totalComprometido + totalVariableBudget;

  const thisMonthTransactions = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= startOfMonth && d <= endOfMonth;
  });

  const totalExpensesThisMonth = thisMonthTransactions
    .filter(isPersonalExpenseTransaction)
    .reduce((sum, t) => sum + transactionAmountInBase(t), 0);

  const totalEjecutadoReal = totalExpensesThisMonth + paidAhorros;

  const porcentajeEjecutado = totalPresupuestoGeneral > 0
    ? Math.round((totalEjecutadoReal / totalPresupuestoGeneral) * 100)
    : 0;

  const getTransactionPillar = (tx) => {
    if (tx.pillar) return tx.pillar;
    if (tx.tagId) {
      const tag = tags.find(tg => tg.id === tx.tagId);
      if (tag) return tag.pillar;
    }
    return null;
  };

  const spentNeeds = thisMonthTransactions
    .filter(t => isPersonalExpenseTransaction(t) && getTransactionPillar(t) === 'NEED')
    .reduce((sum, t) => sum + transactionAmountInBase(t), 0);

  const spentWants = thisMonthTransactions
    .filter(t => isPersonalExpenseTransaction(t) && getTransactionPillar(t) === 'WANT')
    .reduce((sum, t) => sum + transactionAmountInBase(t), 0);

  const spentSavings = paidAhorros;

  const budgetNeeds = templatesActive
    .filter(a => a.pillar === 'NEED')
    .reduce((sum, a) => sum + convertAmountToBase(a.amount, a.currency, baseCurrency, lots, dbCurrencies), 0) +
    tags.filter(t => t.kind === 'EXPENSE' && t.pillar === 'NEED' && t.monthlyBudget > 0)
    .reduce((sum, t) => sum + t.monthlyBudget, 0);

  const budgetWants = templatesActive
    .filter(a => a.pillar === 'WANT')
    .reduce((sum, a) => sum + convertAmountToBase(a.amount, a.currency, baseCurrency, lots, dbCurrencies), 0) +
    tags.filter(t => t.kind === 'EXPENSE' && t.pillar === 'WANT' && t.monthlyBudget > 0)
    .reduce((sum, t) => sum + t.monthlyBudget, 0);

  const budgetSavings = templatesActive
    .filter(a => a.pillar === 'SAVE')
    .reduce((sum, a) => sum + convertAmountToBase(a.amount, a.currency, baseCurrency, lots, dbCurrencies), 0);

  const pctNeeds = budgetNeeds > 0 ? Math.round((spentNeeds / budgetNeeds) * 100) : 0;
  const pctWants = budgetWants > 0 ? Math.round((spentWants / budgetWants) * 100) : 0;
  const pctSavings = budgetSavings > 0 ? Math.round((spentSavings / budgetSavings) * 100) : 0;

  const spentByPillar = spentNeeds + spentWants + spentSavings;
  const goalNeeds = monthlyIncome * (pillarPct.NEED / 100);
  const goalWants = monthlyIncome * (pillarPct.WANT / 100);
  const goalSavings = monthlyIncome * (pillarPct.SAVE / 100);
  const homePct = (spent, goal) => goal > 0 ? Math.round((spent / goal) * 100) : null;

  const countNeedsGoal = Math.max(0, Math.min(100, Math.round(Number(pillarPct.NEED) || 0)));
  const countWantsGoal = Math.max(0, Math.min(100 - countNeedsGoal, Math.round(Number(pillarPct.WANT) || 0)));
  const countSavingsGoal = Math.max(0, 100 - countNeedsGoal - countWantsGoal);
  const filledCells = (count, spent, goal) => {
    if (count <= 0 || spent <= 0) return 0;
    if (goal <= 0) return count;
    return Math.min(count, Math.round((spent / goal) * count));
  };
  const spentNeedsLimit = filledCells(countNeedsGoal, spentNeeds, goalNeeds);
  const spentWantsLimit = filledCells(countWantsGoal, spentWants, goalWants);
  const spentSavingsLimit = filledCells(countSavingsGoal, spentSavings, goalSavings);

  const liquidityBase = totalEjecutadoReal + disponibleLibreReal;
  const liquiditySpentPct = liquidityBase > 0 ? (totalEjecutadoReal / liquidityBase) * 100 : 0;
  const budgetExceededAmount = Math.max(0, totalEjecutadoReal - totalPresupuestoGeneral);
  const homeostasisMeta = (spent, goal) => {
    const percentage = homePct(spent, goal);
    if (percentage === null) return spent > 0 ? 'HOME: SIN INGRESO PROMEDIO' : 'HOME: —';
    return `HOME: ${percentage}% DE ${fmt(goal)}`;
  };
  const budgetMeta = (spent, budget, percentage) => {
    if (budget <= 0) return spent > 0 ? 'PRESUP.: SIN PRESUPUESTO' : 'PRESUP.: —';
    return `PRESUP.: ${percentage}% DE ${fmt(budget)}`;
  };

  const gridElements = useMemo(() => {
    const list = [];
    for (let i = 0; i < countNeedsGoal; i++) {
      list.push({ color: '#4F8F58', bg: 'rgba(79,143,88,0.14)', isActive: i < spentNeedsLimit });
    }
    for (let i = 0; i < countWantsGoal; i++) {
      list.push({ color: '#3F7F9C', bg: 'rgba(63,127,156,0.14)', isActive: i < spentWantsLimit });
    }
    for (let i = 0; i < countSavingsGoal; i++) {
      list.push({ color: '#C58A14', bg: 'rgba(197,138,20,0.14)', isActive: i < spentSavingsLimit });
    }
    return list;
  }, [countNeedsGoal, countWantsGoal, countSavingsGoal, spentNeedsLimit, spentWantsLimit, spentSavingsLimit]);

  const SummaryCard = ({ label, value, meta, rows, children }) => (
    <div className="border-2 border-[#1A1A1A] p-4 bg-transparent text-noria-text">
      <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.16em] mb-1" style={{ color: '#647C78' }}>
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <p className="font-sans text-[26px] font-[700] leading-none tracking-normal">{value}</p>
        {meta && <span className="font-mono text-[12px] font-[700] text-noria-muted">{meta}</span>}
      </div>
      {rows && (
        <div className="mt-4 space-y-1 font-mono text-[11px]">
          {rows.map(([rowLabel, rowValue]) => (
            <div key={rowLabel} className="flex justify-between gap-3">
              <span className="uppercase">{rowLabel}</span>
              <span>{rowValue}</span>
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );

  return (
    <div className="min-h-screen pb-32 pt-16" style={{ background: '#F5F2ED' }}>
      <div className="w-full max-w-md mx-auto px-6">
        <Header title="Línea de Flotación" />

        {excludedCurrencies.length > 0 && (
          <p className="mt-4 border border-[#B8860B] p-3 text-[10px] leading-relaxed text-[#8A6508]">
            No incluidos en los totales de {baseCurrency}: {excludedCurrencies.join(', ')}. Se muestran por separado porque no tienen paridad ni seguimiento por lotes.
          </p>
        )}

        <section className="py-4" id="homeostasis-summary-section">
          <div className="border-2 border-[#1A1A1A] p-4 bg-transparent text-noria-text font-mono text-[11px] leading-relaxed uppercase tracking-wider space-y-3">
            {/* Header Row */}
            <div className="grid grid-cols-2 gap-4 pb-3 border-b-2 border-[#1A1A1A]">
              <div>
                <span className="text-[9px] font-mono font-bold tracking-[0.14em] text-noria-muted block">INGRESOS</span>
                <p className="text-[17px] font-sans font-bold leading-tight mt-0.5">{fmt(totalIngresosMes)} {baseCurrency}</p>
              </div>
              <div className="border-l border-[#1A1A1A]/20 pl-4">
                <span className="text-[9px] font-mono font-bold tracking-[0.14em] text-noria-muted block">PRESUPUESTO TOTAL</span>
                <p className="text-[17px] font-sans font-bold leading-tight mt-0.5">{fmt(totalPresupuestoGeneral)} {baseCurrency}</p>
                <p className={`mt-1 text-[8px] font-mono font-bold leading-tight ${budgetExceededAmount > 0 ? 'text-[#9F2F2D]' : 'text-noria-muted'}`}>
                  {totalPresupuestoGeneral > 0
                    ? budgetExceededAmount > 0
                      ? `EXCEDIDO ${fmt(budgetExceededAmount)} · ${porcentajeEjecutado}%`
                      : `EJECUTADO ${porcentajeEjecutado}%`
                    : totalEjecutadoReal > 0 ? 'SIN PRESUPUESTO' : 'SIN PRESUPUESTO REGISTRADO'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-[8px] font-mono font-bold tracking-[0.12em] text-noria-muted">HOMEOSTASIS · INGRESO PROMEDIO {fmt(monthlyIncome)} {baseCurrency}</p>
              {monthlyIncome <= 0 && spentByPillar > 0 && (
                <p className="mt-1 border-l-2 border-[#B8860B] pl-2 text-[8px] normal-case tracking-normal text-[#8A6508]">Configura un ingreso promedio para medir el avance; el bloque con gasto se muestra completo.</p>
              )}
            </div>

            {/* Matrix & Side Stats */}
            <div className="grid grid-cols-12 gap-4 pt-1">
              {/* Left Column: 10x10 Matrix */}
              <div className="col-span-6 flex items-center justify-center">
                <div className="grid grid-cols-10 gap-0.5 w-full aspect-square p-0.5 bg-transparent">
                  {gridElements.map((el, idx) => (
                    <span
                      key={idx}
                      className="w-full aspect-square border transition-all duration-300"
                      style={el.isActive
                        ? { background: el.color, borderColor: el.color }
                        : { background: el.bg, borderColor: `${el.color}55` }}
                    />
                  ))}
                </div>
              </div>

              {/* Right Column: Detailed Pillar Stats */}
              <div className="col-span-6 flex flex-col justify-between py-0.5 space-y-2">
                <div>
                  <span className="text-[9px] font-mono font-bold tracking-[0.12em] text-noria-muted block leading-none">NECESIDADES</span>
                  <p className="text-[13px] font-sans font-bold leading-tight mt-0.5">{fmt(spentNeeds)} {baseCurrency}</p>
                  <p className="text-[7px] font-mono text-noria-muted leading-tight mt-0.5">{homeostasisMeta(spentNeeds, goalNeeds)}</p>
                  <p className="text-[7px] font-mono text-noria-muted leading-tight">{budgetMeta(spentNeeds, budgetNeeds, pctNeeds)}</p>
                </div>
                <div>
                  <span className="text-[9px] font-mono font-bold tracking-[0.12em] text-noria-muted block leading-none">DESEOS</span>
                  <p className="text-[13px] font-sans font-bold leading-tight mt-0.5">{fmt(spentWants)} {baseCurrency}</p>
                  <p className="text-[7px] font-mono text-noria-muted leading-tight mt-0.5">{homeostasisMeta(spentWants, goalWants)}</p>
                  <p className="text-[7px] font-mono text-noria-muted leading-tight">{budgetMeta(spentWants, budgetWants, pctWants)}</p>
                </div>
                <div>
                  <span className="text-[9px] font-mono font-bold tracking-[0.12em] text-noria-muted block leading-none">AHORRO</span>
                  <p className="text-[13px] font-sans font-bold leading-tight mt-0.5">{fmt(spentSavings)} {baseCurrency}</p>
                  <p className="text-[7px] font-mono text-noria-muted leading-tight mt-0.5">{homeostasisMeta(spentSavings, goalSavings)}</p>
                  <p className="text-[7px] font-mono text-noria-muted leading-tight">{budgetMeta(spentSavings, budgetSavings, pctSavings)}</p>
                </div>
              </div>
            </div>

            {/* Bottom Row */}
            <div className="border-t-2 border-[#1A1A1A] pt-3 grid grid-cols-12 gap-4 items-center">
              <div className="col-span-7">
                <span className="text-[9px] font-mono font-bold tracking-[0.12em] text-noria-muted block leading-none">GASTADO</span>
                <p className="text-[12px] font-sans font-bold leading-tight mt-0.5">{fmt(totalEjecutadoReal)} {baseCurrency} ({liquiditySpentPct.toLocaleString('es-VE', { maximumFractionDigits: 2 })}%)</p>
                <div className="grid grid-cols-10 gap-0.5 w-full h-2.5 mt-1.5 bg-transparent">
                  {Array.from({ length: 10 }).map((_, idx) => {
                    const isActive = idx < Math.round((Math.min(100, liquiditySpentPct) / 100) * 10);
                    return (
                      <span
                        key={idx}
                        className={`h-full transition-all duration-300 ${
                          isActive
                            ? 'border border-[#647C78]'
                            : 'border border-[#1A1A1A]/15 bg-transparent'
                        }`}
                        style={isActive ? { background: '#647C78' } : {}}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="col-span-5 border-l border-[#1A1A1A]/20 pl-4 text-right">
                <span className="text-[9px] font-mono font-bold tracking-[0.12em] text-noria-muted block leading-none">DISPONIBLE</span>
                <p className="text-[15px] font-sans font-bold leading-tight mt-0.5 text-[#4F8F58]">{fmt(disponibleLibreReal)}</p>
                <p className="text-[9px] font-mono font-bold text-noria-text leading-none mt-0.5">{baseCurrency}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Calendario de pagos */}
        <section className="py-0" id="projections-section">
          <div className="flex items-center justify-between py-3.5 border-b border-[#1A1A1A]">
            <button
              type="button"
              onClick={() => setIsPaymentCalendarOpen(prev => !prev)}
              className="flex items-center space-x-2 text-left focus:outline-none"
            >
              {isPaymentCalendarOpen ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
              <h4 className="text-[17px] font-[600] text-noria-text leading-tight">Calendario de pagos</h4>
            </button>
          </div>

          {isPaymentCalendarOpen && (
            <div className="pt-5 pb-4 animate-fade-in">
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-mono font-[700] uppercase tracking-[0.14em] text-noria-muted block mb-1">Desde</label>
                    <input
                      type="date"
                      value={projectionStart}
                      onChange={(e) => setProjectionStart(e.target.value)}
                      className="muji-input w-full font-mono text-[11px] px-0 py-1.5 border-0 border-b border-[rgba(26,26,26,0.35)] bg-transparent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-mono font-[700] uppercase tracking-[0.14em] text-noria-muted block mb-1">Hasta</label>
                    <input
                      type="date"
                      value={projectionEnd}
                      onChange={(e) => setProjectionEnd(e.target.value)}
                      className="muji-input w-full font-mono text-[11px] px-0 py-1.5 border-0 border-b border-[rgba(26,26,26,0.35)] bg-transparent focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2 pt-1">
                  <button type="button" onClick={setMonthShortcut} className={shortcutButtonClass('month')}>MES</button>
                  <button type="button" onClick={() => setRangeShortcut(7)} className={shortcutButtonClass('7')}>7 D</button>
                  <button type="button" onClick={() => setRangeShortcut(30)} className={shortcutButtonClass('30')}>30 D</button>
                  <button type="button" onClick={setQuarterShortcut} className={shortcutButtonClass('quarter')}>90 D</button>
                  <button type="button" onClick={setYearShortcut} className={shortcutButtonClass('year')}>AÑO</button>
                </div>
              </div>

              {projectedInstances.length === 0 ? (
            <p className="text-[12px] text-noria-muted font-mono text-center py-4">Sin pagos programados para este período</p>
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
                          <div className={`flex min-w-0 flex-1 items-center gap-2 ${isPaid ? 'line-through opacity-40' : ''}`}>
                            <CategoryIcon iconKey={getTag(inst.tagId, 'EXPENSE')?.iconKey} size={12} className="shrink-0" />
                            <span className="text-[11px] truncate">
                              {connector} {inst.name.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 pl-2 shrink-0">
                            <span className="text-[11px]">{formatAmountWithSymbol(inst.amount, inst.currency, dbCurrencies)}</span>
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
            </div>
          )}
        </section>

        <section className="py-0" id="templates-section">
          <div className="flex items-center justify-between py-3.5 border-b border-[#1A1A1A]">
            <button
              type="button"
              onClick={() => setIsFixedExpensesOpen(prev => !prev)}
              className="flex items-center space-x-2 text-left focus:outline-none"
            >
              {isFixedExpensesOpen ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
              <h4 className="text-[17px] font-[600] text-noria-text leading-tight">Gastos programados</h4>
            </button>

            <button
              type="button"
              onClick={() => { setAddAllowedPillars(['NEED', 'WANT']); setShowAddModal(true); }}
              className="flex items-center space-x-1 focus:outline-none font-mono text-[10px] font-[700] uppercase tracking-[0.08em]"
              style={{ color: '#647C78' }}
            >
              <Plus size={12} strokeWidth={2} />
              <span>Añadir</span>
            </button>
          </div>

          {isFixedExpensesOpen && (
            <div className="pt-4 pb-4 animate-fade-in">
              {filteredActive.length === 0 ? (
                <div className="flex flex-col items-center py-8 space-y-2 border border-[rgba(26,26,26,0.18)]">
                  <p className="text-[12px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin gastos programados</p>
                </div>
              ) : (
                <div className="bg-transparent">
                  {filteredActive.map(renderAnchorRow)}
                </div>
              )}

              {filteredPaused.length > 0 && (
                <div className="pt-4 mt-4 border-t border-[rgba(26,26,26,0.12)]">
                  <button
                    type="button"
                    onClick={() => setShowArchived(!showArchived)}
                    className="w-full flex justify-between items-center py-1 focus:outline-none text-[10px] font-mono font-[700] uppercase tracking-[0.1em] text-noria-muted"
                  >
                    <span>Pausados ({filteredPaused.length})</span>
                    <span>{showArchived ? 'Ocultar' : 'Ver'}</span>
                  </button>
                  {showArchived && (
                    <div className="mt-2 animate-fade-in">
                      {filteredPaused.map(renderAnchorRow)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="py-0" id="spending-goals-section" aria-labelledby="spending-goals-heading">
          <div className="flex items-center justify-between py-3.5 border-b border-[#1A1A1A]">
            <button
              type="button"
              onClick={() => setIsSpendingGoalsOpen(prev => !prev)}
              className="flex items-center space-x-2 text-left focus:outline-none"
            >
              {isSpendingGoalsOpen ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
              <h4 id="spending-goals-heading" className="text-[17px] font-[600] text-noria-text leading-tight">Objetivos de gasto y donaciones</h4>
            </button>
            <button
              type="button"
              onClick={() => navigate('/goals?new=1')}
              className="flex items-center space-x-1 focus:outline-none font-mono text-[10px] font-[700] uppercase tracking-[0.08em]"
              style={{ color: '#647C78' }}
            >
              <Plus size={12} strokeWidth={2} />
              <span>Añadir</span>
            </button>
          </div>

          {isSpendingGoalsOpen && (
            <div className="pt-4 pb-4 animate-fade-in">
              {activeSpendingGoals.length === 0 ? (
                <div className="flex flex-col items-center px-5 py-8 space-y-2 border border-[rgba(26,26,26,0.18)] text-center">
                  <p className="text-[12px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin objetivos de gasto activos</p>
                  <p className="max-w-xs text-[10px] leading-relaxed text-noria-muted">
                    Programa una donación u otro gasto flexible; el período puede cerrar con lo que hayas podido aportar.
                  </p>
                </div>
              ) : (
                <div className="bg-transparent">
                  {activeSpendingGoals.map(goal => {
                    const progress = Number(goal.currentPeriod?.progressAmount) || 0;
                    const target = Number(goal.currentPeriod?.targetAmount || goal.targetAmount) || 0;
                    const percentage = target > 0 ? Math.min(100, progress / target * 100) : 0;
                    const category = getTag(goal.defaultTagId, 'EXPENSE');
                    const frequency = goal.isRecurring
                      ? getFrequencyLabel(goal.frequencyInterval, goal.frequencyUnit)
                      : 'objetivo único';
                    return (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => navigate('/goals')}
                        className="w-full border-b border-[rgba(26,26,26,0.10)] py-4 text-left focus:outline-none"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
                            <CategoryIcon iconKey={category?.iconKey} size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-[15px] font-[600] text-noria-text">{goal.name}</span>
                              <PillarTag pillar={goal.defaultPillar || category?.pillar || 'WANT'} />
                              <CategoryTag name={category?.name} size="xs" />
                            </div>
                            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.09em] text-noria-muted leading-relaxed">
                              <span>{formatAmountWithSymbol(progress, goal.currency, dbCurrencies)} de {formatAmountWithSymbol(target, goal.currency, dbCurrencies)}</span>
                              <span> · {frequency}</span>
                              <span> · {GOAL_PERIOD_STATUS_LABELS[goal.currentPeriod?.status] || 'Activo'}</span>
                            </div>
                            <div className="mt-2 h-1 border border-[#1A1A1A]/30" aria-label={`Progreso ${percentage.toFixed(0)}%`}>
                              <div className="h-full bg-[#647C78]" style={{ width: `${percentage}%` }} />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => navigate('/goals')}
                className="mt-3 w-full py-1 text-left font-mono text-[10px] font-[700] uppercase tracking-[0.1em] text-noria-muted focus:outline-none"
              >
                Ver todos →
              </button>
            </div>
          )}
        </section>

        <section className="py-0" id="savings-templates-section">
          <div className="flex items-center justify-between py-3.5 border-b border-[#1A1A1A]">
            <button
              type="button"
              onClick={() => setIsSavingsTemplatesOpen(prev => !prev)}
              className="flex items-center space-x-2 text-left focus:outline-none"
            >
              {isSavingsTemplatesOpen ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
              <h4 className="text-[17px] font-[600] text-noria-text leading-tight">Metas de ahorro</h4>
            </button>

            <button
              type="button"
              onClick={() => { setAddAllowedPillars(['SAVE']); setShowAddModal(true); }}
              className="flex items-center space-x-1 focus:outline-none font-mono text-[10px] font-[700] uppercase tracking-[0.08em]"
              style={{ color: '#647C78' }}
            >
              <Plus size={12} strokeWidth={2} />
              <span>Añadir</span>
            </button>
          </div>

          {isSavingsTemplatesOpen && (
            <div className="pt-4 pb-4 animate-fade-in">
              {savingsActive.length === 0 ? (
                <div className="flex flex-col items-center py-8 space-y-2 border border-[rgba(26,26,26,0.18)]">
                  <p className="text-[12px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin aportes de ahorro programados</p>
                </div>
              ) : (
                <div className="bg-transparent">
                  {savingsActive.map(renderAnchorRow)}
                </div>
              )}

              {savingsPaused.length > 0 && (
                <div className="pt-4 mt-4 border-t border-[rgba(26,26,26,0.12)]">
                  <button
                    type="button"
                    onClick={() => setShowArchived(!showArchived)}
                    className="w-full flex justify-between items-center py-1 focus:outline-none text-[10px] font-mono font-[700] uppercase tracking-[0.1em] text-noria-muted"
                  >
                    <span>Pausados ({savingsPaused.length})</span>
                    <span>{showArchived ? 'Ocultar' : 'Ver'}</span>
                  </button>
                  {showArchived && (
                    <div className="mt-2 animate-fade-in">
                      {savingsPaused.map(renderAnchorRow)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] mt-6 mb-4 bg-transparent space-y-2">
          <button
            type="button"
            onClick={() => navigate('/budget/full')}
            className="w-full py-2 flex justify-between items-center hover:bg-black/5 transition-colors focus:outline-none text-left"
          >
            <span>{">>> Ver Presupuesto Detallado"}</span>
            <span className="text-noria-muted">[DETALLE]</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/transactions')}
            className="w-full py-2 flex justify-between items-center hover:bg-black/5 transition-colors focus:outline-none text-left"
          >
            <span>{">>> Ver Historial Transacciones"}</span>
            <span className="text-noria-muted">[HISTORIAL]</span>
          </button>
        </div>
      </div>

      {payingGeneralAnchor && (
        <>
          <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40" onClick={() => setPayingGeneralAnchor(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up"
            style={{ background: '#F5F2ED', borderRadius: '0px', borderTop: '2px solid #1A1A1A', borderLeft: '2px solid #1A1A1A', borderRight: '2px solid #1A1A1A', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)' }}>
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
                    return <option key={acc.id} value={acc.id}>{label} (${fmt(acc.balance, acc.currency)})</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="muji-header block mb-1">Fecha del pago</label>
                <input type="date" value={generalPayDate} onChange={e => setGeneralPayDate(e.target.value)} className="muji-input" required />
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
                    <label className="muji-header block mb-1">Aporte ({payingSaveAnchor.currency})</label>
                    <input type="number" step="0.01" inputMode="decimal" value={saveContributionAmount} onChange={e => setSaveContributionAmount(e.target.value)} className="muji-input" required />
                    <p className="font-mono text-[9px] text-noria-muted mt-1">Acumulado: {Number(payingSaveAnchor.contributedAmount || 0).toFixed(2)} · Meta del período: {Number(payingSaveAnchor.amount).toFixed(2)}</p>
                  </div>
                  <div>
                    <label className="muji-header block mb-1">Cuenta donde se retiene</label>
                    <select value={allocAccountId} onChange={e => setAllocAccountId(e.target.value)} className="muji-input" required>
                      {activeAccounts.map(acc => {
                        const inst = institutions.find(i => i.id === acc.institutionId);
                        const label = inst ? `${inst.name} - ${acc.name} (${acc.type})` : `${acc.name} (${acc.type})`;
                        return <option key={acc.id} value={acc.id}>{label} (${fmt(acc.balance, acc.currency)})</option>;
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
                  <div>
                    <label className="muji-header block mb-1">Monto enviado</label>
                    <input type="number" step="0.01" inputMode="decimal" value={saveContributionAmount} onChange={e => {
                      setSaveContributionAmount(e.target.value);
                      const rate = parseFloat(transAmountReceived) / parseFloat(e.target.value);
                      setTransExchangeRate(Number.isFinite(rate) ? rate.toFixed(4) : '1.00');
                    }} className="muji-input" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="muji-header block mb-1">Origen</label>
                      <select value={transFromAccountId} onChange={e => setTransFromAccountId(e.target.value)} className="muji-input" required>
                        {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency}) · ${fmt(acc.balance, acc.currency)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="muji-header block mb-1">Destino</label>
                      <select value={transToAccountId} onChange={e => setTransToAccountId(e.target.value)} className="muji-input" required>
                        {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency}) · ${fmt(acc.balance, acc.currency)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="muji-header block mb-1">Monto recibido</label>
                    <input type="number" step="0.01" inputMode="decimal" value={transAmountReceived} onChange={e => {
                      setTransAmountReceived(e.target.value);
                      const rate = parseFloat(e.target.value) / parseFloat(saveContributionAmount);
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
        tags={tags}
        baseCurrency={baseCurrency}
        allowedPillars={addAllowedPillars}
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
        tags={tags}
        baseCurrency={baseCurrency}
        allowedPillars={editingAnchor?.pillar === 'SAVE' ? ['SAVE'] : ['NEED', 'WANT']}
      />

      {/* FAB Radial */}
      <FAB />

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}

