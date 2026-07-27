import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import FAB from '../components/FAB.jsx';
import DebtFormSheet from '../components/DebtFormSheet.jsx';
import DebtPaymentSheet from '../components/DebtPaymentSheet.jsx';
import { getCurrencySymbol } from '../utils/format.js';
import {
  Plus, ChevronDown, ChevronUp, MoreHorizontal,
  Pencil, Trash2, Check
} from 'lucide-react';
import { CurrencyAmount } from '../components/CurrencyAmount.jsx';



export default function DebtsScreen() {
  // UI State
  const [expandedDebtId, setExpandedDebtId] = useState(null);
  const [expandedSplitGroupId, setExpandedSplitGroupId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [showSettled, setShowSettled] = useState(false);
  const [showSplits, setShowSplits] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [payingDebt, setPayingDebt] = useState(null);

  // Dexie Queries
  const debts = useLiveQuery(() => db.debts.toArray()) || [];
  const debtPayments = useLiveQuery(() => db.debt_payments.toArray()) || [];
  const thirdParties = useLiveQuery(() => db.third_parties.toArray()) || [];
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const dbCurrencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const baseCurrencyConfig = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const lotCurrencyConfig = useLiveQuery(() => db.app_config.get('lotCurrency'));
  const anchors = useLiveQuery(() => db.anchors.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const instruments = useLiveQuery(() => db.instruments.toArray()) || [];

  const activeAccounts = accounts.filter(a => !a.isArchived);
  const baseCurrency = baseCurrencyConfig?.value || '';
  const lotCurrency = lotCurrencyConfig?.value || '';

  // Compute paidAmount for each debt from debt_payments
  const debtsWithPayments = useMemo(() => {
    return debts.map(debt => {
      const payments = debtPayments.filter(p => p.debtId === debt.id);
      const paidAmount = debt.paidAmount || payments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
      const totalAmount = debt.totalAmount || debt.amount || 0;
      const remaining = Math.max(0, totalAmount - paidAmount);
      const thirdParty = debt.thirdPartyId ? thirdParties.find(tp => tp.id === debt.thirdPartyId) : null;
      const debtAnchors = debt.isRecurring
        ? anchors.filter(a => a.debtId === debt.id).sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0))
        : [];
      const initialMovement = transactions
        .filter(transaction => (
          transaction.debtId === debt.id
          && ['LOAN_PROCEEDS', 'LOAN_DISBURSEMENT'].includes(transaction.cashflowKind)
        ))
        .sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id)[0] || null;

      return {
        ...debt,
        paidAmount,
        remaining,
        totalAmount,
        payments,
        thirdParty,
        debtAnchors,
        initialMovement,
      };
    });
  }, [debts, debtPayments, thirdParties, anchors, transactions]);

  // Group active debts by splitGroupId to represent active splits
  const activeSplits = useMemo(() => {
    const groups = {};
    debtsWithPayments.forEach(d => {
      if (d.splitGroupId && d.status !== 'SETTLED') {
        if (!groups[d.splitGroupId]) {
          const userTx = transactions.find(t => t.splitGroupId === d.splitGroupId && t.type === 'OUT');
          const yourPart = userTx ? userTx.amount : 0;
          
          groups[d.splitGroupId] = {
            id: d.splitGroupId,
            description: d.description ? d.description.replace(' (Split)', '') : 'Gasto Dividido',
            currency: d.currency,
            createdAt: d.createdAt || new Date(),
            totalAmount: 0,
            paidAmount: 0,
            remaining: 0,
            yourPart,
            participants: []
          };
        }
        groups[d.splitGroupId].totalAmount += d.totalAmount;
        groups[d.splitGroupId].paidAmount += d.paidAmount;
        groups[d.splitGroupId].remaining += d.remaining;
        groups[d.splitGroupId].participants.push(d);
      }
    });
    return Object.values(groups).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [debtsWithPayments, transactions]);

  // Split into sections
  const cobrar = debtsWithPayments.filter(d => d.type === 'COBRAR' && d.status !== 'SETTLED');
  const pagar = debtsWithPayments.filter(d => d.type === 'PAGAR' && d.status !== 'SETTLED');
  const settled = debtsWithPayments.filter(d => d.status === 'SETTLED');

  // Summary calculations
  const summary = useMemo(() => {
    const byCurrency = {};

    const addToCurrency = (currency, cobrarAmt, pagarAmt) => {
      if (!byCurrency[currency]) byCurrency[currency] = { cobrar: 0, pagar: 0 };
      byCurrency[currency].cobrar += cobrarAmt;
      byCurrency[currency].pagar += pagarAmt;
    };

    cobrar.forEach(d => addToCurrency(d.currency, d.remaining, 0));
    pagar.forEach(d => addToCurrency(d.currency, 0, d.remaining));

    // Find next due date across all active debts
    let nextDue = null;
    let nextDueDebt = null;
    [...cobrar, ...pagar].forEach(d => {
      // Check anchors for recurring debts
      if (d.isRecurring && d.debtAnchors.length > 0) {
        const pendingAnchors = d.debtAnchors.filter(a => a.status === 'PENDING');
        if (pendingAnchors.length > 0) {
          const anchorDate = new Date(pendingAnchors[0].nextDueDate);
          if (!nextDue || anchorDate < nextDue) {
            nextDue = anchorDate;
            nextDueDebt = d;
          }
        }
      } else if (d.dueDate) {
        const dueDate = new Date(d.dueDate);
        if (!nextDue || dueDate < nextDue) {
          nextDue = dueDate;
          nextDueDebt = d;
        }
      }
    });

    const totalActive = cobrar.length + pagar.length;

    return { byCurrency, nextDue, nextDueDebt, totalActive };
  }, [cobrar, pagar]);

  // Helpers
  const getDebtStatusBadge = (debt) => {
    if (debt.status === 'SETTLED') return { label: 'SALDADA', color: '#4F8F58' };
    if (debt.remaining <= 0) return { label: 'SALDADA', color: '#4F8F58' };

    if (debt.dueDate || (debt.isRecurring && debt.debtAnchors.length > 0)) {
      const now = new Date();
      let checkDate = debt.dueDate ? new Date(debt.dueDate) : null;

      if (debt.isRecurring && debt.debtAnchors.length > 0) {
        const pending = debt.debtAnchors.find(a => a.status === 'PENDING');
        if (pending) checkDate = new Date(pending.nextDueDate);
      }

      if (checkDate) {
        const diffDays = Math.floor((checkDate - now) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return { label: 'VENCIDA', color: '#9F2F2D' };
        if (diffDays <= 3) return { label: 'PRÓXIMA', color: '#C58A14' };
      }
    }

    if (debt.paidAmount > 0) return { label: 'PARCIAL', color: '#647C78' };
    return { label: 'ACTIVA', color: '#1A1A1A' };
  };

  const handleDeleteDebt = async (debtId, name) => {
    const linkedTransactions = await db.transactions.filter(t => t.debtId === debtId).count();
    const linkedPayments = await db.debt_payments.where('debtId').equals(debtId).count();
    if (linkedTransactions > 0 || linkedPayments > 0) {
      alert('Esta deuda tiene movimientos financieros. Para proteger saldos y lotes, no puede eliminarse directamente. Puedes marcarla como saldada o corregir sus pagos.');
      return;
    }
    const confirmed = window.confirm(
      `¿Eliminar la deuda "${name}" y sus cuotas pendientes?`
    );
    if (!confirmed) return;

    try {
      await db.transaction('rw', [db.debts, db.debt_payments, db.anchors], async () => {
        await db.anchors.filter(a => a.debtId === debtId).delete();
        await db.debts.delete(debtId);
      });

      setExpandedDebtId(null);
      setOpenMenuId(null);
    } catch (err) {
      console.error('Error deleting debt:', err);
    }
  };

  const formatDate = (dateVal) => {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  };

  const formatRate = value => Number(value).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

  const getMovementAccountLabel = movement => {
    const account = accounts.find(item => item.id === movement?.accountId);
    if (!account) return 'Cuenta no disponible';

    const institution = institutions.find(item => item.id === account.institutionId);
    const accountLabel = institution && institution.name.toLowerCase() !== account.name.toLowerCase()
      ? `${institution.name} · ${account.name}`
      : account.name;
    const instrument = movement.instrumentId
      ? instruments.find(item => item.id === movement.instrumentId)
      : null;

    return instrument ? `${accountLabel} (${instrument.alias || instrument.type})` : accountLabel;
  };

  // ── Render: Debt Row ──
  const renderDebtRow = (debt) => {
    const isExpanded = expandedDebtId === debt.id;
    const isMenuOpen = openMenuId === debt.id;
    const badge = getDebtStatusBadge(debt);
    const pct = debt.totalAmount > 0 ? Math.min(100, (debt.paidAmount / debt.totalAmount) * 100) : 0;
    const filledBlocks = Math.round(pct / 10);
    const isSplit = !!debt.splitGroupId;
    const nextPendingAnchor = debt.isRecurring
      ? debt.debtAnchors.find(anchor => anchor.status === 'PENDING')
      : null;
    const latestPaymentDate = debt.payments.reduce((latest, payment) => (
      !latest || new Date(payment.date) > new Date(latest) ? payment.date : latest
    ), null);
    const deadline = debt.status === 'SETTLED'
      ? { label: 'Saldada', date: latestPaymentDate || debt.settledDate }
      : nextPendingAnchor
        ? { label: 'Próxima cuota', date: nextPendingAnchor.nextDueDate }
        : { label: 'Vence', date: debt.dueDate };
    const initialMovement = debt.initialMovement;
    const movementBaseAmount = Number(initialMovement?.baseAmount);
    const hasBaseEquivalent = Number.isFinite(movementBaseAmount)
      && movementBaseAmount > 0
      && !!(initialMovement?.baseCurrency || baseCurrency);
    const initialLotRate = initialMovement?.currency === lotCurrency && hasBaseEquivalent
      ? Number(initialMovement.amount) / movementBaseAmount
      : null;

    return (
      <div key={debt.id} className="relative border border-[#1A1A1A] bg-transparent" id={`debt-${debt.id}`}>
        {/* Compact row */}
        <div className="flex items-start gap-3 p-4">
          <button
            type="button"
            onClick={() => setExpandedDebtId(isExpanded ? null : debt.id)}
            className="flex-1 min-w-0 text-left focus:outline-none"
          >
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-[14px] font-[600] text-noria-text truncate">{debt.description}</p>
              {isSplit && (
                <span className="border border-[#647C78] px-1.5 py-0.5 font-mono text-[8px] font-[700] uppercase tracking-[0.1em]" style={{ color: '#647C78' }}>
                  SPLIT
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-noria-muted flex flex-wrap gap-x-3 gap-y-0.5">
              {debt.thirdParty && <span>{debt.thirdParty.name}</span>}
              {debt.isRecurring && (
                <span>
                  {debt.debtAnchors.filter(a => a.status === 'PAID').length}/{debt.numberOfInstallments || debt.debtAnchors.length} cuotas
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-noria-muted flex flex-wrap gap-x-3 gap-y-0.5">
              <span>Creada: {formatDate(debt.createdAt)}</span>
              <span>
                {deadline.date
                  ? `${deadline.label}: ${formatDate(deadline.date)}`
                  : deadline.label === 'Saldada' ? 'Saldada' : 'Sin vencimiento'}
              </span>
            </div>
          </button>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <CurrencyAmount amount={debt.remaining} currencyCode={debt.currency} className="text-[15px] font-[700] text-noria-text tabular-nums" />
            <span
              className="border px-1.5 py-0.5 font-mono text-[8px] font-[700] uppercase tracking-[0.1em]"
              style={{ borderColor: badge.color, color: badge.color }}
            >
              {badge.label}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setExpandedDebtId(isExpanded ? null : debt.id)}
              className="w-7 h-7 flex items-center justify-center text-noria-muted hover:text-noria-text focus:outline-none"
            >
              {isExpanded ? <ChevronUp size={14} strokeWidth={1.8} /> : <ChevronDown size={14} strokeWidth={1.8} />}
            </button>
            <button
              type="button"
              onClick={() => setOpenMenuId(isMenuOpen ? null : debt.id)}
              className="w-7 h-7 flex items-center justify-center text-noria-muted hover:text-noria-text focus:outline-none"
            >
              <MoreHorizontal size={16} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Context menu */}
        {isMenuOpen && (
          <div className="absolute right-4 top-12 z-20 w-40 border border-[#1A1A1A] bg-[#F5F2ED] font-mono text-[10px] uppercase tracking-[0.08em]">
            <button
              type="button"
              onClick={() => { setOpenMenuId(null); setEditingDebt(debt); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-noria-text/5 focus:outline-none"
            >
              <Pencil size={12} strokeWidth={1.5} />
              <span>Editar</span>
            </button>
            {debt.status !== 'SETTLED' && (
              <button
                type="button"
                onClick={() => { setOpenMenuId(null); setPayingDebt({ debt, defaultSettle: true }); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-noria-text/5 focus:outline-none"
              >
                <Check size={12} strokeWidth={1.5} />
                <span>Saldar</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => { setOpenMenuId(null); handleDeleteDebt(debt.id, debt.description); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#9F2F2D]/10 focus:outline-none"
              style={{ color: '#9F2F2D' }}
            >
              <Trash2 size={12} strokeWidth={1.5} />
              <span>Eliminar</span>
            </button>
          </div>
        )}

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-t border-[rgba(26,26,26,0.16)] px-4 pb-4 pt-3 space-y-4 animate-fade-in">
            {/* Debt metadata */}
            <div className="space-y-2">
              <p className="font-mono text-[10px] font-[700] text-noria-text/60 uppercase tracking-[0.14em]">Datos de la deuda</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border border-[rgba(26,26,26,0.16)] p-3 font-mono text-[10px]">
                <div>
                  <dt className="uppercase tracking-[0.08em] text-noria-muted">Tipo</dt>
                  <dd className="mt-0.5 text-[11px] text-noria-text">{debt.type === 'COBRAR' ? 'Por cobrar' : 'Por pagar'}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-[0.08em] text-noria-muted">Moneda contractual</dt>
                  <dd className="mt-0.5 text-[11px] text-noria-text">{debt.currency}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-[0.08em] text-noria-muted">Monto original</dt>
                  <dd className="mt-0.5 text-[11px] text-noria-text"><CurrencyAmount amount={debt.totalAmount} currencyCode={debt.currency} /></dd>
                </div>
                <div>
                  <dt className="uppercase tracking-[0.08em] text-noria-muted">{debt.type === 'COBRAR' ? 'Cobrado' : 'Pagado'}</dt>
                  <dd className="mt-0.5 text-[11px] text-noria-text"><CurrencyAmount amount={debt.paidAmount} currencyCode={debt.currency} /></dd>
                </div>
                <div>
                  <dt className="uppercase tracking-[0.08em] text-noria-muted">Saldo restante</dt>
                  <dd className="mt-0.5 text-[11px] text-noria-text"><CurrencyAmount amount={debt.remaining} currencyCode={debt.currency} /></dd>
                </div>
                <div>
                  <dt className="uppercase tracking-[0.08em] text-noria-muted">Tercero</dt>
                  <dd className="mt-0.5 text-[11px] text-noria-text">{debt.thirdParty?.name || 'Sin tercero'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="uppercase tracking-[0.08em] text-noria-muted">Modalidad</dt>
                  <dd className="mt-0.5 text-[11px] text-noria-text">
                    {debt.isRecurring
                      ? `${debt.numberOfInstallments || debt.debtAnchors.length} cuotas`
                      : 'Pago único'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Initial financial movement */}
            <div className="space-y-2">
              <p className="font-mono text-[10px] font-[700] text-noria-text/60 uppercase tracking-[0.14em]">Movimiento inicial</p>
              {initialMovement ? (
                <div className="border border-[rgba(26,26,26,0.16)] p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.08em] text-noria-text">
                        {initialMovement.cashflowKind === 'LOAN_PROCEEDS' ? 'Dinero recibido' : 'Dinero entregado'}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-noria-muted truncate">
                        {getMovementAccountLabel(initialMovement)}
                      </p>
                    </div>
                    <CurrencyAmount
                      amount={initialMovement.amount}
                      currencyCode={initialMovement.currency}
                      className="font-mono text-[12px] font-[700] text-noria-text tabular-nums shrink-0"
                    />
                  </div>
                  <div className="font-mono text-[10px] text-noria-muted space-y-1">
                    <p>Fecha efectiva: <span className="text-noria-text">{formatDate(initialMovement.date)}</span></p>
                    {hasBaseEquivalent && (
                      <p>
                        Equivalente registrado: <CurrencyAmount amount={movementBaseAmount} currencyCode={initialMovement.baseCurrency || baseCurrency} />
                      </p>
                    )}
                    {Number.isFinite(initialLotRate) && initialLotRate > 0 && (
                      <p>
                        Tasa de valoración registrada: <span className="text-noria-text">{formatRate(initialLotRate)} {lotCurrency} por 1 {initialMovement.baseCurrency || baseCurrency}</span>
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="border border-[rgba(26,26,26,0.16)] p-3 text-[11px] text-noria-muted italic">
                  Solo se registró el compromiso; no hay un movimiento inicial identificable.
                </p>
              )}
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] font-[700] text-noria-text/60 uppercase tracking-[0.14em]">Progreso</p>
                <span className="font-mono text-[11px] font-[700] text-noria-text">{pct.toFixed(0)}%</span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 10 }).map((_, idx) => (
                  <span
                    key={idx}
                    className="h-4 flex-1 border border-[#1A1A1A]"
                    style={{ background: idx < filledBlocks ? '#1A1A1A' : 'transparent' }}
                  />
                ))}
              </div>
              <div className="font-mono text-[11px] text-noria-muted flex items-center justify-between gap-2">
                <span>Pagado: <CurrencyAmount amount={debt.paidAmount} currencyCode={debt.currency} /></span>
                <span>Total: <CurrencyAmount amount={debt.totalAmount} currencyCode={debt.currency} /></span>
              </div>
            </div>

            {/* Installment timeline (for recurring debts) */}
            {debt.isRecurring && debt.debtAnchors.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] font-[700] text-noria-text/60 uppercase tracking-[0.14em]">Cuotas programadas</p>
                <div className="space-y-0">
                  {debt.debtAnchors.map((anchor, idx) => {
                    const isPaid = anchor.status === 'PAID';
                    const isPending = anchor.status === 'PENDING';
                    const anchorDate = new Date(anchor.nextDueDate);
                    const isOverdue = isPending && anchorDate < new Date();
                    const prefix = idx === debt.debtAnchors.length - 1 ? 'L─ ' : '├─ ';
                    const cuotaName = anchor.installmentNumber === 0 ? 'Inicial' : `Cuota ${anchor.installmentNumber || idx + 1}`;

                    return (
                      <div key={anchor.id} className="flex items-center justify-between gap-2 py-1 font-mono text-[11px]">
                        <span className="text-noria-muted">{prefix}</span>
                        <span className={`flex-1 min-w-0 truncate ${isPaid ? 'line-through text-noria-muted' : 'text-noria-text'}`}>
                          {cuotaName}
                        </span>
                        <span className="text-noria-muted text-[10px]">
                          {formatDate(anchor.nextDueDate)}
                        </span>
                        <CurrencyAmount amount={anchor.amount} currencyCode={debt.currency} className="text-noria-text font-[600] tabular-nums" />
                        <span
                          className="border px-1 py-0 text-[7px] font-[700] uppercase tracking-[0.08em]"
                          style={{
                            borderColor: isPaid ? '#4F8F58' : isOverdue ? '#9F2F2D' : '#C58A14',
                            color: isPaid ? '#4F8F58' : isOverdue ? '#9F2F2D' : '#C58A14',
                          }}
                        >
                          {isPaid ? 'OK' : isOverdue ? 'VENCIDA' : 'PENDIENTE'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Payment history */}
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] font-[700] text-noria-text/60 uppercase tracking-[0.14em]">
                Historial de pagos ({debt.payments.length})
              </p>
              {debt.payments.length === 0 ? (
                <p className="text-[11px] text-noria-muted italic pl-3">Sin pagos registrados</p>
              ) : (
                <div className="space-y-0">
                  {[...debt.payments]
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((payment, idx) => {
                      const prefix = idx === debt.payments.length - 1 ? 'L─ ' : '├─ ';
                      const debtCurrency = payment.currency || debt.currency;
                      const isMultiCurrencyPayment = payment.paymentCurrency
                        && payment.paymentCurrency !== debtCurrency;
                      const hasPaymentRate = Number.isFinite(Number(payment.implicitRate))
                        && Number(payment.implicitRate) > 0;
                      return (
                        <div key={payment.id} className="flex items-start gap-2 py-2 font-mono text-[11px]">
                          <span className="text-noria-muted">{prefix}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-noria-muted text-[10px]">{formatDate(payment.date)}</p>
                                <p className="truncate text-noria-text">{payment.note || (debt.type === 'COBRAR' ? 'Cobro' : 'Pago')}</p>
                              </div>
                              <span className="text-noria-text font-[600] tabular-nums shrink-0">
                                <CurrencyAmount amount={payment.amountPaid} currencyCode={debtCurrency} />
                              </span>
                            </div>
                            <div className="mt-1 text-[9px] leading-relaxed text-noria-muted">
                              {isMultiCurrencyPayment ? (
                                <>
                                  <p>
                                    Movimiento: <CurrencyAmount amount={payment.paymentAmount} currencyCode={payment.paymentCurrency} />
                                  </p>
                                  {hasPaymentRate ? (
                                    <p>
                                      Tasa registrada: <span className="text-noria-text">{formatRate(payment.implicitRate)} {payment.paymentCurrency} por 1 {debtCurrency}</span>
                                    </p>
                                  ) : (
                                    <p>Tasa registrada no disponible</p>
                                  )}
                                </>
                              ) : hasPaymentRate && !payment.paymentCurrency ? (
                                <p>Conversión registrada · dirección no disponible</p>
                              ) : (
                                <p>Sin conversión · pago en {debtCurrency}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Actions */}
            {debt.status !== 'SETTLED' && (
              <div className="flex space-x-3 pt-2 border-t border-[rgba(26,26,26,0.16)]">
                <button
                  onClick={() => setPayingDebt({ debt, defaultSettle: false })}
                  className="flex-1 py-2 text-[10px] font-[700] uppercase tracking-[0.1em] border border-[#1A1A1A] hover:bg-noria-text/5 transition-colors focus:outline-none text-noria-text"
                >
                  + {debt.type === 'COBRAR' ? 'Registrar Cobro' : 'Registrar Pago'}
                </button>
                <button
                  onClick={() => setPayingDebt({ debt, defaultSettle: true })}
                  className="flex-1 py-2 text-[10px] font-[700] uppercase tracking-[0.1em] border border-[#647C78] hover:bg-[#647C78]/5 transition-colors focus:outline-none"
                  style={{ color: '#647C78' }}
                >
                  Saldar Deuda
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSplitRow = (split) => {
    const isExpanded = expandedSplitGroupId === split.id;
    const pct = split.totalAmount > 0 ? Math.min(100, (split.paidAmount / split.totalAmount) * 100) : 0;
    const filledBlocks = Math.round(pct / 10);
    const dateFormatted = formatDate(split.createdAt);

    return (
      <div key={split.id} className="relative border border-[#1A1A1A] bg-transparent" id={`split-${split.id}`}>
        {/* Compact row */}
        <div className="flex items-start gap-3 p-4">
          <button
            type="button"
            onClick={() => setExpandedSplitGroupId(isExpanded ? null : split.id)}
            className="flex-1 min-w-0 text-left focus:outline-none"
          >
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-[14px] font-[600] text-noria-text truncate">{split.description}</p>
              <span className="border border-[#647C78] px-1.5 py-0.5 font-mono text-[8px] font-[700] uppercase tracking-[0.1em]" style={{ color: '#647C78' }}>
                SPLIT ACTIVO
              </span>
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-noria-muted flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{dateFormatted}</span>
              <span>{split.participants.length} participantes</span>
            </div>
          </button>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <p className="text-[15px] font-[700] text-noria-text tabular-nums">
              {fmtWithSymbol(split.remaining, split.currency)}
            </p>
            <span
              className="border px-1.5 py-0.5 font-mono text-[8px] font-[700] uppercase tracking-[0.1em]"
              style={{
                borderColor: split.remaining <= 0 ? '#4F8F58' : '#C58A14',
                color: split.remaining <= 0 ? '#4F8F58' : '#C58A14'
              }}
            >
              {split.remaining <= 0 ? 'COBRADO' : 'PENDIENTE'}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setExpandedSplitGroupId(isExpanded ? null : split.id)}
              className="w-7 h-7 flex items-center justify-center text-noria-muted hover:text-noria-text focus:outline-none"
            >
              {isExpanded ? <ChevronUp size={14} strokeWidth={1.8} /> : <ChevronDown size={14} strokeWidth={1.8} />}
            </button>
          </div>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-t border-[rgba(26,26,26,0.16)] px-4 pb-4 pt-3 space-y-4 animate-fade-in">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] font-[700] text-noria-text/60 uppercase tracking-[0.14em]">Progreso de cobro</p>
                <span className="font-mono text-[11px] font-[700] text-noria-text">{pct.toFixed(0)}%</span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 10 }).map((_, idx) => (
                  <span
                    key={idx}
                    className="h-4 flex-1 border border-[#1A1A1A]"
                    style={{ background: idx < filledBlocks ? '#1A1A1A' : 'transparent' }}
                  />
                ))}
              </div>
              <div className="font-mono text-[11px] text-noria-muted flex items-center justify-between gap-2">
                <span>Cobrado: <CurrencyAmount amount={split.paidAmount} currencyCode={split.currency} /></span>
                <span>Tu parte (Gasto): <CurrencyAmount amount={split.yourPart} currencyCode={split.currency} /></span>
                <span>Por cobrar: <CurrencyAmount amount={split.remaining} currencyCode={split.currency} /></span>
              </div>
            </div>

            {/* Participants breakdown */}
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] font-[700] text-noria-text/60 uppercase tracking-[0.14em]">
                Estado por participante
              </p>
              <div className="space-y-1">
                {split.participants.map((debtItem, idx) => {
                  const prefix = idx === split.participants.length - 1 ? 'L─ ' : '├─ ';
                  const isPaid = debtItem.status === 'SETTLED' || debtItem.remaining <= 0;
                  return (
                    <div key={debtItem.id} className="flex items-center justify-between gap-2 py-1 font-mono text-[11px]">
                      <span className="text-noria-muted">{prefix}</span>
                      <span className={`flex-1 min-w-0 truncate ${isPaid ? 'line-through text-noria-muted' : 'text-noria-text'}`}>
                        {debtItem.thirdParty ? debtItem.thirdParty.name : 'Participante'}
                      </span>
                      <span className="text-noria-muted text-[10px]">
                        Cobrado: <CurrencyAmount amount={debtItem.paidAmount} currencyCode={split.currency} />
                      </span>
                      <span className="text-noria-text font-[600] tabular-nums">
                        Restante: <CurrencyAmount amount={debtItem.remaining} currencyCode={split.currency} />
                      </span>
                      <span
                        className="border px-1 py-0 text-[7px] font-[700] uppercase tracking-[0.08em]"
                        style={{
                          borderColor: isPaid ? '#4F8F58' : '#C58A14',
                          color: isPaid ? '#4F8F58' : '#C58A14',
                        }}
                      >
                        {isPaid ? 'OK' : 'PENDIENTE'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render: Section Header ──
  const renderSectionHeader = (title, count, isOpen, onToggle, actionButton = null) => (
    <div className="flex items-center justify-between py-3.5 border-b border-[#1A1A1A]">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center space-x-2 text-left focus:outline-none"
      >
        {onToggle && (
          isOpen ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />
        )}
        <h4 className="text-[17px] font-[600] text-noria-text leading-tight">{title}</h4>
        {count > 0 && (
          <span className="font-mono text-[10px] font-[700] text-noria-muted uppercase tracking-[0.1em]">
            ({count})
          </span>
        )}
      </button>
      {actionButton}
    </div>
  );

  // ── Main Render ──
  return (
    <div className="min-h-screen pb-24 pt-16 bg-[#F5F2ED]">
      <Header title="Deudas & Splits" />

      <main className="max-w-md mx-auto px-5 pt-4 space-y-6">
        {/* ── Technical Summary ── */}
        <section className="border border-[#1A1A1A] p-4 space-y-3" id="debts-summary">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[9px] font-[700] uppercase tracking-[0.14em] text-noria-text/60">
              Resumen de Deudas
            </p>
            <span className="font-mono text-[9px] font-[700] uppercase tracking-[0.14em] text-noria-muted">
              {summary.totalActive} activa{summary.totalActive !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Totals by currency */}
          {Object.entries(summary.byCurrency).length === 0 ? (
            <p className="text-[13px] text-noria-muted text-center py-2">Sin deudas activas</p>
          ) : (
            <>
              {Object.entries(summary.byCurrency).map(([currency, totals]) => (
                <div key={currency} className="space-y-1">
                  <p className="font-mono text-[9px] font-[700] uppercase tracking-[0.08em] text-noria-muted">{currency}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-noria-muted">Por cobrar</p>
                      <CurrencyAmount amount={totals.cobrar} currencyCode={currency} className="text-[16px] font-[700] text-noria-text tabular-nums" style={{ color: '#4F8F58' }} />
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-noria-muted">Por pagar</p>
                      <CurrencyAmount amount={totals.pagar} currencyCode={currency} className="text-[16px] font-[700] text-noria-text tabular-nums" style={{ color: '#9F2F2D' }} />
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-noria-muted">Balance</p>
                      <CurrencyAmount amount={totals.cobrar - totals.pagar} currencyCode={currency} className="text-[16px] font-[700] text-noria-text tabular-nums" />
                    </div>
                  </div>
                </div>
              ))}

              {/* Next due date */}
              {summary.nextDue && summary.nextDueDebt && (
                <div className="border-t border-[rgba(26,26,26,0.16)] pt-2 flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-noria-muted">Próximo vencimiento</span>
                  <span className="font-mono text-[10px] font-[600] text-noria-text">
                    {formatDate(summary.nextDue)} — {summary.nextDueDebt.description}
                  </span>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Por Cobrar ── */}
        <section id="debts-cobrar">
          {renderSectionHeader(
            'Por Cobrar',
            cobrar.length,
            true,
            null,
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="font-mono text-[10px] font-[700] uppercase tracking-[0.1em] flex items-center gap-1 focus:outline-none hover:text-noria-text"
              style={{ color: '#647C78' }}
            >
              <Plus size={12} strokeWidth={2} />
              Nueva Deuda
            </button>
          )}
          <div className="pt-4 space-y-3">
            {cobrar.length === 0 ? (
              <p className="text-[12px] text-noria-muted text-center py-4 border border-[rgba(26,26,26,0.12)]">
                Sin deudas por cobrar
              </p>
            ) : (
              cobrar.map(debt => renderDebtRow(debt))
            )}
          </div>
        </section>

        {/* ── Por Pagar ── */}
        <section id="debts-pagar">
          {renderSectionHeader('Por Pagar', pagar.length, true, null)}
          <div className="pt-4 space-y-3">
            {pagar.length === 0 ? (
              <p className="text-[12px] text-noria-muted text-center py-4 border border-[rgba(26,26,26,0.12)]">
                Sin deudas por pagar
              </p>
            ) : (
              pagar.map(debt => renderDebtRow(debt))
            )}
          </div>
        </section>

        {/* ── Splits Activos ── */}
        <section id="debts-splits">
          {renderSectionHeader(
            'Splits Activos',
            activeSplits.length,
            showSplits,
            () => setShowSplits(prev => !prev)
          )}
          {showSplits && (
            <div className="pt-4 space-y-3 animate-fade-in">
              {activeSplits.length === 0 ? (
                <p className="text-[12px] text-noria-muted text-center py-4 border border-[rgba(26,26,26,0.12)]">
                  Sin splits activos
                </p>
              ) : (
                activeSplits.map(split => renderSplitRow(split))
              )}
            </div>
          )}
        </section>

        {/* ── Saldadas (Collapsed Accordion) ── */}
        <section id="debts-settled">
          {renderSectionHeader(
            'Saldadas',
            settled.length,
            showSettled,
            () => setShowSettled(prev => !prev)
          )}
          {showSettled && (
            <div className="pt-4 space-y-3 animate-fade-in">
              {settled.length === 0 ? (
                <p className="text-[12px] text-noria-muted text-center py-4 border border-[rgba(26,26,26,0.12)]">
                  Sin deudas saldadas
                </p>
              ) : (
                settled.map(debt => renderDebtRow(debt))
              )}
            </div>
          )}
        </section>
      </main>

      {/* ── Forms ── */}
      <DebtFormSheet
        isOpen={showAddForm || !!editingDebt}
        onClose={() => { setShowAddForm(false); setEditingDebt(null); }}
        onSaved={() => { setShowAddForm(false); setEditingDebt(null); }}
        debt={editingDebt}
        activeAccounts={activeAccounts}
        institutions={institutions}
        tags={tags}
        dbCurrencies={dbCurrencies}
      />

      <DebtPaymentSheet
        isOpen={!!payingDebt}
        onClose={() => setPayingDebt(null)}
        onSaved={() => setPayingDebt(null)}
        debt={payingDebt?.debt}
        defaultSettle={payingDebt?.defaultSettle}
        activeAccounts={activeAccounts}
        institutions={institutions}
        instruments={instruments}
        dbCurrencies={dbCurrencies}
      />

      <FAB />
      <BottomNav />
    </div>
  );
}
