import React from 'react';
import { Landmark, Wallet, CreditCard, Archive, Trash2, TrendingUp, Plus } from 'lucide-react';

const INSTRUMENT_TYPES = [
  { value: 'DEBIT_CARD', label: 'Tarjeta de Débito' },
  { value: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
  { value: 'CREDIT_CARD', label: 'Tarjeta de Crédito' },
];

export default function CuentasFuentesTab({
  institutions,
  accounts,
  instruments,
  onSelectAccount,
  onAddAccount,
  showArchived,
  setShowArchived,
  archivedAccounts,
  incomeSources,
  onAddSource,
  onDeleteSource
}) {

  const fmt = (n) => {
    if (typeof n !== 'number') return '0.00';
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2 });
  };

  const instGroups = institutions
    .map(inst => ({
      inst,
      accs: accounts.filter(a => a.institutionId === inst.id)
    }))
    .filter(g => g.accs.length > 0);

  return (
    <div className="space-y-8 pb-8">
      {/* ── SECCIÓN CUENTAS ── */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-[12px] font-[600] uppercase tracking-wider text-noria-text opacity-40">Cuentas</h4>
          {instGroups.length > 0 && (
            <button
              onClick={onAddAccount}
              className="text-[11px] font-[500] uppercase tracking-wider flex items-center space-x-1"
              style={{ color: '#5C7A52' }}
            >
              <Plus size={10} />
              <span>Añadir</span>
            </button>
          )}
        </div>

        {instGroups.length === 0 && archivedAccounts.length === 0 ? (
          <div className="flex flex-col items-center py-8 space-y-3" style={{ background: 'rgba(26,26,26,0.01)', border: '1px dashed rgba(26,26,26,0.08)', borderRadius: '8px' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(26,26,26,0.04)' }}>
              <Landmark size={18} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.2)' }} />
            </div>
            <p className="text-[12px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin cuentas añadidas aún</p>
            <button onClick={onAddAccount} className="text-[11px] font-[500] uppercase tracking-wider underline underline-offset-2 focus:outline-none" style={{ color: '#5C7A52' }}>
              Añadir cuenta
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {instGroups.length === 0 && (
              <p className="text-[12px] text-noria-muted text-center py-4">No hay cuentas activas.</p>
            )}

            {instGroups.map(({ inst, accs }) => {
              const totalUSD = accs.filter(a => a.currency === 'USD').reduce((sum, a) => sum + a.balance, 0);
              const totalUSDT = accs.filter(a => a.currency === 'USDT').reduce((sum, a) => sum + a.balance, 0);
              const totalUSDC = accs.filter(a => a.currency === 'USDC').reduce((sum, a) => sum + a.balance, 0);

              const balanceStr = [
                totalUSD > 0 ? `$${fmt(totalUSD, 0)}` : '',
                totalUSDT > 0 ? `${fmt(totalUSDT, 0)} USDT` : '',
                totalUSDC > 0 ? `${fmt(totalUSDC, 0)} USDC` : ''
              ].filter(Boolean).join('  |  ') || '$0.00';

              return (
                <div key={inst.id} className="animate-fade-in">
                  <div className="flex justify-between items-baseline mb-2 pb-2 border-b border-[rgba(0,0,0,0.07)]">
                    <div className="flex items-center space-x-2">
                      <Landmark size={12} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.35)' }} />
                      <span className="label-section">{inst.name}</span>
                      <span className="label-section" style={{ color: 'rgba(26,26,26,0.2)' }}>· {inst.type}</span>
                    </div>
                    <span className="text-[11px] font-[500]" style={{ color: 'rgba(26,26,26,0.45)' }}>
                      {balanceStr}
                    </span>
                  </div>

                  <div className="divide-y divide-noria-text/5">
                    {accs.map(acc => {
                      const accInstrs = instruments.filter(i => i.accountId === acc.id);
                      return (
                        <button
                          key={acc.id}
                          onClick={() => onSelectAccount(acc.id)}
                          className="w-full text-left focus:outline-none transition-colors"
                        >
                          <div className="noria-row hover:bg-noria-text/2 px-2 -mx-2 rounded transition-colors">
                            <div className="flex items-center space-x-3">
                              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(26,26,26,0.04)', color: 'rgba(26,26,26,0.3)' }}>
                                <Wallet size={16} strokeWidth={1.5} />
                              </div>
                              <div>
                                <p className="text-[15px] font-[400] text-noria-text">{acc.name}</p>
                                <div className="flex items-center space-x-2 mt-0.5">
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
                            <div className="text-right">
                              <p className="text-[15px] font-[400] text-noria-text">${fmt(acc.balance)}</p>
                              <p className="label-section">{acc.currency}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Cuentas Archivadas */}
            {archivedAccounts.length > 0 && (
              <div className="pt-4 border-t border-[rgba(0,0,0,0.07)]">
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
                  <div className="divide-y divide-noria-text/5 mt-2 animate-fade-in">
                    {archivedAccounts.map(acc => {
                      const inst = institutions.find(i => i.id === acc.institutionId);
                      return (
                        <button
                          key={acc.id}
                          onClick={() => onSelectAccount(acc.id)}
                          className="w-full text-left py-2.5 flex justify-between items-center hover:bg-noria-text/2 px-2 -mx-2 rounded transition-colors opacity-60"
                        >
                          <div>
                            <p className="text-[14px] font-[400] text-noria-text">{acc.name}</p>
                            <p className="label-section mt-0.5">
                              {inst?.name || 'Institución'} · {acc.type}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[14px] font-[400] text-noria-text">${fmt(acc.balance)}</p>
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

      <div className="h-[1px]" style={{ background: 'rgba(26,26,26,0.06)' }} />

      {/* ── SECCIÓN FUENTES DE INGRESO ── */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-[12px] font-[600] uppercase tracking-wider text-noria-text opacity-40">Fuentes de Ingreso</h4>
          {incomeSources.length > 0 && (
            <button
              onClick={onAddSource}
              className="text-[11px] font-[500] uppercase tracking-wider flex items-center space-x-1"
              style={{ color: '#5C7A52' }}
            >
              <Plus size={10} />
              <span>Añadir</span>
            </button>
          )}
        </div>

        {incomeSources.length === 0 ? (
          <div className="flex flex-col items-center py-8 space-y-3" style={{ background: 'rgba(26,26,26,0.01)', border: '1px dashed rgba(26,26,26,0.08)', borderRadius: '8px' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(26,26,26,0.04)' }}>
              <TrendingUp size={18} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.2)' }} />
            </div>
            <p className="text-[12px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin fuentes de ingreso definidas</p>
            <button onClick={onAddSource} className="text-[11px] font-[500] uppercase tracking-wider underline underline-offset-2 focus:outline-none" style={{ color: '#5C7A52' }}>
              Añadir fuente
            </button>
          </div>
        ) : (
          <div className="divide-y divide-noria-text/5 animate-fade-in">
            {incomeSources.map(src => (
              <div key={src.id} className="noria-row py-3" id={`source-row-${src.id}`}>
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[15px]" style={{ background: 'rgba(92,122,82,0.08)' }}>
                    {(() => {
                      switch (src.type) {
                        case 'SALARY': return '💼';
                        case 'FREELANCE': return '💻';
                        case 'INVESTMENT': return '📈';
                        case 'GIFT': return '🎁';
                        case 'BUSINESS': return '🏪';
                        default: return '💰';
                      }
                    })()}
                  </div>
                  <div>
                    <p className="text-[15px] font-[400] text-noria-text">{src.name}</p>
                    <p className="text-[10px] text-noria-muted uppercase tracking-wider font-[500] mt-0.5">
                      {(() => {
                        switch (src.type) {
                          case 'SALARY': return 'Salario / Empleo';
                          case 'FREELANCE': return 'Freelance / Servicios';
                          case 'INVESTMENT': return 'Inversiones / Dividendos';
                          case 'GIFT': return 'Regalos / Bonos';
                          case 'BUSINESS': return 'Ventas / Negocio';
                          default: return 'Otro';
                        }
                      })()}
                    </p>
                  </div>
                </div>
                <button onClick={() => onDeleteSource(src.id, src.name)} className="p-2 focus:outline-none hover:bg-noria-text/5 rounded transition-colors" style={{ color: 'rgba(26,26,26,0.2)' }}>
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
