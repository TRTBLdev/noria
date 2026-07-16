import React, { useState } from 'react';
import { Search, Trash2, Pencil, ArrowDownRight, ArrowUpRight, ArrowLeftRight } from 'lucide-react';
import PillarTag from './PillarTag.jsx';

export default function TransactionsSection({
  transactions,
  accounts,
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

  const [editingTx, setEditingTx] = useState(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPillar, setEditPillar] = useState('');
  const [editDate, setEditDate] = useState('');

  const rangeOptions = [
    ['ALL', 'TODO'],
    ['THIS_MONTH', 'MES'],
    ['LAST_MONTH', 'MES PASADO'],
    ['3_MONTHS', '3 M'],
    ['CUSTOM', 'CUSTOM']
  ];

  const fmt = (n) => {
    if (typeof n !== 'number') return '0.00';
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2 });
  };

  const getAccountName = (id) => accounts.find(a => a.id === id)?.name || 'Cuenta desconocida';

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
      date: new Date(editDate + 'T12:00:00')
    });
    setEditingTx(null);
  };

  const renderRow = (t) => {
    const isIncome = t.type === 'IN' || t.type === 'TRANSFER_IN';
    const isTransfer = t.type.startsWith('TRANSFER_');
    const accountName = getAccountName(t.accountId);
    const amountSign = isIncome ? '+' : '-';
    const amountColor = isTransfer ? '#1A1A1A' : isIncome ? '#4F8F58' : '#1A1A1A';

    return (
      <div key={t.id} className="py-3 flex items-center gap-3">
        <div className="pt-0.5 flex-shrink-0">
          {isTransfer ? (
            <ArrowLeftRight size={14} className="text-noria-muted" strokeWidth={1.6} />
          ) : isIncome ? (
            <ArrowUpRight size={14} style={{ color: '#4F8F58' }} strokeWidth={1.6} />
          ) : (
            <ArrowDownRight size={14} style={{ color: '#1A1A1A' }} strokeWidth={1.6} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-[500] text-noria-text truncate">
              {t.description || (isIncome ? 'Ingreso' : 'Gasto')}
            </span>
            <PillarTag pillar={t.pillar} size="xs" />
          </div>
          <p className="mt-0.5 text-[10px] text-noria-muted uppercase tracking-[0.1em] font-mono truncate">
            {accountName}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p
            className="text-[13px] font-mono font-[700] whitespace-nowrap"
            style={{ color: amountColor }}
          >
            {amountSign}${fmt(t.amount)}
          </p>
          <p className="text-[9px] text-noria-muted font-mono uppercase">{t.currency}</p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!isTransfer && (
            <button
              type="button"
              onClick={() => handleStartEdit(t)}
              className="p-1 text-noria-muted hover:text-noria-text transition-colors"
              title="Editar"
            >
              <Pencil size={12} strokeWidth={1.5} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDeleteTransaction(t)}
            className="p-1 text-noria-muted hover:text-[#9F2F2D] transition-colors"
            title="Eliminar"
          >
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    );
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
                <option key={acc.id} value={acc.id}>{acc.name}</option>
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
                  {items.map(renderRow)}
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
                  <label className="muji-header block mb-1">Monto (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    className="muji-input"
                    required
                  />
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
    </div>
  );
}
