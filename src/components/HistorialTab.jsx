import React, { useState } from 'react';
import { Search, Calendar, Filter, Trash2, Pencil, X, Check, ArrowDownRight, ArrowUpRight, ArrowLeftRight } from 'lucide-react';

export default function HistorialTab({
  transactions,
  accounts,
  onDeleteTransaction,
  onUpdateTransaction
}) {
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('ALL'); // ALL, THIS_MONTH, LAST_MONTH, 3_MONTHS, CUSTOM
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterAccount, setFilterAccount] = useState('ALL');
  const [filterPillar, setFilterPillar] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL'); // ALL, IN, OUT, TRANSFER
  const [sortBy, setSortBy] = useState('DATE_DESC'); // DATE_DESC, DATE_ASC, AMOUNT_DESC, AMOUNT_ASC

  // Estados para edición
  const [editingTx, setEditingTx] = useState(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPillar, setEditPillar] = useState('');
  const [editDate, setEditDate] = useState('');

  const fmt = (n) => {
    if (typeof n !== 'number') return '0.00';
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2 });
  };

  const getAccountName = (id) => accounts.find(a => a.id === id)?.name || 'Cuenta Desconocida';

  // Lógica de filtrado
  const filteredTransactions = transactions.filter(t => {
    // 1. Buscador texto
    const text = (t.description || '').toLowerCase();
    if (search && !text.includes(search.toLowerCase())) return false;

    // 2. Filtro Cuenta
    if (filterAccount !== 'ALL' && t.accountId?.toString() !== filterAccount) return false;

    // 3. Filtro Pilar
    if (filterPillar !== 'ALL' && t.pillar !== filterPillar) return false;

    // 4. Filtro Tipo
    if (filterType !== 'ALL') {
      if (filterType === 'IN' && t.type !== 'IN') return false;
      if (filterType === 'OUT' && t.type !== 'OUT') return false;
      if (filterType === 'TRANSFER' && !t.type.startsWith('TRANSFER_')) return false;
    }

    // 5. Filtro Fechas
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

  // Lógica de ordenamiento
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    if (sortBy === 'DATE_DESC') return dateB - dateA;
    if (sortBy === 'DATE_ASC') return dateA - dateB;
    if (sortBy === 'AMOUNT_DESC') return b.amount - a.amount;
    if (sortBy === 'AMOUNT_ASC') return a.amount - b.amount;
    return 0;
  });

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

  return (
    <div className="space-y-4 pb-8">
      {/* ── Buscador y Controles de Filtro ── */}
      <div className="space-y-3 bg-[rgba(26,26,26,0.02)] p-4 rounded-lg border border-[rgba(26,26,26,0.05)]">
        {/* Fila 1: Buscar */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3.5 text-noria-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por descripción..."
            className="muji-input pl-9 pr-4 py-2.5 text-[13px]"
          />
        </div>

        {/* Fila 2: Filtros Rápidos */}
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div>
            <label className="muji-header block mb-1">Rango de Fecha</label>
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value)}
              className="muji-input text-[12px] py-1.5 px-2"
            >
              <option value="ALL">Todo el Historial</option>
              <option value="THIS_MONTH">Este Mes</option>
              <option value="LAST_MONTH">Mes Pasado</option>
              <option value="3_MONTHS">Últimos 3 Meses</option>
              <option value="CUSTOM">Intervalo Personalizado</option>
            </select>
          </div>
          <div>
            <label className="muji-header block mb-1">Cuenta</label>
            <select
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              className="muji-input text-[12px] py-1.5 px-2"
            >
              <option value="ALL">Todas las Cuentas</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Fila 3: Rango personalizado de fechas */}
        {dateRange === 'CUSTOM' && (
          <div className="grid grid-cols-2 gap-2 animate-fade-in text-[11px]">
            <div>
              <label className="muji-header block mb-0.5">Desde</label>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="muji-input py-1 px-2 text-[11px]"
              />
            </div>
            <div>
              <label className="muji-header block mb-0.5">Hasta</label>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="muji-input py-1 px-2 text-[11px]"
              />
            </div>
          </div>
        )}

        {/* Fila 4: Filtros de Tipo, Pilar y Ordenamiento */}
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <label className="muji-header block mb-1">Tipo</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="muji-input text-[11px] py-1.5 px-2"
            >
              <option value="ALL">Todos</option>
              <option value="IN">Ingresos</option>
              <option value="OUT">Gastos</option>
              <option value="TRANSFER">Transf.</option>
            </select>
          </div>
          <div>
            <label className="muji-header block mb-1">Pilar</label>
            <select
              value={filterPillar}
              onChange={e => setFilterPillar(e.target.value)}
              className="muji-input text-[11px] py-1.5 px-2"
            >
              <option value="ALL">Cualquiera</option>
              <option value="NEED">Necesidad (N)</option>
              <option value="WANT">Deseo (W)</option>
              <option value="SAVE">Ahorro (S)</option>
            </select>
          </div>
          <div>
            <label className="muji-header block mb-1">Ordenar por</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="muji-input text-[11px] py-1.5 px-2"
            >
              <option value="DATE_DESC">Fecha: Recientes</option>
              <option value="DATE_ASC">Fecha: Antiguos</option>
              <option value="AMOUNT_DESC">Monto: Mayor</option>
              <option value="AMOUNT_ASC">Monto: Menor</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Lista de Transacciones ── */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-noria-muted font-[500] px-1">
          <span>Transacciones encontradas ({sortedTransactions.length})</span>
        </div>

        {sortedTransactions.length === 0 ? (
          <div className="text-center py-8 text-[12px] text-noria-muted bg-[rgba(26,26,26,0.01)] border rounded">
            No se encontraron transacciones con los filtros activos.
          </div>
        ) : (
          <div className="divide-y divide-noria-text/5 bg-transparent rounded-lg">
            {sortedTransactions.map(t => {
              const isIncome = t.type === 'IN' || t.type === 'TRANSFER_IN';
              const isTransfer = t.type.startsWith('TRANSFER_');
              const accountName = getAccountName(t.accountId);
              
              return (
                <div key={t.id} className="py-3 flex justify-between items-center hover:bg-[rgba(26,26,26,0.02)] px-2 rounded-lg transition-colors">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center space-x-2">
                      {isTransfer ? (
                        <ArrowLeftRight size={13} className="text-noria-muted flex-shrink-0" />
                      ) : isIncome ? (
                        <ArrowUpRight size={13} style={{ color: '#5C7A52' }} className="flex-shrink-0" />
                      ) : (
                        <ArrowDownRight size={13} style={{ color: '#1A1A1A' }} className="flex-shrink-0" />
                      )}
                      <span className="text-[14px] font-[400] text-noria-text truncate">
                        {t.description || (isIncome ? 'Ingreso' : 'Gasto')}
                      </span>
                    </div>
                    
                    <p className="text-[10px] text-noria-muted uppercase tracking-wider font-mono mt-0.5">
                      {new Date(t.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {` · ${accountName}`}
                      {t.pillar && (
                        <span 
                          className="ml-1.5 px-1 py-0.2 rounded text-[8px] font-[600]"
                          style={{
                            background: t.pillar === 'NEED' ? 'rgba(92,122,82,0.1)' : t.pillar === 'WANT' ? 'rgba(74,100,117,0.1)' : 'rgba(184,134,11,0.1)',
                            color: t.pillar === 'NEED' ? '#5C7A52' : t.pillar === 'WANT' ? '#4A6475' : '#B8860B'
                          }}
                        >
                          {t.pillar}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <p 
                        className="text-[14px] font-[500] font-mono"
                        style={{ color: isIncome ? '#5C7A52' : '#1A1A1A' }}
                      >
                        {isIncome ? '+' : '-'}${fmt(t.amount)}
                      </p>
                      <p className="text-[9px] text-noria-muted">{t.currency}</p>
                    </div>

                    <div className="flex space-x-1">
                      {/* Permitir editar si no es transferencia (las transferencias son complejas de editar) */}
                      {!isTransfer && (
                        <button
                          onClick={() => handleStartEdit(t)}
                          className="p-1 hover:bg-noria-text/5 rounded transition-colors text-noria-muted hover:text-noria-text"
                          title="Editar"
                        >
                          <Pencil size={12} strokeWidth={1.5} />
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteTransaction(t)}
                        className="p-1 hover:bg-[#9F2F2D]/10 rounded transition-colors text-noria-muted hover:text-[#9F2F2D]"
                        title="Eliminar"
                      >
                        <Trash2 size={12} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL EDITAR TRANSACCIÓN ── */}
      {editingTx && (
        <>
          <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40" onClick={() => setEditingTx(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up"
            style={{ background: '#F5F2ED', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)' }}>
            <form onSubmit={handleSaveEdit} className="px-6 pt-4 pb-10 space-y-4">
              <div className="flex justify-center mb-2">
                <div className="w-8 h-[3px] rounded-full" style={{ background: 'rgba(26,26,26,0.12)' }} />
              </div>

              <div className="flex justify-between items-center">
                <h4 className="text-[16px] font-[400] text-noria-text">Editar Transacción</h4>
                <button type="button" onClick={() => setEditingTx(null)}
                  className="focus:outline-none p-1" style={{ color: 'rgba(26,26,26,0.4)' }}>✕</button>
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
                    {[['NEED','Necesidad (N)','#5C7A52'],['WANT','Deseo (W)','#4A6475'],['SAVE','Ahorro (S)','#B8860B']].map(([val, label, col]) => (
                      <button key={val} type="button" onClick={() => setEditPillar(val)}
                        className="flex-1 py-2 text-[10px] font-[500] uppercase rounded border transition-all"
                        style={{
                          borderColor: editPillar === val ? col : 'rgba(26,26,26,0.10)',
                          color: editPillar === val ? col : 'rgba(26,26,26,0.35)',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 text-[13px] font-[500] uppercase tracking-wider transition-all active:scale-[0.98] rounded-[6px] mt-2"
                style={{ background: '#1A1A1A', color: '#F5F2ED' }}
              >
                Guardar Cambios
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
