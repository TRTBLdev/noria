import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import FAB from '../components/FAB.jsx';
import { Plus, Landmark, CreditCard, Target, Trash2, Pencil, Wallet, TrendingUp, X, Check, Archive, ArrowUpRight, ArrowDownLeft, Eye, ArchiveRestore } from 'lucide-react';

const TABS = ['Cuentas', 'Macetas', 'Ingresos'];

// Map parameters for readable instrument types
const INSTRUMENT_TYPES = [
  { value: 'DEBIT_CARD', label: 'Tarjeta de Débito' },
  { value: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
  { value: 'CREDIT_CARD', label: 'Tarjeta de Crédito' },
  { value: 'WIRE_TRANSFER', label: 'Transferencia Bancaria' },
  { value: 'CASH', label: 'Efectivo / Físico' }
];

const fmt = (n, d = 2) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

/* ── SUB-COMPONENTE: Listado / Editor de Instrumentos (Reutilizable) ── */
function InstrumentListEditor({ instrumentsList, setInstrumentsList }) {
  const addInstrument = () => {
    setInstrumentsList(prev => [...prev, { id: Date.now(), type: 'DEBIT_CARD', alias: '' }]);
  };

  const removeInstrument = (id) => {
    setInstrumentsList(prev => prev.filter(item => item.id !== id));
  };

  const updateInstrument = (id, field, value) => {
    setInstrumentsList(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="flex justify-between items-center">
        <label className="muji-header">Instrumentos de Pago</label>
        <button
          type="button"
          onClick={addInstrument}
          className="text-[10px] font-[500] uppercase tracking-wider text-[#5C7A52] focus:outline-none flex items-center space-x-1"
        >
          <Plus size={10} />
          <span>Añadir</span>
        </button>
      </div>

      {instrumentsList.length === 0 ? (
        <p className="text-[11px] text-noria-muted italic">Sin instrumentos asociados (ej. tarjetas, pago móvil).</p>
      ) : (
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
          {instrumentsList.map(inst => (
            <div key={inst.id} className="flex items-center space-x-2 border border-[rgba(0,0,0,0.06)] p-2 rounded bg-transparent">
              <select
                value={inst.type}
                onChange={e => updateInstrument(inst.id, 'type', e.target.value)}
                className="bg-transparent text-[12px] text-noria-text outline-none flex-1 max-w-[120px]"
              >
                {INSTRUMENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              <input
                type="text"
                value={inst.alias}
                onChange={e => updateInstrument(inst.id, 'alias', e.target.value)}
                placeholder="Alias (ej. Zinli Visa)"
                className="bg-transparent text-[12px] text-noria-text outline-none flex-1 border-b border-transparent focus:border-[#5C7A52] px-1"
              />

              <button
                type="button"
                onClick={() => removeInstrument(inst.id)}
                className="text-[#9F2F2D] p-1 focus:outline-none"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── SUB-COMPONENTE: Formulario Modal para CREAR Cuenta ── */
function AddAccountModal({ onClose, institutions, onCreated }) {
  const [accBalance, setAccBalance] = useState('');
  const [accCurrency, setAccCurrency] = useState('USD');
  const [accType, setAccType] = useState('CHECKING');

  // Select de institución: puede ser ID de una existente o "new"
  const [selectedInstOption, setSelectedInstOption] = useState('');
  const [newInstName, setNewInstName] = useState('');
  const [instType, setInstType] = useState('BANK'); // Tipo de la institución

  // Listado de instrumentos locales
  const [instrumentsList, setInstrumentsList] = useState([]);
  const [error, setError] = useState('');

  // Sync default institution option
  useEffect(() => {
    if (institutions.length > 0 && !selectedInstOption) {
      setSelectedInstOption(institutions[0].id.toString());
    } else if (institutions.length === 0) {
      setSelectedInstOption('new');
    }
  }, [institutions]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const bal = parseFloat(accBalance);
    if (isNaN(bal)) { setError('Balance inicial inválido'); return; }

    try {
      let finalInstId;
      let instNameValue = '';
      if (selectedInstOption === 'new') {
        if (!newInstName.trim()) { setError('Escribe el nombre de la nueva institución'); return; }
        // Create new institution
        instNameValue = newInstName.trim();
        finalInstId = await db.institutions.add({
          name: instNameValue,
          type: instType,
          country: 'VE'
        });
      } else {
        if (!selectedInstOption) { setError('Selecciona una institución'); return; }
        finalInstId = parseInt(selectedInstOption);
        const existingInst = institutions.find(i => i.id === finalInstId);
        instNameValue = existingInst ? existingInst.name : 'Cuenta';
      }

      const accountId = await db.accounts.add({
        institutionId: finalInstId,
        name: instNameValue,
        type: accType,
        currency: accCurrency,
        balance: bal,
        isArchived: false
      });

      // Guardar instrumentos asociados
      for (const inst of instrumentsList) {
        await db.instruments.add({
          accountId,
          type: inst.type,
          alias: inst.alias.trim(),
          status: 'ACTIVE'
        });
      }

      onCreated();
    } catch {
      setError('Error al crear la cuenta');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-45 animate-fade-in" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up overflow-y-auto"
        style={{ background: '#F5F2ED', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)', maxHeight: '92vh' }}>
        <form onSubmit={handleSubmit} className="px-6 pt-4 pb-10 space-y-4" id="add-account-form">
          <div className="flex justify-center mb-2">
            <div className="w-8 h-[3px] rounded-full bg-[rgba(26,26,26,0.12)]" />
          </div>
          <div className="flex justify-between items-center">
            <h4 className="text-[16px] font-[400] text-noria-text">Nueva Cuenta</h4>
            <button type="button" onClick={onClose}
              className="focus:outline-none p-1 text-noria-muted hover:text-noria-text">✕</button>
          </div>


          {/* Selector de Institución Integrado */}
          <div>
            <label className="muji-header block mb-1">Institución</label>
            <select
              value={selectedInstOption}
              onChange={e => setSelectedInstOption(e.target.value)}
              className="muji-input"
              required
            >
              {institutions.map(i => (
                <option key={i.id} value={i.id.toString()}>{i.name}</option>
              ))}
              <option value="new">+ Crear nueva institución...</option>
            </select>
          </div>

          {selectedInstOption === 'new' && (
            <div className="space-y-3 p-3 bg-[rgba(26,26,26,0.02)] border border-[rgba(0,0,0,0.05)] rounded animate-fade-in">
              <div>
                <label className="muji-header block mb-1">Nombre de la Institución</label>
                <input
                  type="text"
                  value={newInstName}
                  onChange={e => setNewInstName(e.target.value)}
                  placeholder="Ej. Banesco, Zinli"
                  className="muji-input bg-transparent"
                  required
                />
              </div>
            </div>
          )}

          {/* Tipo de Institución (Siempre visible, genérico) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="muji-header block mb-1">Tipo de Institución</label>
              <select value={instType} onChange={e => setInstType(e.target.value)} className="muji-input">
                <option value="BANK">Banco</option>
                <option value="NEOBANK">Banco Digital</option>
                <option value="EXCHANGE">Exchange</option>
                <option value="HOT_WALLET">Hot Wallet</option>
                <option value="COLD_WALLET">Cold Wallet</option>
                <option value="CASH">Efectivo</option>
              </select>
            </div>

            <div>
              <label className="muji-header block mb-1">Tipo de Cuenta</label>
              <select value={accType} onChange={e => setAccType(e.target.value)} className="muji-input">
                <option value="CHECKING">Corriente</option>
                <option value="SAVINGS">Ahorro</option>
                <option value="WALLET">Wallet Digital</option>
                <option value="CRYPTO_SPOT">Spot / Exchange</option>
                <option value="CRYPTO_FUND">Funding / Exchange</option>
                <option value="CASH">Efectivo</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-1">
              <label className="muji-header block mb-1">Divisa</label>
              <select value={accCurrency} onChange={e => setAccCurrency(e.target.value)} className="muji-input">
                <option value="USD">USD</option>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
            </div>

            <div className="col-span-1">
              <label className="muji-header block mb-1">Saldo Inicial</label>
              <input type="number" step="0.01" inputMode="decimal"
                value={accBalance} onChange={e => setAccBalance(e.target.value)}
                placeholder="0.00" className="muji-input" required />
            </div>
          </div>

          {/* Instrumentos Asociados */}
          <InstrumentListEditor
            instrumentsList={instrumentsList}
            setInstrumentsList={setInstrumentsList}
          />

          {error && <p className="text-[12px] font-[500]" style={{ color: '#B8860B' }}>{error}</p>}

          <button type="submit"
            className="w-full py-3.5 text-[13px] font-[500] uppercase tracking-wider rounded-[6px] mt-2 active:scale-[0.98] transition-all"
            style={{ background: '#1A1A1A', color: '#F5F2ED' }}>
            Crear Cuenta
          </button>
        </form>
      </div>
    </>
  );
}

/* ── SUB-COMPONENTE: Formulario para EDITAR Cuenta ── */
function EditAccountForm({ account, institutions, onUpdated, onCancel }) {
  const [accBalance, setAccBalance] = useState(account.balance.toString());
  const [accCurrency, setAccCurrency] = useState(account.currency);
  const [accType, setAccType] = useState(account.type);

  const [selectedInstOption, setSelectedInstOption] = useState(account.institutionId.toString());
  const [newInstName, setNewInstName] = useState('');
  const [instType, setInstType] = useState('BANK');
  const [instrumentsList, setInstrumentsList] = useState([]);
  const [error, setError] = useState('');

  // Fetch associated instruments on load
  useEffect(() => {
    const fetchInstruments = async () => {
      const data = await db.instruments.where('accountId').equals(account.id).toArray();
      setInstrumentsList(data.map(i => ({ id: i.id, type: i.type, alias: i.alias })));
    };
    fetchInstruments();

    const fetchInstDetails = async () => {
      const inst = await db.institutions.get(account.institutionId);
      if (inst) setInstType(inst.type);
    };
    fetchInstDetails();
  }, [account]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const bal = parseFloat(accBalance);
    if (isNaN(bal)) { setError('Balance inválido'); return; }

    try {
      let finalInstId;
      let instNameValue = '';
      if (selectedInstOption === 'new') {
        if (!newInstName.trim()) { setError('Escribe el nombre de la nueva institución'); return; }
        instNameValue = newInstName.trim();
        finalInstId = await db.institutions.add({
          name: instNameValue,
          type: instType,
          country: 'VE'
        });
      } else {
        finalInstId = parseInt(selectedInstOption);
        const existingInst = institutions.find(i => i.id === finalInstId);
        instNameValue = existingInst ? existingInst.name : 'Cuenta';
        // También podemos actualizar el tipo de la institución existente si cambió
        await db.institutions.update(finalInstId, { type: instType });
      }

      await db.accounts.update(account.id, {
        institutionId: finalInstId,
        name: instNameValue,
        type: accType,
        currency: accCurrency,
        balance: bal
      });

      // Actualizar instrumentos (borrado e inserción limpia)
      await db.instruments.where('accountId').equals(account.id).delete();
      for (const inst of instrumentsList) {
        await db.instruments.add({
          accountId: account.id,
          type: inst.type,
          alias: inst.alias.trim(),
          status: 'ACTIVE'
        });
      }

      onUpdated();
    } catch {
      setError('Error al actualizar la cuenta');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in" id="edit-account-form">


      <div>
        <label className="muji-header block mb-1">Institución</label>
        <select
          value={selectedInstOption}
          onChange={e => setSelectedInstOption(e.target.value)}
          className="muji-input"
          required
        >
          {institutions.map(i => (
            <option key={i.id} value={i.id.toString()}>{i.name}</option>
          ))}
          <option value="new">+ Crear nueva institución...</option>
        </select>
      </div>

      {selectedInstOption === 'new' && (
        <div className="space-y-3 p-3 bg-[rgba(26,26,26,0.02)] border border-[rgba(0,0,0,0.05)] rounded animate-fade-in">
          <div>
            <label className="muji-header block mb-1">Nombre de la Institución</label>
            <input
              type="text"
              value={newInstName}
              onChange={e => setNewInstName(e.target.value)}
              placeholder="Ej. Banesco, Zinli"
              className="muji-input bg-transparent"
              required
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="muji-header block mb-1">Tipo de Institución</label>
          <select value={instType} onChange={e => setInstType(e.target.value)} className="muji-input">
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
          <select value={accType} onChange={e => setAccType(e.target.value)} className="muji-input">
            <option value="CHECKING">Corriente</option>
            <option value="SAVINGS">Ahorro</option>
            <option value="WALLET">Wallet Digital</option>
            <option value="CRYPTO_SPOT">Spot / Exchange</option>
            <option value="CRYPTO_FUND">Funding / Exchange</option>
            <option value="CASH">Efectivo</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="muji-header block mb-1">Divisa</label>
          <select value={accCurrency} onChange={e => setAccCurrency(e.target.value)} className="muji-input">
            <option value="USD">USD</option>
            <option value="USDT">USDT</option>
            <option value="USDC">USDC</option>
          </select>
        </div>

        <div>
          <label className="muji-header block mb-1">Saldo</label>
          <input type="number" step="0.01" inputMode="decimal"
            value={accBalance} onChange={e => setAccBalance(e.target.value)}
            className="muji-input" required />
        </div>
      </div>

      {/* Instrumentos Asociados */}
      <InstrumentListEditor
        instrumentsList={instrumentsList}
        setInstrumentsList={setInstrumentsList}
      />

      {error && <p className="text-[12px] font-[500]" style={{ color: '#B8860B' }}>{error}</p>}

      <div className="flex space-x-2 pt-4">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2 text-[12px] font-[500] uppercase tracking-wider border border-[rgba(26,26,26,0.15)] rounded-[6px]">
          Atrás
        </button>
        <button type="submit"
          className="flex-1 py-2 text-[12px] font-[500] uppercase tracking-wider rounded-[6px]"
          style={{ background: '#1A1A1A', color: '#F5F2ED' }}>
          Guardar
        </button>
      </div>
    </form>
  );
}

/* ── Sección: Cuentas Listado Tab ── */
function CuentasTab({ institutions, accounts, instruments, onSelectAccount, onAddAccount, showArchived, setShowArchived, archivedAccounts }) {
  const instGroups = institutions
    .map(inst => ({
      inst,
      accs: accounts.filter(a => a.institutionId === inst.id)
    }))
    .filter(g => g.accs.length > 0);

  if (instGroups.length === 0 && archivedAccounts.length === 0) return (
    <div className="flex flex-col items-center py-12 space-y-3" id="accounts-empty">
      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(26,26,26,0.05)' }}>
        <Landmark size={20} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.2)' }} />
      </div>
      <p className="text-[13px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin cuentas añadidas aún</p>
      <button onClick={onAddAccount} className="text-[12px] font-[500] uppercase tracking-wider underline underline-offset-2 focus:outline-none" style={{ color: '#5C7A52' }}>
        Añadir cuenta
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {instGroups.length === 0 && (
        <p className="text-[13px] text-noria-muted text-center py-4">No hay cuentas activas.</p>
      )}

      {instGroups.map(({ inst, accs }) => {
        // Sum balances per institution
        const totalUSD = accs.filter(a => a.currency === 'USD').reduce((sum, a) => sum + a.balance, 0);
        const totalUSDT = accs.filter(a => a.currency === 'USDT').reduce((sum, a) => sum + a.balance, 0);
        const totalUSDC = accs.filter(a => a.currency === 'USDC').reduce((sum, a) => sum + a.balance, 0);

        const balanceStr = [
          totalUSD > 0 ? `$${fmt(totalUSD, 0)}` : '',
          totalUSDT > 0 ? `${fmt(totalUSDT, 0)} USDT` : '',
          totalUSDC > 0 ? `${fmt(totalUSDC, 0)} USDC` : ''
        ].filter(Boolean).join('  |  ') || '$0.00';

        return (
          <div key={inst.id} id={`inst-group-${inst.id}`} className="animate-fade-in">
            {/* Institution header with aggregated totals */}
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

            {/* Accounts under institution */}
            <div className="divide-y divide-noria-text/5">
              {accs.map(acc => {
                const accInstrs = instruments.filter(i => i.accountId === acc.id);
                return (
                  <button
                    key={acc.id}
                    onClick={() => onSelectAccount(acc.id)}
                    className="w-full text-left focus:outline-none transition-colors"
                  >
                    <div className="noria-row hover:bg-noria-text/2 px-2 -mx-2 rounded transition-colors" id={`account-row-${acc.id}`}>
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

      {/* ── Archivadas Collapsible Section ── */}
      {archivedAccounts.length > 0 && (
        <div className="pt-6 border-t border-[rgba(0,0,0,0.07)]">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="w-full flex justify-between items-center focus:outline-none py-2"
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
            <div className="divide-y divide-noria-text/5 mt-3 animate-fade-in" id="archived-accounts-list">
              {archivedAccounts.map(acc => {
                const inst = institutions.find(i => i.id === acc.institutionId);
                return (
                  <button
                    key={acc.id}
                    onClick={() => onSelectAccount(acc.id)}
                    className="w-full text-left py-3 flex justify-between items-center hover:bg-noria-text/2 px-2 -mx-2 rounded transition-colors opacity-60"
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
  );
}

/* ── Sección: Macetas Tab ── */
function MacetasTab({ macetas, accounts, macetaAllocations, onAddMaceta, onDeleteMaceta, onDistribute, onProgramSavings }) {
  if (macetas.length === 0) return (
    <div className="flex flex-col items-center py-12 space-y-3" id="macetas-empty">
      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(26,26,26,0.05)' }}>
        <Target size={20} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.2)' }} />
      </div>
      <p className="text-[13px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin metas de ahorro activas</p>
      <button onClick={onAddMaceta} className="text-[12px] font-[500] uppercase tracking-wider underline underline-offset-2 focus:outline-none" style={{ color: '#5C7A52' }}>
        Crear primera meta
      </button>
    </div>
  );

  const getMonthsRemaining = (targetDateStr) => {
    if (!targetDateStr) return 1;
    const now = new Date();
    const target = new Date(targetDateStr + '-15');
    const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    return Math.max(1, months);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {macetas.map(m => {
        const current = m.currentAmount || 0;
        const pct = Math.min(100, m.targetAmount > 0 ? (current / m.targetAmount) * 100 : 0);
        
        // Bloques unicode de progreso
        const filledBlocks = Math.round(pct / 10);
        const emptyBlocks = 10 - filledBlocks;
        const progressStr = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

        // Obtener asignaciones de esta maceta
        const allocations = macetaAllocations.filter(a => a.macetaId === m.id);

        // Calcular aporte mensual sugerido
        const monthsRemaining = getMonthsRemaining(m.targetDate);
        const suggestedAmount = Math.max(0, m.targetAmount - current) / monthsRemaining;

        return (
          <div key={m.id} className="border border-[rgba(0,0,0,0.07)] rounded-[8px] p-5 space-y-4 bg-transparent" id={`maceta-${m.id}`}>
            
            {/* Header: Title and Delete */}
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-2">
                <Target size={14} strokeWidth={1.8} style={{ color: '#5C7A52' }} />
                <p className="text-[15px] font-[500] text-noria-text">{m.name}</p>
              </div>
              <button onClick={() => onDeleteMaceta(m.id, m.name)} className="p-1 focus:outline-none text-noria-muted hover:text-[#9F2F2D]" title="Eliminar Meta">
                <Trash2 size={13} strokeWidth={1.5} />
              </button>
            </div>

            {/* Progreso visual en unicode */}
            <div className="space-y-1">
              <p className="text-[11px] font-[500] text-noria-text/60 uppercase tracking-wider">Progreso</p>
              <div className="font-mono text-[12px] text-noria-text flex items-center space-x-2">
                <span className="text-[#5C7A52] tracking-normal">{progressStr}</span>
                <span className="font-[500]">{pct.toFixed(0)}%</span>
                <span className="text-noria-muted">(${fmt(current, 0)} / ${fmt(m.targetAmount, 0)})</span>
              </div>
            </div>

            {/* Distribución de Cuentas */}
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-[500] text-noria-text/60 uppercase tracking-wider flex items-center space-x-1">
                <span>💰 Distribución:</span>
              </p>
              {allocations.length === 0 ? (
                <p className="text-[11px] text-noria-muted italic pl-3">Sin fondos asignados de ninguna cuenta</p>
              ) : (
                <div className="font-mono text-[12px] text-noria-text pl-2 space-y-0.5">
                  {allocations.map((alloc, idx) => {
                    const acc = accounts.find(a => a.id === alloc.accountId);
                    const prefix = idx === allocations.length - 1 ? '└─ ' : '├─ ';
                    return (
                      <div key={alloc.id} className="flex items-center justify-between">
                        <span>{prefix}{acc ? acc.name : 'Cuenta Desconocida'}</span>
                        <span className="font-[500]">${fmt(alloc.amount, 0)} <span className="text-[#5C7A52]">✓</span></span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Aporte mensual sugerido y Fecha */}
            <div className="pt-2 border-t border-[rgba(0,0,0,0.05)] flex flex-wrap justify-between items-baseline gap-2">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-[11px] font-[500] text-noria-text/60 uppercase tracking-wider">📊 Aporte sugerido:</span>
                <span className="text-[13px] font-[500] text-[#5C7A52] font-mono">${fmt(suggestedAmount)}/mes</span>
              </div>
              {m.targetDate && (
                <span className="text-[10px] text-noria-muted uppercase tracking-wider font-[500]">
                  Meta: {new Date(m.targetDate + '-15').toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }).toUpperCase()} ({monthsRemaining} {monthsRemaining === 1 ? 'mes' : 'meses'})
                </span>
              )}
            </div>

            {/* Botones de acción inferior */}
            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => onDistribute(m)}
                className="flex-1 py-2 text-[10px] font-[600] uppercase tracking-wider border border-[rgba(26,26,26,0.15)] rounded hover:bg-noria-text/5 active:scale-[0.98] transition-all focus:outline-none text-noria-text"
              >
                Distribuir Fondos
              </button>
              {suggestedAmount > 0 && (
                <button
                  onClick={() => onProgramSavings(m, suggestedAmount)}
                  className="flex-1 py-2 text-[10px] font-[600] uppercase tracking-wider rounded bg-noria-text text-noria-bg hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none"
                >
                  Programar Ahorro
                </button>
              )}
            </div>

          </div>
        );
      })}
    </div>
  );
}

/* ── Sección: Fuentes de Ingreso Tab ── */
function IngresosTab({ incomeSources, onAddSource, onDeleteSource }) {
  return (
    <div>
      {incomeSources.length === 0 ? (
        <div className="flex flex-col items-center py-12 space-y-3" id="sources-empty">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(26,26,26,0.05)' }}>
            <TrendingUp size={20} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.2)' }} />
          </div>
          <p className="text-[13px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin fuentes de ingreso definidas</p>
          <button onClick={onAddSource} className="text-[12px] font-[500] uppercase tracking-wider underline underline-offset-2 focus:outline-none" style={{ color: '#5C7A52' }}>
            Añadir fuente
          </button>
        </div>
      ) : (
        <div className="divide-y divide-noria-text/5 animate-fade-in">
          {incomeSources.map(src => (
            <div key={src.id} className="noria-row" id={`source-row-${src.id}`}>
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(92,122,82,0.08)', color: '#5C7A52' }}>
                  <TrendingUp size={15} strokeWidth={1.5} />
                </div>
                <p className="text-[15px] font-[400] text-noria-text">{src.name}</p>
              </div>
              <button onClick={() => onDeleteSource(src.id, src.name)} className="p-1 focus:outline-none" style={{ color: 'rgba(26,26,26,0.2)' }}>
                <Trash2 size={13} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Pantalla Principal ── */
export default function AccountsScreen() {
  const [tab, setTab] = useState(0);
  const [showAddAccModal, setShowAddAccModal] = useState(false);
  const [showAddMacetaModal, setShowAddMacetaModal] = useState(false);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // ID de la cuenta abierta en el Panel de detalle
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [isEditingAccount, setIsEditingAccount] = useState(false);

  // Modal para distribuir saldo
  const [distributingMaceta, setDistributingMaceta] = useState(null);

  // Form Maceta states
  const [macetaName, setMacetaName] = useState('');
  const [macetaTarget, setMacetaTarget] = useState('');
  const [macetaTargetDate, setMacetaTargetDate] = useState('');
  const [macetaError, setMacetaError] = useState('');

  // Form Source states
  const [sourceName, setSourceName] = useState('');

  // Dexie Queries
  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const instruments = useLiveQuery(() => db.instruments.toArray()) || [];
  const macetas = useLiveQuery(() => db.macetas.toArray()) || [];
  const macetaAllocations = useLiveQuery(() => db.maceta_allocations.toArray()) || [];
  const incomeSources = useLiveQuery(() => db.income_sources.toArray()) || [];

  const activeAccounts = accounts.filter(a => !a.isArchived);
  const archivedAccounts = accounts.filter(a => a.isArchived);

  // Active / Selected Account properties
  const selectedAccount = useLiveQuery(async () => {
    if (!selectedAccountId) return null;
    return await db.accounts.get(selectedAccountId);
  }, [selectedAccountId]);

  // Selected Account Institution
  const selectedAccountInstitution = useLiveQuery(async () => {
    if (!selectedAccount) return null;
    return await db.institutions.get(selectedAccount.institutionId);
  }, [selectedAccount]);

  // Selected Account Instruments
  const selectedAccountInstruments = useLiveQuery(async () => {
    if (!selectedAccountId) return [];
    return await db.instruments.where('accountId').equals(selectedAccountId).toArray();
  }, [selectedAccountId]) || [];

  // Selected Account Transactions (Recent 10)
  const recentTransactions = useLiveQuery(async () => {
    if (!selectedAccountId) return [];
    return await db.transactions
      .where('accountId').equals(selectedAccountId)
      .reverse()
      .limit(10)
      .toArray();
  }, [selectedAccountId]) || [];

  // ── Computed: maceta preview ──
  const macetaTargetAmt = parseFloat(macetaTarget) || 0;
  const macetaCurrentAmt = parseFloat(macetaCurrent) || 0;
  const macetaRemaining = Math.max(0, macetaTargetAmt - macetaCurrentAmt);
  const macetaMonthlyContrib = (() => {
    if (!macetaTargetDate) return null;
    const now = new Date();
    const target = new Date(macetaTargetDate + '-15');
    const months = Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
    return macetaRemaining > 0 ? macetaRemaining / months : 0;
  })();

  const handleToggleArchiveAccount = async (accId, currentStatus) => {
    const updatedStatus = !currentStatus;
    await db.accounts.update(accId, { isArchived: updatedStatus });
    setSelectedAccountId(null);
  };

  const handleDeleteAccountSafe = async (accId, name) => {
    try {
      const count = await db.transactions.where('accountId').equals(accId).count();
      if (count > 0) {
        alert(`No se puede eliminar la cuenta "${name}" porque contiene transacciones históricas asociadas (${count} registradas). Para no perder tu historial financiero e homeostasis, por favor utiliza la opción 'Archivar Cuenta'.`);
        return;
      }

      if (confirm(`¿Estás seguro de eliminar físicamente la cuenta "${name}"? Esta acción no se puede deshacer.`)) {
        await db.accounts.delete(accId);
        setSelectedAccountId(null);
      }
    } catch {
      alert('Error al verificar transacciones de la cuenta');
    }
  };

  const handleCreateMaceta = async (e) => {
    e.preventDefault(); setMacetaError('');
    const target = parseFloat(macetaTarget);
    if (isNaN(target) || target <= 0) { setMacetaError('Monto objetivo inválido'); return; }
    try {
      await db.macetas.add({
        name: macetaName.trim(),
        targetAmount: target,
        currentAmount: 0,
        currency: 'USD',
        targetDate: macetaTargetDate || null,
        monthlyContribution: 0,
        priority: 1,
        status: 'ACTIVE',
      });
      setShowAddMacetaModal(false);
      setMacetaName(''); setMacetaTarget(''); setMacetaTargetDate('');
    } catch { setMacetaError('Error al crear la meta'); }
  };

  const handleCreateSource = async (e) => {
    e.preventDefault();
    if (!sourceName.trim()) return;
    const exists = incomeSources.find(s => s.name.toLowerCase() === sourceName.trim().toLowerCase());
    if (!exists) await db.income_sources.add({ name: sourceName.trim(), type: 'OTHER', isActive: true });
    setSourceName('');
    setShowAddSourceModal(false);
  };

  const handleDeleteMaceta = async (id, name) => {
    if (!confirm(`¿Eliminar la meta "${name}"?`)) return;
    // Borrar asignaciones asociadas a la maceta
    await db.maceta_allocations.where('macetaId').equals(id).delete();
    await db.macetas.delete(id);
  };

  const handleProgramSavings = async (maceta, suggestedAmount) => {
    try {
      const amt = parseFloat(suggestedAmount);
      if (isNaN(amt) || amt <= 0) return;

      const anchorName = `Ahorro: ${maceta.name}`;
      
      const exists = await db.anchors.where('name').equals(anchorName).first();
      if (exists) {
        alert(`Ya tienes un ahorro mensual programado para esta meta como "${anchorName}" ($${fmt(exists.amount)}/mes).`);
        return;
      }

      await db.anchors.add({
        name: anchorName,
        type: 'SAVE',
        amount: amt,
        currency: maceta.currency,
        accountId: null,
        nextDueDate: new Date().toISOString().slice(0, 7) + '-01',
        status: 'ACTIVE',
        pillar: 'SAVE'
      });

      alert(`Gasto fijo de ahorro "${anchorName}" programado correctamente con un aporte mensual de $${fmt(amt)}.`);
    } catch (err) {
      alert('Error al programar el gasto fijo de ahorro');
    }
  };

  const handleDeleteSource = async (id, name) => {
    if (!confirm(`¿Eliminar la fuente "${name}"?`)) return;
    await db.income_sources.delete(id);
  };

  const addButtonLabel = ['Añadir Cuenta', 'Nueva Meta', 'Añadir Fuente'][tab];
  const addButtonAction = [
    () => {
      setIsEditingAccount(false);
      setShowAddAccModal(true);
    },
    () => { setMacetaError(''); setShowAddMacetaModal(true); },
    () => setShowAddSourceModal(true),
  ][tab];


  return (
    <div className="min-h-screen pb-32 pt-16 flex flex-col md:flex-row md:max-w-6xl md:mx-auto" style={{ background: '#F5F2ED' }}>

      {/* ── Main content (left side on PC) ── */}
      <div className="flex-1 w-full max-w-md mx-auto px-6">
        <Header title="Patrimonio" />

        {/* ── Tab bar ── */}
        <div className="flex border-b border-[rgba(0,0,0,0.07)] mt-4 mb-6">
          {TABS.map((label, i) => (
            <button
              key={label}
              id={`patrimonio-tab-${label.toLowerCase()}`}
              onClick={() => setTab(i)}
              className="flex-1 pb-3 text-[13px] font-[400] transition-all focus:outline-none relative"
              style={{ color: tab === i ? '#1A1A1A' : 'rgba(26,26,26,0.4)' }}
            >
              {label}
              {tab === i && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full" style={{ background: '#5C7A52' }} />
              )}
            </button>
          ))}
        </div>

        {/* ── Add button row ── */}
        <div className="flex justify-end mb-5">
          <button
            id={`add-btn-${tab}`}
            onClick={addButtonAction}
            className="flex items-center space-x-1 focus:outline-none"
            style={{ color: '#5C7A52', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            <Plus size={12} strokeWidth={2} />
            <span>{addButtonLabel}</span>
          </button>
        </div>

        {/* ── Tab content ── */}
        {tab === 0 && (
          <CuentasTab
            institutions={institutions}
            accounts={activeAccounts}
            instruments={instruments}
            onSelectAccount={(id) => {
              setSelectedAccountId(id);
              setIsEditingAccount(false);
            }}
            onAddAccount={() => {
              setIsEditingAccount(false);
              setShowAddAccModal(true);
            }}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
            archivedAccounts={archivedAccounts}
          />
        )}
        {tab === 1 && (
          <MacetasTab
            macetas={macetas}
            accounts={activeAccounts}
            macetaAllocations={macetaAllocations}
            onAddMaceta={() => { setMacetaError(''); setShowAddMacetaModal(true); }}
            onDeleteMaceta={handleDeleteMaceta}
            onDistribute={setDistributingMaceta}
            onProgramSavings={handleProgramSavings}
          />
        )}
        {tab === 2 && (
          <IngresosTab
            incomeSources={incomeSources}
            onAddSource={() => setShowAddSourceModal(true)}
            onDeleteSource={handleDeleteSource}
          />
        )}
      </div>

      {/* ── PC lateral Drawer Panel / Mobile Bottom Sheet (Unified UI) ── */}
      {selectedAccountId && selectedAccount && (
        <>
          {/* Overlay on mobile, pointer-events-none on desktop */}
          <div
            className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40 md:hidden"
            onClick={() => setSelectedAccountId(null)}
          />

          {/* Panel Container (Slides up on mobile, slides from right or remains fixed on PC) */}
          <div
            id="account-drawer-panel"
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#F5F2ED] border-t border-[rgba(0,0,0,0.07)] md:relative md:bottom-auto md:left-auto md:right-auto md:z-0 md:border-t-0 md:border-l md:w-96 md:min-h-[80vh] md:flex md:flex-col flex flex-col rounded-t-[20px] md:rounded-none max-h-[85vh] md:max-h-none overflow-y-auto animate-slide-up"
            style={{ boxShadow: window.innerWidth < 768 ? '0 -8px 40px rgba(0,0,0,0.08)' : 'none' }}
          >
            {/* Mobile handle drag indicator */}
            <div className="flex justify-center pt-3 pb-2 md:hidden">
              <div className="w-8 h-[3px] rounded-full bg-[rgba(26,26,26,0.12)]" />
            </div>

            {/* Header */}
            <div className="px-6 pt-4 pb-3 flex justify-between items-center border-b border-[rgba(0,0,0,0.05)]">
              <h4 className="text-[15px] font-[500] uppercase tracking-wider text-noria-muted">
                {isEditingAccount ? 'Editar Cuenta' : 'Detalle de Cuenta'}
              </h4>
              <button
                onClick={() => setSelectedAccountId(null)}
                className="text-noria-muted hover:text-noria-text p-1 focus:outline-none"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="p-6 flex-1 space-y-6">
              {isEditingAccount ? (
                /* EDIT FORM COMPONENT */
                <EditAccountForm
                  account={selectedAccount}
                  institutions={institutions}
                  onUpdated={() => setIsEditingAccount(false)}
                  onCancel={() => setIsEditingAccount(false)}
                />
              ) : (
                /* VISOR / DETAILS */
                <div className="space-y-6 animate-fade-in" id="account-detail-visor">
                  {/* Account overview card */}
                  <div className="p-4 rounded-[8px] border border-[rgba(0,0,0,0.07)]" style={{ background: 'rgba(26,26,26,0.02)' }}>
                    <p className="label-section mb-1">{selectedAccountInstitution?.name || 'Institución'}</p>
                    <h3 className="text-title text-noria-text font-[400] leading-tight">{selectedAccount.name}</h3>
                    <p className="text-[28px] font-[300] text-noria-text mt-3">
                      ${fmt(selectedAccount.balance)}
                      <span className="text-[14px] font-[500] ml-2 text-noria-muted">{selectedAccount.currency}</span>
                    </p>
                    {(() => {
                      const committedInMacetas = macetaAllocations
                        .filter(a => a.accountId === selectedAccountId)
                        .reduce((sum, a) => sum + a.amount, 0);
                      const availableBalance = Math.max(0, selectedAccount.balance - committedInMacetas);

                      if (committedInMacetas === 0) return null;
                      return (
                        <div className="mt-2 pt-2 border-t border-[rgba(0,0,0,0.05)] text-[12px] space-y-0.5 text-noria-text/60">
                          <div className="flex justify-between font-mono">
                            <span>Comprometido:</span>
                            <span className="text-noria-amber font-[500]">${fmt(committedInMacetas)}</span>
                          </div>
                          <div className="flex justify-between font-mono">
                            <span>Disponible real:</span>
                            <span className="text-[#5C7A52] font-[500]">${fmt(availableBalance)}</span>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="mt-4 flex space-x-2">
                      <span className="noria-pill" style={{ background: 'rgba(26,26,26,0.05)', color: 'rgba(26,26,26,0.6)' }}>
                        {selectedAccount.type}
                      </span>
                      {selectedAccount.isArchived && (
                        <span className="noria-pill bg-noria-amber/10 text-noria-amber">
                          Archivada
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Associated Instruments List in Details view */}
                  {selectedAccountInstruments.length > 0 && (
                    <div>
                      <h5 className="label-section mb-2">Instrumentos Vinculados</h5>
                      <div className="flex flex-wrap gap-2">
                        {selectedAccountInstruments.map(inst => (
                          <span
                            key={inst.id}
                            className="noria-pill"
                            style={{ background: 'rgba(26,26,26,0.04)', color: 'rgba(26,26,26,0.6)', textTransform: 'none' }}
                          >
                            {INSTRUMENT_TYPES.find(t => t.value === inst.type)?.label || inst.type}
                            {inst.alias && ` (${inst.alias})`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setIsEditingAccount(true)}
                      className="flex flex-col items-center justify-center py-2.5 rounded border border-[rgba(26,26,26,0.10)] hover:bg-noria-text/2 transition-colors focus:outline-none"
                    >
                      <Pencil size={15} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.6)' }} />
                      <span className="text-[9px] font-[500] uppercase tracking-wider mt-1.5" style={{ color: 'rgba(26,26,26,0.6)' }}>Editar</span>
                    </button>

                    <button
                      onClick={() => handleToggleArchiveAccount(selectedAccountId, selectedAccount.isArchived)}
                      className="flex flex-col items-center justify-center py-2.5 rounded border border-[rgba(26,26,26,0.10)] hover:bg-noria-text/2 transition-colors focus:outline-none"
                    >
                      {selectedAccount.isArchived ? (
                        <>
                          <ArchiveRestore size={15} strokeWidth={1.5} style={{ color: '#5C7A52' }} />
                          <span className="text-[9px] font-[500] uppercase tracking-wider mt-1.5" style={{ color: '#5C7A52' }}>Restaurar</span>
                        </>
                      ) : (
                        <>
                          <Archive size={15} strokeWidth={1.5} style={{ color: '#B8860B' }} />
                          <span className="text-[9px] font-[500] uppercase tracking-wider mt-1.5" style={{ color: '#B8860B' }}>Archivar</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleDeleteAccountSafe(selectedAccountId, selectedAccount.name)}
                      className="flex flex-col items-center justify-center py-2.5 rounded border border-[rgba(159,47,45,0.15)] hover:bg-noria-amber/5 transition-colors focus:outline-none"
                    >
                      <Trash2 size={15} strokeWidth={1.5} style={{ color: '#9F2F2D' }} />
                      <span className="text-[9px] font-[500] uppercase tracking-wider mt-1.5" style={{ color: '#9F2F2D' }}>Eliminar</span>
                    </button>
                  </div>

                  {/* Recent transactions section */}
                  <div>
                    <h5 className="label-section mb-3">Últimas Transacciones</h5>
                    {recentTransactions.length === 0 ? (
                      <p className="text-[12px] text-noria-muted py-4 text-center">Sin transacciones registradas</p>
                    ) : (
                      <div className="divide-y divide-noria-text/5">
                        {recentTransactions.map(t => (
                          <div key={t.id} className="py-2.5 flex justify-between items-center text-sm">
                            <div>
                              <p className="font-[400] text-noria-text text-[13px]">{t.description || (t.type === 'IN' ? 'Ingreso' : 'Gasto')}</p>
                              <p className="text-[9px] text-noria-muted uppercase tracking-wider mt-0.5">
                                {new Date(t.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                {t.pillar && <span className="ml-1.5 font-[500]" style={{ color: t.pillar === 'NEED' ? '#5C7A52' : t.pillar === 'WANT' ? '#4A6475' : '#B8860B' }}>{t.pillar}</span>}
                              </p>
                            </div>
                            <span
                              className="font-[500] text-[13px] flex items-center space-x-1"
                              style={{ color: t.type === 'IN' ? '#5C7A52' : '#1A1A1A' }}
                            >
                              {t.type === 'IN' ? '+' : '-'}${fmt(t.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── MODALS (AccountsScreen local overlays) ── */}

      {/* Add Account Modal (Fully Encapsulated Component) */}
      {showAddAccModal && (
        <AddAccountModal
          onClose={() => setShowAddAccModal(false)}
          institutions={institutions}
          onCreated={() => setShowAddAccModal(false)}
        />
      )}

      {/* Add Maceta */}
      {showAddMacetaModal && (
        <>
          <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40" onClick={() => setShowAddMacetaModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up overflow-y-auto"
            style={{ background: '#F5F2ED', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)', maxHeight: '90vh' }}>
            <form onSubmit={handleCreateMaceta} className="px-6 pt-4 pb-10 space-y-4" id="add-maceta-form">
              <div className="flex justify-center mb-2">
                <div className="w-8 h-[3px] rounded-full" style={{ background: 'rgba(26,26,26,0.12)' }} />
              </div>
              <div className="flex justify-between items-center">
                <h4 className="text-[16px] font-[400] text-noria-text">Nueva Meta de Ahorro</h4>
                <button type="button" id="close-add-maceta-modal" onClick={() => setShowAddMacetaModal(false)}
                  className="focus:outline-none p-1" style={{ color: 'rgba(26,26,26,0.4)' }}>✕</button>
              </div>

              <div>
                <label className="muji-header block mb-1">Nombre de la Meta</label>
                <input id="maceta-name" type="text" value={macetaName} onChange={e => setMacetaName(e.target.value)}
                  placeholder="Ej. Fondo de Emergencia" className="muji-input" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="muji-header block mb-1">Objetivo (USD)</label>
                  <input id="maceta-target" type="number" step="1" value={macetaTarget}
                    onChange={e => setMacetaTarget(e.target.value)} placeholder="1000" className="muji-input" required />
                </div>
                <div>
                  <label className="muji-header block mb-1">Fecha objetivo</label>
                  <input id="maceta-target-date" type="month" value={macetaTargetDate}
                    onChange={e => setMacetaTargetDate(e.target.value)} className="muji-input" />
                </div>
              </div>

              {/* ── Preview card ── */}
              {macetaTargetAmt > 0 && (
                <div className="border border-[rgba(0,0,0,0.07)] rounded-[8px] p-4 space-y-3" style={{ background: 'rgba(92,122,82,0.05)' }} id="maceta-preview">
                  <p className="label-section" style={{ color: '#5C7A52' }}>Vista previa</p>
                  <div className="flex items-center justify-between">
                    <p className="text-[15px] font-[400] text-noria-text">{macetaName || 'Nueva Meta'}</p>
                    <Target size={14} strokeWidth={1.5} style={{ color: '#5C7A52' }} />
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `0%`, background: '#5C7A52' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="label-section mb-0.5">Objetivo</p>
                      <p className="text-[14px] font-[400] text-noria-text">${fmt(macetaTargetAmt, 0)}</p>
                    </div>
                    {(() => {
                      if (!macetaTargetDate) return null;
                      const now = new Date();
                      const target = new Date(macetaTargetDate + '-15');
                      const months = Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
                      const contrib = macetaTargetAmt / months;
                      return (
                        <div>
                          <p className="label-section mb-0.5">Aporte mensual sugerido</p>
                          <p className="text-[14px] font-[400]" style={{ color: '#5C7A52' }}>${fmt(contrib)}/mes</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}


              {macetaError && <p className="text-[12px] font-[500]" style={{ color: '#B8860B' }} id="add-maceta-error">{macetaError}</p>}

              <button id="submit-new-maceta-btn" type="submit"
                className="w-full py-3.5 text-[13px] font-[500] uppercase tracking-wider rounded-[6px] mt-2 active:scale-[0.98] transition-all"
                style={{ background: '#1A1A1A', color: '#F5F2ED' }}>
                Crear Meta
              </button>
            </form>
          </div>
        </>
      )}

      {/* Add Income Source */}
      {showAddSourceModal && (
        <>
          <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40" onClick={() => setShowAddSourceModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up"
            style={{ background: '#F5F2ED', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)' }}>
            <form onSubmit={handleCreateSource} className="px-6 pt-4 pb-10 space-y-4" id="add-source-form">
              <div className="flex justify-center mb-2">
                <div className="w-8 h-[3px] rounded-full" style={{ background: 'rgba(26,26,26,0.12)' }} />
              </div>
              <div className="flex justify-between items-center">
                <h4 className="text-[16px] font-[400] text-noria-text">Nueva Fuente de Ingreso</h4>
                <button type="button" id="close-add-source-modal" onClick={() => setShowAddSourceModal(false)}
                  className="focus:outline-none p-1" style={{ color: 'rgba(26,26,26,0.4)' }}>✕</button>
              </div>
              <div>
                <label className="muji-header block mb-1">Nombre de la fuente</label>
                <input id="source-name" type="text" value={sourceName} onChange={e => setSourceName(e.target.value)}
                  placeholder="Ej. Estudio CKM Visualización" className="muji-input" autoFocus required />
              </div>
              <button id="submit-new-source-btn" type="submit"
                className="w-full py-3.5 text-[13px] font-[500] uppercase tracking-wider rounded-[6px] mt-2 active:scale-[0.98] transition-all"
                style={{ background: '#1A1A1A', color: '#F5F2ED' }}>
                Crear Fuente
              </button>
            </form>
          </div>
      {/* Modal de Distribución de Fondos Multi-cuenta */}
      {distributingMaceta && (
        <AssignFundsModal
          maceta={distributingMaceta}
          onClose={() => setDistributingMaceta(null)}
          accounts={activeAccounts}
          macetaAllocations={macetaAllocations}
          onSaved={() => setDistributingMaceta(null)}
        />
      )}

      <BottomNav />
      <FAB />
    </div>
  );
}

/* ── SUB-COMPONENTE: Modal para Asignar Fondos Multi-cuenta ── */
function AssignFundsModal({ maceta, onClose, accounts, macetaAllocations, onSaved }) {
  const [error, setError] = useState('');
  const [allocationsInput, setAllocationsInput] = useState({});

  useEffect(() => {
    const existing = macetaAllocations.filter(a => a.macetaId === maceta.id);
    const initialInputs = {};
    existing.forEach(a => {
      initialInputs[a.accountId] = a.amount.toString();
    });
    setAllocationsInput(initialInputs);
  }, [maceta, macetaAllocations]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');

    try {
      let totalAllocated = 0;
      const updates = [];

      for (const acc of accounts) {
        const valStr = allocationsInput[acc.id] || '';
        if (!valStr.trim()) continue;

        const amt = parseFloat(valStr);
        if (isNaN(amt) || amt < 0) {
          setError(`Monto inválido para la cuenta ${acc.name}`);
          return;
        }

        // Calcular comprometido en otras macetas
        const otherAllocations = macetaAllocations.filter(
          a => a.accountId === acc.id && a.macetaId !== maceta.id
        );
        const committedOther = otherAllocations.reduce((sum, a) => sum + a.amount, 0);
        const disponible = acc.balance - committedOther;

        if (amt > disponible) {
          setError(`No puedes asignar $${amt} desde ${acc.name}. El disponible real es $${fmt(disponible)}.`);
          return;
        }

        if (amt > 0) {
          totalAllocated += amt;
          updates.push({
            accountId: acc.id,
            amount: amt
          });
        }
      }

      // Escritura en IndexedDB
      await db.transaction('rw', [db.maceta_allocations, db.macetas], async () => {
        await db.maceta_allocations.where('macetaId').equals(maceta.id).delete();

        for (const up of updates) {
          await db.maceta_allocations.add({
            macetaId: maceta.id,
            accountId: up.accountId,
            amount: up.amount,
            currency: maceta.currency,
            locked: false
          });
        }

        await db.macetas.update(maceta.id, { currentAmount: totalAllocated });
      });

      onSaved();
    } catch (err) {
      setError('Error al guardar la asignación');
    }
  };

  const handleInputChange = (accId, val) => {
    setAllocationsInput(prev => ({
      ...prev,
      [accId]: val
    }));
  };

  return (
    <>
      <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-45 animate-fade-in" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up overflow-y-auto"
        style={{ background: '#F5F2ED', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)', maxHeight: '85vh' }}>
        <form onSubmit={handleSave} className="px-6 pt-4 pb-10 space-y-4">
          <div className="flex justify-center mb-2">
            <div className="w-8 h-[3px] rounded-full bg-[rgba(26,26,26,0.12)]" />
          </div>
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-[15px] font-[500] uppercase tracking-wider text-noria-text">Asignar Fondos</h4>
              <p className="text-[11px] text-noria-muted uppercase tracking-wider mt-0.5">{maceta.name}</p>
            </div>
            <button type="button" onClick={onClose} className="focus:outline-none p-1 text-noria-muted">✕</button>
          </div>

          <p className="text-[12px] text-noria-muted leading-relaxed">
            Asigna montos virtuales de tus cuentas a esta meta. Esto no retirará dinero de tus cuentas, solo reservará el saldo disponible.
          </p>

          <div className="space-y-3 pt-2 max-h-60 overflow-y-auto pr-1">
            {accounts.map(acc => {
              const otherAllocations = macetaAllocations.filter(
                a => a.accountId === acc.id && a.macetaId !== maceta.id
              );
              const committedOther = otherAllocations.reduce((sum, a) => sum + a.amount, 0);
              const disponible = Math.max(0, acc.balance - committedOther);

              return (
                <div key={acc.id} className="flex justify-between items-center p-2.5 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.01)]">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-[13px] font-[400] text-noria-text truncate">{acc.name}</p>
                    <p className="text-[10px] text-noria-muted uppercase tracking-wider mt-0.5">
                      Total: ${fmt(acc.balance)} · <span className="font-[500]" style={{ color: disponible > 0 ? '#5C7A52' : 'inherit' }}>Disp: ${fmt(disponible)}</span>
                    </p>
                  </div>
                  <div className="w-28 flex items-center space-x-1">
                    <span className="text-[12px] text-noria-muted">$</span>
                    <input
                      type="number"
                      step="1"
                      inputMode="decimal"
                      value={allocationsInput[acc.id] || ''}
                      onChange={e => handleInputChange(acc.id, e.target.value)}
                      placeholder="0"
                      className="muji-input text-right text-[13px] py-1 px-2"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {error && <p className="text-[12px] font-[500]" style={{ color: '#B8860B' }}>{error}</p>}

          <button type="submit"
            className="w-full py-3 text-[12px] font-[500] uppercase tracking-wider rounded-[6px] mt-2 active:scale-[0.98] transition-all"
            style={{ background: '#1A1A1A', color: '#F5F2ED' }}>
            Guardar Distribución
          </button>
        </form>
      </div>
    </>
  );
}

