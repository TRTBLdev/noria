import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import FAB from '../components/FAB.jsx';
import { Plus, Landmark, CreditCard, Target, Trash2, ChevronRight } from 'lucide-react';

export default function AccountsScreen() {
  const [showAddAccModal, setShowAddAccModal] = useState(false);
  const [showAddMacetaModal, setShowAddMacetaModal] = useState(false);

  const [instName, setInstName] = useState('');
  const [instType, setInstType] = useState('BANK');
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState('CHECKING');
  const [accCurrency, setAccCurrency] = useState('USD');
  const [accBalance, setAccBalance] = useState('');
  const [accError, setAccError] = useState('');

  const [macetaName, setMacetaName] = useState('');
  const [macetaTarget, setMacetaTarget] = useState('');
  const [macetaCurrent, setMacetaCurrent] = useState('0');
  const [macetaError, setMacetaError] = useState('');

  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const instruments = useLiveQuery(() => db.instruments.toArray()) || [];
  const macetas = useLiveQuery(() => db.macetas.toArray()) || [];

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setAccError('');
    const bal = parseFloat(accBalance);
    if (isNaN(bal)) { setAccError('Balance inicial inválido'); return; }

    try {
      let inst = institutions.find(i => i.name.toLowerCase() === instName.trim().toLowerCase());
      const instId = inst
        ? inst.id
        : await db.institutions.add({ name: instName.trim(), type: instType, country: 'VE' });

      await db.accounts.add({
        institutionId: instId,
        name: accName.trim(),
        type: accType,
        currency: accCurrency,
        balance: bal
      });

      setShowAddAccModal(false);
      setInstName(''); setAccName(''); setAccBalance('');
    } catch (err) {
      setAccError('Error al crear la cuenta');
    }
  };

  const handleCreateMaceta = async (e) => {
    e.preventDefault();
    setMacetaError('');
    const target = parseFloat(macetaTarget);
    const current = parseFloat(macetaCurrent) || 0;
    if (isNaN(target) || target <= 0) { setMacetaError('Monto objetivo inválido'); return; }

    try {
      await db.macetas.add({
        name: macetaName.trim(),
        targetAmount: target,
        currency: 'USD',
        currentAmount: current,
        priority: 1,
        status: 'ACTIVE'
      });
      setShowAddMacetaModal(false);
      setMacetaName(''); setMacetaTarget(''); setMacetaCurrent('0');
    } catch (err) {
      setMacetaError('Error al crear la maceta');
    }
  };

  const handleDeleteAccount = async (id, name) => {
    if (!confirm(`¿Eliminar la cuenta "${name}"?`)) return;
    await db.accounts.delete(id);
  };

  const handleDeleteMaceta = async (id, name) => {
    if (!confirm(`¿Eliminar la maceta "${name}"?`)) return;
    await db.macetas.delete(id);
  };

  const fmt = (n, d = 2) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

  // Group accounts by institution
  const instGroups = institutions.map(inst => ({
    inst,
    accs: accounts.filter(a => a.institutionId === inst.id)
  })).filter(g => g.accs.length > 0);

  return (
    <div className="min-h-screen bg-noria-bg pb-32 pt-16">
      <Header title="Patrimonio" />

      <main className="px-6 max-w-md mx-auto">

        {/* Accounts Section */}
        <section className="py-6" id="accounts-section">
          <div className="flex justify-between items-center mb-4">
            <h3 className="muji-header">Cuentas</h3>
            <button id="add-account-btn" onClick={() => { setAccError(''); setShowAddAccModal(true); }}
              className="flex items-center space-x-1 text-[10px] font-light uppercase tracking-widest text-noria-salvia hover:text-noria-salvia/70 focus:outline-none">
              <Plus size={12} strokeWidth={1.5} />
              <span>Añadir</span>
            </button>
          </div>

          {instGroups.length === 0 ? (
            <p className="text-xs font-light text-noria-text/30 py-4">No hay cuentas. Toca + para agregar una.</p>
          ) : (
            instGroups.map(({ inst, accs }) => (
              <div key={inst.id} className="mb-6">
                {/* Institution header */}
                <div className="flex items-center space-x-2 mb-2 pb-2 border-b border-noria-text/8">
                  <Landmark size={12} strokeWidth={1.5} className="text-noria-text/40" />
                  <span className="text-[10px] font-light uppercase tracking-widest text-noria-text/50">{inst.name}</span>
                  <span className="text-[9px] font-light text-noria-text/25">· {inst.type}</span>
                </div>

                {/* Accounts under institution */}
                <div className="divide-y divide-noria-text/5">
                  {accs.map(acc => {
                    const accInstruments = instruments.filter(i => i.accountId === acc.id);
                    return (
                      <div key={acc.id} className="py-3" id={`account-card-${acc.id}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-light text-noria-text">{acc.name}</p>
                            <p className="text-[10px] font-light text-noria-text/35 mt-0.5">{acc.type}</p>
                          </div>
                          <div className="flex items-center space-x-4">
                            <p className="text-sm font-light text-noria-text text-right">
                              {fmt(acc.balance)} <span className="text-[10px] text-noria-text/40">{acc.currency}</span>
                            </p>
                            <button id={`delete-acc-${acc.id}`} onClick={() => handleDeleteAccount(acc.id, acc.name)}
                              className="text-noria-text/15 hover:text-noria-amber transition-colors focus:outline-none p-1">
                              <Trash2 size={13} strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>

                        {/* Instruments */}
                        {accInstruments.map(instr => (
                          <div key={instr.id} className="flex items-center space-x-1.5 mt-1.5 pl-2">
                            <CreditCard size={10} strokeWidth={1.5} className="text-noria-text/25" />
                            <span className="text-[10px] font-light text-noria-text/35">{instr.alias || instr.type}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>

        <div className="border-t border-noria-text/8" />

        {/* Macetas Section */}
        <section className="py-6" id="macetas-section">
          <div className="flex justify-between items-center mb-4">
            <h3 className="muji-header">Macetas</h3>
            <button id="add-maceta-btn" onClick={() => { setMacetaError(''); setShowAddMacetaModal(true); }}
              className="flex items-center space-x-1 text-[10px] font-light uppercase tracking-widest text-noria-salvia hover:text-noria-salvia/70 focus:outline-none">
              <Plus size={12} strokeWidth={1.5} />
              <span>Nueva Meta</span>
            </button>
          </div>

          {macetas.length === 0 ? (
            <p className="text-xs font-light text-noria-text/30 py-4">No tienes metas de ahorro activas.</p>
          ) : (
            <div className="divide-y divide-noria-text/5">
              {macetas.map(maceta => {
                const current = maceta.currentAmount || 0;
                const pct = Math.min(100, (current / maceta.targetAmount) * 100);
                return (
                  <div key={maceta.id} className="py-4" id={`maceta-card-${maceta.id}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <Target size={14} strokeWidth={1.5} className="text-noria-salvia flex-shrink-0" />
                        <p className="text-sm font-light text-noria-text">{maceta.name}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <p className="text-xs font-light text-noria-text/50 text-right">
                          {fmt(current, 0)} / {fmt(maceta.targetAmount, 0)} {maceta.currency}
                        </p>
                        <button id={`delete-maceta-${maceta.id}`} onClick={() => handleDeleteMaceta(maceta.id, maceta.name)}
                          className="text-noria-text/15 hover:text-noria-amber transition-colors focus:outline-none p-1">
                          <Trash2 size={13} strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-[2px] bg-noria-text/8 rounded-full overflow-hidden mt-1">
                      <div className="bg-noria-salvia h-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[9px] font-light text-noria-text/30 mt-1 text-right">{pct.toFixed(0)}%</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Add Account Panel */}
      {showAddAccModal && (
        <>
          <div className="fixed inset-0 bg-noria-text/10 z-40" onClick={() => setShowAddAccModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-noria-bg border-t border-noria-text/8 z-50 max-w-md mx-auto animate-slide-up">
            <form onSubmit={handleCreateAccount} className="px-6 pt-6 pb-10 space-y-4" id="add-account-form">
              <div className="flex justify-between items-center">
                <h4 className="muji-header">Nueva Cuenta</h4>
                <button type="button" id="close-add-acc-modal" onClick={() => setShowAddAccModal(false)}
                  className="text-noria-text/40 hover:text-noria-text text-sm focus:outline-none">✕</button>
              </div>

              <div>
                <label className="muji-header block mb-1">Institución</label>
                <input id="inst-name" type="text" value={instName}
                  onChange={e => setInstName(e.target.value)}
                  placeholder="Ej. Banesco, Zinli, Binance" className="muji-input" required />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="muji-header block mb-1">Tipo Institución</label>
                  <select id="inst-type" value={instType} onChange={e => setInstType(e.target.value)} className="muji-input">
                    <option value="BANK">Banco</option>
                    <option value="NEOBANK">Banco Digital</option>
                    <option value="EXCHANGE">Exchange</option>
                    <option value="HOT_WALLET">Hot Wallet</option>
                    <option value="COLD_WALLET">Cold Wallet</option>
                    <option value="CASH">Efectivo</option>
                  </select>
                </div>
                <div>
                  <label className="muji-header block mb-1">Tipo Cuenta</label>
                  <select id="acc-type" value={accType} onChange={e => setAccType(e.target.value)} className="muji-input">
                    <option value="CHECKING">Corriente</option>
                    <option value="SAVINGS">Ahorro</option>
                    <option value="WALLET">Wallet Digital</option>
                    <option value="CRYPTO_SPOT">Spot / Exchange</option>
                    <option value="CASH">Efectivo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="muji-header block mb-1">Nombre Cuenta</label>
                  <input id="acc-name" type="text" value={accName} onChange={e => setAccName(e.target.value)}
                    placeholder="Ej. Cuenta USD" className="muji-input" required />
                </div>
                <div>
                  <label className="muji-header block mb-1">Divisa</label>
                  <select id="acc-currency" value={accCurrency} onChange={e => setAccCurrency(e.target.value)} className="muji-input">
                    <option value="USD">USD</option>
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="muji-header block mb-1">Saldo Inicial</label>
                <input id="acc-balance" type="number" step="0.01" inputMode="decimal"
                  value={accBalance} onChange={e => setAccBalance(e.target.value)}
                  placeholder="0.00" className="muji-input" required />
              </div>

              {accError && <p className="text-xs text-noria-amber font-light" id="add-acc-error">{accError}</p>}

              <button id="submit-new-acc-btn" type="submit"
                className="w-full py-3 border-t border-noria-text/8 text-xs font-light uppercase tracking-widest text-noria-salvia hover:text-noria-salvia/70 transition-colors mt-2">
                Crear Cuenta
              </button>
            </form>
          </div>
        </>
      )}

      {/* Add Maceta Panel */}
      {showAddMacetaModal && (
        <>
          <div className="fixed inset-0 bg-noria-text/10 z-40" onClick={() => setShowAddMacetaModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-noria-bg border-t border-noria-text/8 z-50 max-w-md mx-auto animate-slide-up">
            <form onSubmit={handleCreateMaceta} className="px-6 pt-6 pb-10 space-y-4" id="add-maceta-form">
              <div className="flex justify-between items-center">
                <h4 className="muji-header">Nueva Meta</h4>
                <button type="button" id="close-add-maceta-modal" onClick={() => setShowAddMacetaModal(false)}
                  className="text-noria-text/40 hover:text-noria-text text-sm focus:outline-none">✕</button>
              </div>

              <div>
                <label className="muji-header block mb-1">Nombre de la Meta</label>
                <input id="maceta-name" type="text" value={macetaName} onChange={e => setMacetaName(e.target.value)}
                  placeholder="Ej. Fondo de Emergencia" className="muji-input" required />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="muji-header block mb-1">Objetivo (USD)</label>
                  <input id="maceta-target" type="number" step="1" value={macetaTarget}
                    onChange={e => setMacetaTarget(e.target.value)} placeholder="1000" className="muji-input" required />
                </div>
                <div>
                  <label className="muji-header block mb-1">Ahorro Inicial</label>
                  <input id="maceta-current" type="number" step="1" value={macetaCurrent}
                    onChange={e => setMacetaCurrent(e.target.value)} className="muji-input" />
                </div>
              </div>

              {macetaError && <p className="text-xs text-noria-amber font-light" id="add-maceta-error">{macetaError}</p>}

              <button id="submit-new-maceta-btn" type="submit"
                className="w-full py-3 border-t border-noria-text/8 text-xs font-light uppercase tracking-widest text-noria-salvia hover:text-noria-salvia/70 transition-colors mt-2">
                Crear Meta
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
