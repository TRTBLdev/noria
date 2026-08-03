import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { Search, Trash2, Pencil, ArrowDownRight, ArrowUpRight, ArrowLeftRight, ChevronDown, ChevronUp, Link2, Unlink, Scissors, Plus, MoreHorizontal } from 'lucide-react';
import PillarTag from './PillarTag.jsx';
import CategoryTag from './CategoryTag.jsx';
import CategoryIcon from './CategoryIcon.jsx';
import CategorySelect from './CategorySelect.jsx';
import IncomeTypeIcon from './IncomeTypeIcon.jsx';
import { DateInput, FormActions, FormField, FormSheet, NumberInput, SegmentedChoice, TextInput } from './FormSystem.jsx';
import { formatAmountWithSymbol, formatCurrency } from '../utils/format.js';
import CurrencyAmount from './CurrencyAmount.jsx';
import TransactionApplicationSheet from './TransactionApplicationSheet.jsx';
import { deleteReceiptGroup, splitExistingTransaction } from '../db/receipts.js';
import { unlinkTransactionApplication } from '../db/transactionApplications.js';

export function getTransactionActionAvailability(transaction, application) {
  const type = String(transaction?.type || '');
  const isAdjustment = type === 'BALANCE_ADJUSTMENT';
  const isTransfer = type.startsWith('TRANSFER_');
  return {
    edit: !isTransfer && !isAdjustment && !transaction.receiptId && !application,
    link: !isTransfer && !isAdjustment && !application,
    unlink: Boolean(application && !application.isLegacy),
    split: type === 'OUT' && !transaction.receiptId && !transaction.splitGroupId && !application
      && !transaction.debtId && !transaction.transferId,
    delete: !transaction.receiptId,
  };
}

