import React, { useState } from 'react';
import { Landmark, Wallet, CreditCard, Archive, TrendingUp, ChevronUp, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { formatAmountWithSymbol } from '../utils/format.js';

const INSTRUMENT_TYPES = [
  { value: 'DEBIT_CARD', label: 'Tarjeta de Debito' },
  { value: 'MOBILE_PAYMENT', label: 'Pago Movil' },
  { value: 'CREDIT_CARD', label: 'Tarjeta de Credito' },
];

export default function CuentasFuentesTab({
  institutions,
  accounts,
  instruments,
  onSelectAccount,
  showArchived,
  setShowArchived,
  archivedAccounts,
  incomeSources,
  showSources = true,
  selectedAccountId = null
}) {
  const [collapsedInsts, setCollapsedInsts] = useState({});
  const [editingInstId, setEditingInstId] = useState(null);
  const [editInstName, setEditInstName] = useState('');

  const toggleInstCollapse = (id) => {
    setCollapsedInsts(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSaveInstitution = async (id) => {
    if (!editInstName.trim()) return;
    try {
      await db.institutions.update(id, { name: editInstName.trim() });
      setEditingInstId(null);
    } catch {
      alert("Error al renombrar la institución");
    }
  };

  const handleDeleteInstitution = async (id, name) => {
    if (confirm(`¿Estás seguro de eliminar la institución "${name}"?`)) {
      try {
        await db.institutions.delete(id);
      } catch {
        alert("Error al eliminar la institución");
      }
    }
  };

  const dbCurrencies = useLiveQuery(() => db.currencies.toArray()) || [];

  const formatBalance = (balance, currencyCode) => formatAmountWithSymbol(balance, currencyCode, dbCurrencies);

  const instGroups = institutions
    .map(inst => ({
      inst,
      accs: accounts.filter(a => a.institutionId === inst.id)
    }))
    .filter(g => g.accs.length > 0);

  return (
    <div className="space-y-8 pb-8">
      <div>
        {instGroups.length === 0 && archivedAccounts.length === 0 ? (
          <div className="flex flex-col items-center py-8 space-y-3 border border-[rgba(26,26,26,0.18)]">
            <div className="w-10 h-10 flex items-center justify-center">
              <Landmark size={18} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.2)' }} />
            </div>
            <p className="text-[12px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin cuentas anadidas aun</p>
          </div>
        ) : (
          <div className="space-y-6">
            {instGroups.length === 0 && (
              <p className="text-[12px] text-noria-muted text-center py-4">No hay cuentas activas.</p>
            )}

            {instGroups.map(({ inst, accs }) => {
              const totalsByCurrency = accs.reduce((totals, account) => {
                totals[account.currency] = (totals[account.currency] || 0) + account.balance;
                return totals;
              }, {});
              const balanceParts = Object.entries(totalsByCurrency)
                .map(([code, total]) => formatBalance(total, code));
              const balanceStr = balanceParts.join('  |  ') || '0.00';

              const isCollapsed = !!collapsedInsts[inst.id];

              return (
                <div key={inst.id} className="animate-fade-in group mb-4">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-[rgba(26,26,26,0.16)]">
                    <button
                      type="button"
                      onClick={() => toggleInstCollapse(inst.id)}
                      className="flex items-center space-x-2 min-w-0 text-left focus:outline-none hover:opacity-80 transition-opacity"
                    >
                      {isCollapsed ? (
                        <ChevronDown size={11} strokeWidth={2.5} className="shrink-0 text-noria-text" />
                      ) : (
                        <ChevronUp size={11} strokeWidth={2.5} className="shrink-0 text-noria-text" />
                      )}
                      <Landmark size={12} strokeWidth={1.5} className="shrink-0" style={{ color: 'rgba(26,26,26,0.35)' }} />
                      
                      {editingInstId === inst.id ? (
                        <input
                          type="text"
                          value={editInstName}
                          onChange={e => setEditInstName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveInstitution(inst.id);
                            if (e.key === 'Escape') setEditingInstId(null);
                          }}
                          className="bg-transparent border-b border-[#1A1A1A] outline-none text-[12px] font-semibold text-noria-text px-1 w-32"
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className="label-section truncate">{inst.name}</span>
                      )}
                      
                      <span className="label-section shrink-0" style={{ color: 'rgba(26,26,26,0.2)' }}>· {inst.type}</span>
                    </button>

                    <div className="flex items-center space-x-3 shrink-0">
                      {editingInstId === inst.id ? (
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleSaveInstitution(inst.id)}
                            className="p-1 text-[#5C7A52] hover:bg-[rgba(26,26,26,0.05)] text-[12px] font-bold"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingInstId(null)}
                            className="p-1 text-[#9F2F2D] hover:bg-[rgba(26,26,26,0.05)] text-[12px] font-bold"
                          >
                            ✗
                          </button>
                        </div>
                      ) : (
                        <div className="hidden group-hover:flex items-center space-x-1 animate-fade-in">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingInstId(inst.id);
                              setEditInstName(inst.name);
                            }}
                            className="p-1 text-noria-muted hover:text-noria-text focus:outline-none"
                            title="Renombrar entidad"
                          >
                            <Pencil size={11} strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInstitution(inst.id, inst.name)}
                            disabled={accs.length > 0}
                            className="p-1 text-noria-muted hover:text-[#9F2F2D] disabled:opacity-30 focus:outline-none flex-shrink-0"
                            title={accs.length > 0 ? "Tiene cuentas asociadas" : "Eliminar entidad"}
                          >
                            <Trash2 size={11} strokeWidth={1.5} />
                          </button>
                        </div>
                      )}

                      <span className="text-[11px] font-[500] font-mono" style={{ color: 'rgba(26,26,26,0.45)' }}>
                        {balanceStr}
                      </span>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="space-y-3">
                      {accs.map(acc => {
                        const accInstrs = instruments.filter(i => i.accountId === acc.id);
                        const isSelected = selectedAccountId === acc.id;
                        return (
                          <button
                            key={acc.id}
                            onClick={() => onSelectAccount(acc.id)}
                            className="w-full text-left focus:outline-none transition-colors"
                          >
                            <div
                              className="flex items-center justify-between gap-3 border border-[#1A1A1A] px-4 py-4 transition-colors hover:bg-noria-text/[0.03]"
                              style={{ borderLeftWidth: isSelected ? 6 : 1, borderLeftColor: isSelected ? '#647C78' : '#1A1A1A' }}
                            >
                              <div className="flex items-center space-x-3 min-w-0">
                                <div className="w-8 h-8 flex items-center justify-center shrink-0" style={{ color: 'rgba(26,26,26,0.46)' }}>
                                  <Wallet size={16} strokeWidth={1.5} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[15px] font-[600] text-noria-text truncate">{acc.name}</p>
                                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                                    <span className="label-section">{acc.type}</span>
                                    {accInstrs.map(instr => (
                                      <span key={instr.id} className="flex items-center space-x-1 label-section">
                                        <CreditCard size={9} strokeWidth={1.5} />
                                        <span>{instr.alias || (INSTRUMENT_TYPES.find(t => t.value === instr.type)?.label || instr.type)}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-mono text-[18px] font-[700] text-noria-text">{formatBalance(acc.balance, acc.currency)}</p>
                                <p className="label-section">{acc.currency}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {archivedAccounts.length > 0 && (
              <div className="pt-4 border-t border-[rgba(26,26,26,0.16)]">
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="w-full flex justify-between items-center focus:outline-none py-1.5"
                >
                  <span className="label-section flex items-center space-x-2" style={{ color: 'rgba(26,26,26,0.45)' }}>
                    <Archive size={12} strokeWidth={1.5} />
                    <span>Cuentas Archivadas ({archivedAccounts.length})</span>
                  </span>
                  <span className="text-[11px] font-[500]" style={{ color: 'rgba(26,26,26,0.35)' }}>
                    {showArchived ? 'Ocultar' : 'Mostrar'}
                  </span>
                </button>

                {showArchived && (
                  <div className="space-y-2 mt-3 animate-fade-in">
                    {archivedAccounts.map(acc => {
                      const inst = institutions.find(i => i.id === acc.institutionId);
                      return (
                        <button
                          key={acc.id}
                          onClick={() => onSelectAccount(acc.id)}
                          className="w-full text-left py-3 px-4 flex justify-between items-center border border-[rgba(26,26,26,0.16)] hover:bg-noria-text/[0.03] transition-colors opacity-60"
                        >
                          <div>
                            <p className="text-[14px] font-[400] text-noria-text">{acc.name}</p>
                            <p className="label-section mt-0.5">
                              {inst?.name || 'Institucion'} · {acc.type}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[14px] font-[400] text-noria-text">{formatBalance(acc.balance, acc.currency)}</p>
                            <p className="label-section">{acc.currency}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showSources && (
        <>
          <div className="h-[1px]" style={{ background: 'rgba(26,26,26,0.06)' }} />
          <div>
            {incomeSources.length === 0 ? (
              <div className="flex flex-col items-center py-8 space-y-3 border border-[rgba(26,26,26,0.18)]">
                <div className="w-10 h-10 flex items-center justify-center">
                  <TrendingUp size={18} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.2)' }} />
                </div>
                <p className="text-[12px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin fuentes de ingreso definidas</p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