export default function TransactionsSection({
  transactions,
  accounts,
  tags = [],
  incomeSources = [],
  incomeTypes = [],
  onDeleteTransaction,
  onUpdateTransaction
}) {
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('ALL');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterAccount, setFilterAccount] = useState('ALL');
  const [filterPillar, setFilterPillar] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [sortBy, setSortBy] = useState('DATE_DESC');
  
  const thirdParties = useLiveQuery(() => db.third_parties.toArray()) || [];
  const instruments  = useLiveQuery(() => db.instruments.toArray())  || [];
  const dbCurrencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const receipts = useLiveQuery(() => db.receipts.toArray()) || [];
  const applications = useLiveQuery(() => db.transaction_applications.toArray()) || [];
  const debts = useLiveQuery(() => db.debts.toArray()) || [];
  const goals = useLiveQuery(() => db.spending_goals.toArray()) || [];
  const lotCurrencyObj = useLiveQuery(() => db.app_config.get('lotCurrency'));
  const lotCurrency = lotCurrencyObj?.value || '';

  const INSTRUMENT_TYPES = [
    { value: 'DEBIT_CARD', label: 'Tarjeta de Débito' },
    { value: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
    { value: 'CREDIT_CARD', label: 'Tarjeta de Crédito' },
    { value: 'WIRE_TRANSFER', label: 'Transferencia Bancaria' },
    { value: 'CASH', label: 'Efectivo / Físico' }
  ];

  const [editingTx, setEditingTx] = useState(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPillar, setEditPillar] = useState('');
  const [editTagId, setEditTagId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [applyingTx, setApplyingTx] = useState(null);
  const [expandedReceipts, setExpandedReceipts] = useState(() => new Set());
  const [splittingTx, setSplittingTx] = useState(null);
  const [splitParts, setSplitParts] = useState([]);
  const [splitError, setSplitError] = useState('');
  const [openActionMenu, setOpenActionMenu] = useState(null);

  useEffect(() => {
    if (!openActionMenu) return undefined;
    const handlePointerDown = event => {
      if (!event.target.closest('[data-history-action-menu]')) setOpenActionMenu(null);
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') setOpenActionMenu(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openActionMenu]);

  const rangeOptions = [
    ['ALL', 'TODO'],
    ['THIS_MONTH', 'MES'],
    ['LAST_MONTH', 'MES PASADO'],
    ['3_MONTHS', '3 M'],
    ['CUSTOM', 'CUSTOM']
  ];

  const formatTransactionAmount = (amount, currency) => {
    const currencyExists = dbCurrencies.some(item => item.code === currency);
    if (currencyExists) return formatAmountWithSymbol(amount, currency, dbCurrencies);

    const formatted = formatCurrency(amount, currency, dbCurrencies);
    return currency ? `${formatted} ${currency}` : formatted;
  };

  const getAccountName = (id) => accounts.find(a => a.id === id)?.name || 'Cuenta desconocida';
  const getCategoryKindForTransaction = (tx) => {
    if (tx.type === 'OUT') return 'EXPENSE';
    return null;
  };
  const getTransactionTag = (tx) => {
    const expectedKind = getCategoryKindForTransaction(tx);
    if (!expectedKind) return null;
    const explicitTagId = tx.tagId;
    const resolvedTagId = explicitTagId;
    return tags.find(tag => tag.id === resolvedTagId && (tag.kind || 'EXPENSE') === expectedKind) || null;
  };

  const formatDateLabel = (date) => new Date(date)
    .toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/\./g, '')
    .toUpperCase();

  const filteredTransactions = transactions.filter(t => {
    const text = (t.description || '').toLowerCase();
    if (search && !text.includes(search.toLowerCase())) return false;

    if (filterAccount !== 'ALL' && t.accountId?.toString() !== filterAccount) return false;
    if (filterPillar !== 'ALL' && t.pillar !== filterPillar) return false;

    if (filterType !== 'ALL') {
      if (filterType === 'IN' && t.type !== 'IN') return false;
      if (filterType === 'OUT' && t.type !== 'OUT') return false;
      if (filterType === 'TRANSFER' && !t.type.startsWith('TRANSFER_')) return false;
      if (filterType === 'ADJUSTMENT' && t.type !== 'BALANCE_ADJUSTMENT') return false;
    }

    const tDate = new Date(t.date);
    const now = new Date();
    if (dateRange === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      if (tDate < start) return false;
    } else if (dateRange === 'LAST_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      if (tDate < start || tDate > end) return false;
    } else if (dateRange === '3_MONTHS') {
      const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      if (tDate < start) return false;
    } else if (dateRange === 'CUSTOM') {
      if (customStart && tDate < new Date(customStart + 'T00:00:00')) return false;
      if (customEnd && tDate > new Date(customEnd + 'T23:59:59')) return false;
    }

    return true;
  });

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    if (sortBy === 'DATE_DESC') return dateB - dateA;
    if (sortBy === 'DATE_ASC') return dateA - dateB;
    if (sortBy === 'AMOUNT_DESC') return b.amount - a.amount;
    if (sortBy === 'AMOUNT_ASC') return a.amount - b.amount;
    return 0;
  });

  const groupedTransactions = sortedTransactions.reduce((groups, tx) => {
    const label = formatDateLabel(tx.date);
    if (!groups[label]) groups[label] = [];
    groups[label].push(tx);
    return groups;
  }, {});

  const handleStartEdit = (tx) => {
    setEditingTx(tx);
    setEditDesc(tx.description || '');
    setEditAmount(tx.amount.toString());
    setEditPillar(tx.pillar || 'NEED');
    const category = getTransactionTag(tx);
    setEditTagId(category ? category.id.toString() : '');

    const d = new Date(tx.date);
    setEditDate(d.toISOString().slice(0, 10));
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) { alert('Monto inválido'); return; }

    onUpdateTransaction(editingTx.id, {
      description: editDesc.trim(),
      amount: amt,
      pillar: editingTx.type === 'OUT' ? editPillar : null,
      tagId: getCategoryKindForTransaction(editingTx) && editTagId ? parseInt(editTagId) : null,
      date: new Date(editDate + 'T12:00:00')
    });
    setEditingTx(null);
  };

  const getApplication = transactionId => applications.find(application => application.transactionId === transactionId);
  const getApplicationLabel = application => {
    if (!application) return '';
    if (application.targetType === 'SPENDING_GOAL') {
      return goals.find(goal => goal.id === application.targetId)?.name || 'Objetivo';
    }
    const debt = debts.find(item => item.id === application.targetId);
    const person = thirdParties.find(item => item.id === debt?.thirdPartyId)?.name;
    return person ? `${debt?.description || 'Deuda'} · ${person}` : (debt?.description || 'Deuda');
  };

  const getGroupKindLabel = receipt => {
    if (receipt.convertedFromTransactionId) return 'Split retrospectivo';
    return {
      RECEIPT: 'Factura / ticket',
      SHARED_EXPENSE: 'Cuenta compartida',
      DEBT_DISTRIBUTION: 'Pago de deudas',
    }[receipt.groupKind || 'RECEIPT'] || 'Movimiento dividido';
  };

  const handleUnlink = async transaction => {
    if (!confirm('¿Desvincular esta transacción de su destino?')) return;
    try { await unlinkTransactionApplication(db, transaction.id); }
    catch (error) { alert(error.message || 'No se pudo desvincular.'); }
  };

  const handleStartSplit = transaction => {
    const half = (Number(transaction.amount) / 2).toFixed(2);
    setSplittingTx(transaction);
    setSplitParts([
      { amount: half, tagId: transaction.tagId?.toString() || '', pillar: transaction.pillar || 'NEED', description: transaction.description || '' },
      { amount: (Number(transaction.amount) - Number(half)).toFixed(2), tagId: transaction.tagId?.toString() || '', pillar: transaction.pillar || 'NEED', description: transaction.description || '' },
    ]);
    setSplitError('');
  };

  const handleSaveSplit = async event => {
    event.preventDefault();
    setSplitError('');
    try {
      await splitExistingTransaction(db, splittingTx.id, splitParts);
      setSplittingTx(null);
    } catch (error) {
      setSplitError(error.message || 'No se pudo dividir la transacción.');
    }
  };

  const toggleReceipt = receiptId => {
    setExpandedReceipts(current => {
      const next = new Set(current);
      if (next.has(receiptId)) next.delete(receiptId);
      else next.add(receiptId);
      return next;
    });
  };

  const renderRow = (t) => {
    const isAdjustment = t.type === 'BALANCE_ADJUSTMENT';
    const isIncome = t.type === 'IN' || t.type === 'TRANSFER_IN' || (isAdjustment && t.adjustmentAmount > 0);
    const isTransfer = t.type.startsWith('TRANSFER_');
    const accountName = getAccountName(t.accountId);
    const category = getTransactionTag(t);
    const source = t.incomeSourceId ? incomeSources.find(item => item.id === t.incomeSourceId) : null;
    const amountSign = isIncome ? '+' : '-';
    const amountColor = isAdjustment ? '#647C78' : isTransfer ? '#1A1A1A' : isIncome ? '#4F8F58' : '#1A1A1A';
    const application = getApplication(t.id);
    const beneficiary = t.beneficiaryThirdPartyId
      ? thirdParties.find(item => item.id === t.beneficiaryThirdPartyId)
      : null;
    const actions = getTransactionActionAvailability(t, application);
    const hasActions = Object.values(actions).some(Boolean);
    const actionMenuKey = `transaction-${t.id}`;
    const isActionMenuOpen = openActionMenu === actionMenuKey;

    const tp = t.thirdPartyId ? thirdParties.find(item => item.id === t.thirdPartyId) : null;
    const displayName = tp 
      ? (t.description ? `${tp.name} · ${t.description}` : tp.name)
      : (t.description || (isAdjustment ? 'Conciliación de saldo' : isIncome ? 'Ingreso' : 'Gasto'));

    return (
      <div key={t.id} className="relative py-3 flex items-center gap-3">
        <div className="pt-0.5 flex-shrink-0">
          {category ? (
            <CategoryIcon iconKey={category.iconKey} size={14} />
          ) : isTransfer || isAdjustment ? (
            <ArrowLeftRight size={14} className="text-noria-muted" strokeWidth={1.6} />
          ) : isIncome ? (
            <IncomeTypeIcon incomeTypes={incomeTypes} incomeTypeId={source?.incomeTypeId} legacyType={source?.type} size={14} />
          ) : (
            <ArrowDownRight size={14} style={{ color: '#1A1A1A' }} strokeWidth={1.6} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-[14px] font-[500] text-noria-text truncate">
              {displayName}
            </span>
            {t.splitGroupId && (
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] px-1 border border-[#1A1A1A]/30 text-noria-muted select-none">
                Split
              </span>
            )}
            {isAdjustment && (
              <span className="font-mono text-[8px] uppercase tracking-[0.05em] px-1 border border-[#647C78] text-[#647C78] select-none">
                Conciliación
              </span>
            )}
            {application && (
              <span className="font-mono text-[8px] uppercase tracking-[0.05em] px-1 border border-[#647C78] text-[#647C78] select-none">
                {application.kind === 'GOAL_PROGRESS' ? 'Objetivo' : application.kind === 'DEBT_ORIGIN' ? 'Por cobrar' : 'Deuda'}
              </span>
            )}
            <PillarTag pillar={t.pillar} size="xs" />
            <CategoryTag name={category?.name} size="xs" />
          </div>
          <p className="mt-0.5 text-[10px] text-noria-muted uppercase tracking-[0.1em] font-mono truncate">
            {(() => {
              const inst = t.instrumentId ? instruments.find(i => i.id === t.instrumentId) : null;
              const instLabel = inst 
                ? (inst.alias || (INSTRUMENT_TYPES.find(it => it.value === inst.type)?.label || inst.type)) 
                : null;
              const accountDisplay = instLabel ? `${accountName} (${instLabel})` : accountName;
              const feeDisplay = t.fee > 0
                ? ` · Comisión: ${amountSign}${formatTransactionAmount(t.fee, t.currency)}`
                : '';
              return accountDisplay + feeDisplay;
            })()}
          </p>
          {beneficiary && (
            <p className="mt-0.5 text-[9px] text-noria-muted font-mono truncate">Por cuenta de {beneficiary.name}</p>
          )}
          {application && (
            <p className="mt-0.5 text-[9px] text-[#647C78] font-mono">
              → {getApplicationLabel(application)} · {Number(application.sourceAmount).toFixed(2)} {application.sourceCurrency}
              {' → '}{Number(application.targetAmount).toFixed(2)} {application.targetCurrency}
              {application.kind === 'DEBT_PAYMENT' && application.sourceAmount > 0
                ? ` · Tasa ${Number(application.targetAmount / application.sourceAmount).toFixed(6)}`
                : ''}
            </p>
          )}
          {t.taxTreatment && t.invoiceCurrency && (
            <p className="mt-0.5 text-[9px] text-noria-muted font-mono">
              {t.taxTreatment === 'EXEMPT' ? 'Exento' : `IVA ${Number(t.invoiceTaxAmount || 0).toFixed(2)}`} · {Number(t.invoiceGrossAmount || 0).toFixed(2)} {t.invoiceCurrency}
            </p>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <p
            className="text-[13px] font-mono font-[700] whitespace-nowrap"
            style={{ color: amountColor }}
          >
            {amountSign}{formatTransactionAmount(t.amount, t.currency)}
          </p>
          <p className="text-[9px] text-noria-muted font-mono uppercase">{t.currency}</p>
        </div>

        {hasActions && (
          <div className="relative flex-shrink-0" data-history-action-menu>
            <button
              type="button"
              onClick={() => setOpenActionMenu(isActionMenuOpen ? null : actionMenuKey)}
              className="flex h-7 w-7 items-center justify-center text-noria-muted hover:text-noria-text focus:outline-none"
              title="Acciones"
              aria-label={`Acciones de ${displayName}`}
              aria-expanded={isActionMenuOpen}
            >
              <MoreHorizontal size={16} strokeWidth={1.8} />
            </button>
            {isActionMenuOpen && (
              <div className="absolute right-0 top-7 z-30 w-40 border border-[#1A1A1A] bg-[#F5F2ED] font-mono text-[10px] uppercase tracking-[0.08em]">
                {actions.edit && (
                  <button type="button" onClick={() => { setOpenActionMenu(null); handleStartEdit(t); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-noria-text/5 focus:outline-none">
                    <Pencil size={12} strokeWidth={1.5} /> Editar
                  </button>
                )}
                {actions.link && (
                  <button type="button" onClick={() => { setOpenActionMenu(null); setApplyingTx(t); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-noria-text/5 focus:outline-none">
                    <Link2 size={12} strokeWidth={1.5} /> Vincular
                  </button>
                )}
                {actions.unlink && (
                  <button type="button" onClick={() => { setOpenActionMenu(null); handleUnlink(t); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-noria-text/5 focus:outline-none">
                    <Unlink size={12} strokeWidth={1.5} /> Desvincular
                  </button>
                )}
                {actions.split && (
                  <button type="button" onClick={() => { setOpenActionMenu(null); handleStartSplit(t); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-noria-text/5 focus:outline-none">
                    <Scissors size={12} strokeWidth={1.5} /> Dividir
                  </button>
                )}
                {actions.delete && (
                  <button type="button" onClick={() => { setOpenActionMenu(null); onDeleteTransaction(t); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[#9F2F2D] hover:bg-[#9F2F2D]/10 focus:outline-none">
                    <Trash2 size={12} strokeWidth={1.5} /> Eliminar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderReceiptGroup = receiptId => {
    const receipt = receipts.find(item => item.id === receiptId);
    const fragments = transactions.filter(transaction => transaction.receiptId === receiptId);
    if (!receipt || fragments.length === 0) return null;
    const expanded = expandedReceipts.has(receiptId);
    const accountName = getAccountName(receipt.accountId);
    const groupKind = receipt.groupKind || 'RECEIPT';
    const counterpartyId = receipt.counterpartyThirdPartyId || receipt.merchantThirdPartyId;
    const counterparty = thirdParties.find(item => item.id === counterpartyId);
    const hasDocument = groupKind === 'RECEIPT' && receipt.invoiceCurrency && Number.isFinite(Number(receipt.invoiceTotal));
    const actionMenuKey = `group-${receiptId}`;
    const isActionMenuOpen = openActionMenu === actionMenuKey;
    return (
      <div key={`receipt-${receiptId}`} className="relative border border-[#1A1A1A]/35 my-2">
        <div className="flex items-center gap-3 p-3">
          <button type="button" onClick={() => toggleReceipt(receiptId)} className="text-noria-muted">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button type="button" onClick={() => toggleReceipt(receiptId)} className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className="truncate text-[14px] font-[600]">{receipt.description}</span>
              <span className="border border-[#647C78] px-1 font-mono text-[8px] uppercase text-[#647C78]">{getGroupKindLabel(receipt)}</span>
            </div>
            <p className="font-mono text-[9px] uppercase text-noria-muted">
              {accountName} · {fragments.length} fragmentos
              {counterparty ? ` · ${counterparty.name}` : ''}
              {hasDocument ? ` · Ticket ${Number(receipt.invoiceTotal).toFixed(2)} ${receipt.invoiceCurrency}` : ''}
              {Number(receipt.feeAmount) > 0 ? ` · Comisión ${Number(receipt.feeAmount).toFixed(2)} ${receipt.paymentCurrency}` : ''}
            </p>
          </button>
          <div className="text-right">
            <p className="font-mono text-[13px] font-bold">-{formatTransactionAmount(receipt.paymentTotal, receipt.paymentCurrency)}</p>
            <p className="font-mono text-[8px] uppercase text-noria-muted">Cargo total</p>
          </div>
          <div className="relative flex-shrink-0" data-history-action-menu>
            <button
              type="button"
              onClick={() => setOpenActionMenu(isActionMenuOpen ? null : actionMenuKey)}
              className="flex h-7 w-7 items-center justify-center text-noria-muted hover:text-noria-text focus:outline-none"
              title="Acciones del grupo"
              aria-label={`Acciones de ${receipt.description}`}
              aria-expanded={isActionMenuOpen}
            >
              <MoreHorizontal size={16} strokeWidth={1.8} />
            </button>
            {isActionMenuOpen && (
              <div className="absolute right-0 top-7 z-30 w-48 border border-[#1A1A1A] bg-[#F5F2ED] font-mono text-[10px] uppercase tracking-[0.08em]">
                <button
                  type="button"
                  onClick={async () => {
                    setOpenActionMenu(null);
                    if (!confirm('¿Eliminar el movimiento completo y restaurar el saldo?')) return;
                    try { await deleteReceiptGroup(db, receiptId); }
                    catch (error) { alert(error.message || 'No se pudo eliminar el movimiento.'); }
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[#9F2F2D] hover:bg-[#9F2F2D]/10 focus:outline-none"
                >
                  <Trash2 size={12} strokeWidth={1.5} /> Eliminar movimiento
                </button>
              </div>
            )}
          </div>
        </div>
        {expanded && (
          <div className="divide-y divide-[#1A1A1A]/12 border-t border-[#1A1A1A]/20 px-3">
            {fragments.sort((left, right) => String(left.id).localeCompare(String(right.id))).map(renderRow)}
          </div>
        )}
      </div>
    );
  };

  const collapseReceiptItems = items => {
    const seen = new Set();
    const result = [];
    for (const transaction of items) {
      if (!transaction.receiptId) {
        result.push({ type: 'TRANSACTION', transaction });
        continue;
      }
      if (!seen.has(transaction.receiptId)) {
        seen.add(transaction.receiptId);
        result.push({ type: 'RECEIPT', receiptId: transaction.receiptId });
      }
    }
    return result;
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="space-y-4">
        <div className="relative">
          <Search size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-noria-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por descripción..."
            className="w-full bg-transparent border-0 border-b border-[#1A1A1A] pl-0 pr-6 py-2.5 text-[13px] font-mono text-noria-text placeholder:text-noria-muted/60 focus:outline-none focus:border-[#647C78]"
          />
        </div>

        <div className="space-y-1">
          <label className="muji-header block">Rango de fecha</label>
          <div className="grid grid-cols-5 gap-2">
            {rangeOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDateRange(value)}
                className="py-1.5 text-[9px] font-mono font-[700] tracking-[0.12em] text-center border-b-2 bg-transparent transition-colors focus:outline-none"
                style={{
                  color: dateRange === value ? '#1A1A1A' : 'rgba(26,26,26,0.48)',
                  borderColor: dateRange === value ? '#647C78' : 'transparent'
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {dateRange === 'CUSTOM' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="muji-header block mb-1">Desde</label>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="w-full bg-transparent border-0 border-b border-[#1A1A1A]/40 py-1.5 text-[11px] font-mono text-noria-text focus:outline-none focus:border-[#647C78]"
              />
            </div>
            <div>
              <label className="muji-header block mb-1">Hasta</label>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="w-full bg-transparent border-0 border-b border-[#1A1A1A]/40 py-1.5 text-[11px] font-mono text-noria-text focus:outline-none focus:border-[#647C78]"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-[11px]">
          <div>
            <label className="muji-header block mb-1">Cuenta</label>
            <select
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              className="w-full bg-transparent border-0 border-b border-[#1A1A1A]/40 py-1.5 text-[11px] font-mono text-noria-text focus:outline-none focus:border-[#647C78]"
            >
              <option value="ALL">Todas</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="muji-header block mb-1">Tipo</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="w-full bg-transparent border-0 border-b border-[#1A1A1A]/40 py-1.5 text-[11px] font-mono text-noria-text focus:outline-none focus:border-[#647C78]"
            >
              <option value="ALL">Todos</option>
              <option value="IN">Ingresos</option>
              <option value="OUT">Gastos</option>
              <option value="TRANSFER">Transferencias</option>
              <option value="ADJUSTMENT">Conciliaciones</option>
            </select>
          </div>

          <div>
            <label className="muji-header block mb-1">Pilar</label>
            <select
              value={filterPillar}
              onChange={e => setFilterPillar(e.target.value)}
              className="w-full bg-transparent border-0 border-b border-[#1A1A1A]/40 py-1.5 text-[11px] font-mono text-noria-text focus:outline-none focus:border-[#647C78]"
            >
              <option value="ALL">Cualquiera</option>
              <option value="NEED">Necesidad</option>
              <option value="WANT">Deseo</option>
              <option value="SAVE">Ahorro</option>
            </select>
          </div>

          <div>
            <label className="muji-header block mb-1">Ordenar por</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="w-full bg-transparent border-0 border-b border-[#1A1A1A]/40 py-1.5 text-[11px] font-mono text-noria-text focus:outline-none focus:border-[#647C78]"
            >
              <option value="DATE_DESC">Fecha: recientes</option>
              <option value="DATE_ASC">Fecha: antiguos</option>
              <option value="AMOUNT_DESC">Monto: mayor</option>
              <option value="AMOUNT_ASC">Monto: menor</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-noria-muted font-[500] px-1">
          <span>Transacciones encontradas ({sortedTransactions.length})</span>
        </div>

        {sortedTransactions.length === 0 ? (
          <div className="text-center py-8 text-[12px] text-noria-muted border border-[#1A1A1A]/20">
            No se encontraron transacciones con los filtros activos.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedTransactions).map(([dateLabel, items]) => (
              <div key={dateLabel} className="space-y-1">
                <div className="px-1 pb-0 text-[10px] font-mono font-[700] tracking-[0.12em] text-noria-text">
                  {dateLabel}
                </div>
                <div className="divide-y divide-[#1A1A1A]/12">
                  {collapseReceiptItems(items).map(item => item.type === 'RECEIPT'
                    ? renderReceiptGroup(item.receiptId)
                    : renderRow(item.transaction))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingTx && (
        <>
          <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40" onClick={() => setEditingTx(null)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up"
            style={{ background: '#F5F2ED', borderTop: '2px solid #1A1A1A' }}
          >
            <form onSubmit={handleSaveEdit} className="px-6 pt-5 pb-10 space-y-4">
              <div className="flex justify-between items-center border-b border-[#1A1A1A] pb-3">
                <h4 className="text-[17px] font-[600] text-noria-text leading-tight">Editar transacción</h4>
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="focus:outline-none p-1 text-noria-muted hover:text-noria-text"
                >
                  x
                </button>
              </div>

              <div>
                <label className="muji-header block mb-1">Descripción</label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="muji-input"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="muji-header block mb-1">Monto ({editingTx.currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    disabled={editingTx.currency === lotCurrency}
                    className="muji-input disabled:opacity-60"
                    required
                  />
                  {editingTx.currency === lotCurrency && (
                    <p className="mt-1 text-[9px] text-noria-muted">Para cambiar el monto {lotCurrency}, elimina y registra nuevamente.</p>
                  )}
                </div>
                <div>
                  <label className="muji-header block mb-1">Fecha</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="muji-input"
                    required
                  />
                </div>
              </div>

              {editingTx.type === 'OUT' && (
                <div>
                  <label className="muji-header block mb-2">Pilar</label>
                  <div className="flex space-x-1">
                    {[['NEED', 'Necesidad', '#4F8F58'], ['WANT', 'Deseo', '#3F7F9C'], ['SAVE', 'Ahorro', '#C58A14']].map(([val, label, col]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setEditPillar(val)}
                        className="flex-1 py-2 text-[10px] font-mono font-[700] uppercase border transition-colors"
                        style={{
                          borderColor: editPillar === val ? col : 'rgba(26,26,26,0.16)',
                          color: editPillar === val ? col : 'rgba(26,26,26,0.48)',
                          background: 'transparent'
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {editingTx.type === 'OUT' && (
                <CategorySelect
                  id="edit-transaction-category"
                  value={editTagId}
                  onChange={setEditTagId}
                  tags={tags}
                  kind={getCategoryKindForTransaction(editingTx)}
                />
              )}

              <button
                type="submit"
                className="w-full py-3.5 text-[12px] font-mono font-[700] uppercase tracking-[0.12em] border mt-2 transition-colors"
                style={{ background: 'transparent', color: '#1A1A1A', borderColor: '#1A1A1A' }}
              >
                Guardar cambios
              </button>
            </form>
          </div>
        </>
      )}

      <TransactionApplicationSheet
        isOpen={!!applyingTx}
        onClose={() => setApplyingTx(null)}
        transaction={applyingTx}
      />

      {splittingTx && (
        <FormSheet title="Dividir transacción" onClose={() => setSplittingTx(null)}>
          <form onSubmit={handleSaveSplit} className="space-y-4">
            <div className="border border-[#1A1A1A]/25 p-3 font-mono text-[11px]">
              <p>{splittingTx.description || 'Sin descripción'}</p>
              <p className="font-bold"><CurrencyAmount amount={splittingTx.amount} currencyCode={splittingTx.currency} /></p>
              <p className="mt-1 text-[9px] text-noria-muted">El saldo y FIFO no volverán a moverse; solo se repartirá el registro existente.</p>
            </div>
            {splitParts.map((part, index) => (
              <div key={index} className="border border-[#1A1A1A]/30 p-3 space-y-3">
                <p className="font-mono text-[9px] font-bold uppercase">Fragmento {index + 1}</p>
                <FormField label={`Monto (${splittingTx.currency})`} htmlFor={`retro-split-amount-${index}`}>
                  <NumberInput
                    id={`retro-split-amount-${index}`}
                    value={part.amount}
                    onChange={event => setSplitParts(current => current.map((item, position) => position === index ? { ...item, amount: event.target.value } : item))}
                    step="0.01"
                    required
                  />
                </FormField>
                <CategorySelect
                  id={`retro-split-tag-${index}`}
                  value={part.tagId}
                  onChange={value => {
                    const tag = tags.find(item => item.id === Number(value));
                    setSplitParts(current => current.map((item, position) => position === index ? { ...item, tagId: value, pillar: tag?.pillar || item.pillar } : item));
                  }}
                  tags={tags}
                  kind="EXPENSE"
                />
                <FormField label="Descripción" htmlFor={`retro-split-description-${index}`}>
                  <TextInput
                    id={`retro-split-description-${index}`}
                    value={part.description}
                    onChange={event => setSplitParts(current => current.map((item, position) => position === index ? { ...item, description: event.target.value } : item))}
                  />
                </FormField>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSplitParts(current => [...current, { amount: '', tagId: splittingTx.tagId?.toString() || '', pillar: splittingTx.pillar || 'NEED', description: splittingTx.description || '' }])}
              className="flex items-center gap-1 font-mono text-[9px] uppercase text-[#647C78]"
            >
              <Plus size={11} /> Agregar fragmento
            </button>
            {splitError && <p className="text-[12px] text-[#9F2F2D]">{splitError}</p>}
            <FormActions primaryLabel="Guardar split" />
          </form>
        </FormSheet>
      )}
    </div>
  );
}
