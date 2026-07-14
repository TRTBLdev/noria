import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { Plus, X, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from 'lucide-react';

// Radial menu item positions (relative to FAB center)
// For 3 items: Gasto (left), Transfer (middle), Ingreso (right)
const RADIAL_POSITIONS = [
  { dx: -110, dy: 0,   delay: '0ms' },   // Gasto — left
  { dx: -80,  dy: -60, delay: '40ms' },  // Transferencia — up-left
  { dx: 0,    dy: -90, delay: '80ms' },  // Ingreso — up
];

export default function FAB() {
  const [isOpen, setIsOpen]       = useState(false);
  const [activeForm, setActiveForm] = useState(null); // 'GASTO' | 'INGRESO' | 'TRANSFERENCIA'
  const sheetRef = useRef(null);

  const accounts      = useLiveQuery(() => db.accounts.toArray())      || [];
  const activeAccounts = accounts.filter(a => !a.isArchived);
  const tags          = useLiveQuery(() => db.tags.toArray())           || [];
  const incomeSources = useLiveQuery(() => db.income_sources.toArray()) || [];
  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const baseCurrency  = baseCurrencyObj?.value || 'USD';

  const [date, setDate]               = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId]     = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount]           = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [exchangeRate, setExchangeRate]     = useState('');
  const [pillar, setPillar]           = useState('NEED');
  const [description, setDescription] = useState('');
  const [incomeSourceId, setIncomeSourceId] = useState('');
  const [newSourceName, setNewSourceName]   = useState('');
  const [newSourceType, setNewSourceType]   = useState('SALARY');
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState(false);

  // Seed defaults when data loads
  useEffect(() => {
    if (activeAccounts.length > 0) {
      if (!accountId) {
        setAccountId(activeAccounts[0].id.toString());
      }
      // Ensure target account is different
      const currentIdStr = accountId || activeAccounts[0].id.toString();
      const otherAcc = activeAccounts.find(a => a.id.toString() !== currentIdStr);
      if (otherAcc && (!toAccountId || toAccountId === currentIdStr)) {
        setToAccountId(otherAcc.id.toString());
      }
    }
    if (incomeSources.length > 0 && !incomeSourceId) setIncomeSourceId(incomeSources[0].id.toString());
  }, [activeAccounts, incomeSources, accountId, toAccountId]);

  // Close bottom sheet on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) {
        const fab = document.getElementById('fab-main-btn');
        if (fab && fab.contains(e.target)) return;
        closeSheet();
      }
    };
    if (activeForm) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [activeForm]);

  const resetForm = () => {
    setAmount('');
    setAmountReceived('');
    setExchangeRate('');
    setDescription('');
    setNewSourceName('');
    setNewSourceType('SALARY');
    setError('');
    setSuccess(false);
    if (activeAccounts.length > 0) {
      setAccountId(activeAccounts[0].id.toString());
      const otherAcc = activeAccounts.find(a => a.id.toString() !== activeAccounts[0].id.toString());
      if (otherAcc) {
        setToAccountId(otherAcc.id.toString());
      }
    }
    if (incomeSources.length > 0) setIncomeSourceId(incomeSources[0].id.toString());
    setDate(new Date().toISOString().slice(0, 10));
    setPillar('NEED');
  };

  const handleSourceAccountChange = (id) => {
    setAccountId(id);
    const sourceAcc = accounts.find(a => a.id.toString() === id);
    const targetAcc = accounts.find(a => a.id.toString() === toAccountId);
    if (sourceAcc && targetAcc) {
      if (sourceAcc.currency === targetAcc.currency) {
        setExchangeRate('1');
        setAmountReceived(amount);
      } else {
        setExchangeRate('');
        setAmountReceived('');
      }
    }
  };

  const handleTargetAccountChange = (id) => {
    setToAccountId(id);
    const sourceAcc = accounts.find(a => a.id.toString() === accountId);
    const targetAcc = accounts.find(a => a.id.toString() === id);
    if (sourceAcc && targetAcc) {
      if (sourceAcc.currency === targetAcc.currency) {
        setExchangeRate('1');
        setAmountReceived(amount);
      } else {
        setExchangeRate('');
        setAmountReceived('');
      }
    }
  };

  const handleAmountChange = (val) => {
    setAmount(val);
    const sourceAcc = accounts.find(a => a.id.toString() === accountId);
    const targetAcc = accounts.find(a => a.id.toString() === toAccountId);
    if (sourceAcc && targetAcc) {
      if (sourceAcc.currency === targetAcc.currency) {
        setAmountReceived(val);
      } else {
        const rate = parseFloat(exchangeRate);
        if (!isNaN(rate) && rate > 0) {
          setAmountReceived((parseFloat(val) * rate).toFixed(2));
        }
      }
    }
  };

  const handleRateChange = (val) => {
    setExchangeRate(val);
    const rate = parseFloat(val);
    const amt = parseFloat(amount);
    if (!isNaN(rate) && !isNaN(amt) && rate > 0) {
      setAmountReceived((amt * rate).toFixed(2));
    }
  };

  const handleAmountReceivedChange = (val) => {
    setAmountReceived(val);
    const sourceAcc = accounts.find(a => a.id.toString() === accountId);
    const targetAcc = accounts.find(a => a.id.toString() === toAccountId);
    if (sourceAcc && targetAcc && sourceAcc.currency !== targetAcc.currency) {
      const amt = parseFloat(amount);
      const rec = parseFloat(val);
      if (!isNaN(amt) && !isNaN(rec) && amt > 0) {
        setExchangeRate((rec / amt).toFixed(4));
      }
    }
  };

  const handleFabClick = () => {
    if (activeForm) { closeSheet(); return; }
    setIsOpen(prev => !prev);
  };

  const openForm = (type) => {
    setIsOpen(false);
    resetForm();
    setActiveForm(type);
  };

  const closeSheet = () => {
    setActiveForm(null);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('Monto inválido'); return; }
    if (!accountId) { setError('Selecciona una cuenta'); return; }

    try {
      if (activeForm === 'TRANSFERENCIA') {
        if (!toAccountId) { setError('Selecciona la cuenta de destino'); return; }
        if (accountId === toAccountId) { setError('Las cuentas de origen y destino deben ser distintas'); return; }
        
        const parsedReceived = parseFloat(amountReceived);
        if (isNaN(parsedReceived) || parsedReceived <= 0) { setError('Monto recibido inválido'); return; }

        const sourceAccount = accounts.find(a => a.id.toString() === accountId);
        const targetAccount = accounts.find(a => a.id.toString() === toAccountId);
        if (!sourceAccount || !targetAccount) { setError('Cuentas no encontradas'); return; }

        const transferId = 'TX-' + Date.now();

        await db.transaction('rw', [db.accounts, db.transactions], async () => {
          // 1. Registrar salida
          await db.transactions.add({
            date: new Date(date + 'T12:00:00'),
            type: 'TRANSFER_OUT',
            amount: parsedAmount,
            currency: sourceAccount.currency,
            accountId: sourceAccount.id,
            description: description.trim() || `Transferencia a ${targetAccount.name}`,
            transferId
          });

          // 2. Registrar entrada
          await db.transactions.add({
            date: new Date(date + 'T12:00:00'),
            type: 'TRANSFER_IN',
            amount: parsedReceived,
            currency: targetAccount.currency,
            accountId: targetAccount.id,
            description: description.trim() || `Transferencia desde ${sourceAccount.name}`,
            transferId
          });

          // 3. Actualizar balances
          await db.accounts.update(sourceAccount.id, { balance: sourceAccount.balance - parsedAmount });
          await db.accounts.update(targetAccount.id, { balance: targetAccount.balance + parsedReceived });
        });

      } else {
        const selectedAccount = accounts.find(a => a.id.toString() === accountId);
        if (!selectedAccount) { setError('Cuenta no encontrada'); return; }

        let resolvedSourceId = incomeSourceId ? parseInt(incomeSourceId) : null;
        if (activeForm === 'INGRESO' && (incomeSourceId === 'new' || newSourceName.trim())) {
          const nameToUse = newSourceName.trim();
          const existing = incomeSources.find(s => s.name.toLowerCase() === nameToUse.toLowerCase());
          resolvedSourceId = existing
            ? existing.id
            : await db.income_sources.add({ name: nameToUse, type: newSourceType, isActive: true });
        }

        await db.transactions.add({
          date: new Date(date + 'T12:00:00'),
          type: activeForm === 'GASTO' ? 'OUT' : 'IN',
          amount: parsedAmount,
          currency: selectedAccount.currency,
          accountId: parseInt(accountId),
          tagId: null,
          pillar:   activeForm === 'GASTO' ? pillar : null,
          incomeSourceId: activeForm === 'INGRESO' ? resolvedSourceId : null,
          description: description.trim(),
        });

        const delta = activeForm === 'GASTO' ? -parsedAmount : parsedAmount;
        await db.accounts.update(parseInt(accountId), { balance: selectedAccount.balance + delta });
      }

      setSuccess(true);
      setTimeout(() => closeSheet(), 900);
    } catch {
      setError('Error al registrar la operación');
    }
  };

  // Radial options definition
  const options = [
    {
      type: 'GASTO',
      icon: <ArrowDownLeft size={18} strokeWidth={1.5} />,
      label: 'Gasto',
      color: '#B8860B',
      bg: 'rgba(184,134,11,0.10)',
      border: 'rgba(184,134,11,0.25)',
    },
    {
      type: 'TRANSFERENCIA',
      icon: <ArrowLeftRight size={18} strokeWidth={1.5} />,
      label: 'Transf.',
      color: '#4A6475',
      bg: 'rgba(74,100,117,0.10)',
      border: 'rgba(74,100,117,0.25)',
    },
    {
      type: 'INGRESO',
      icon: <ArrowUpRight size={18} strokeWidth={1.5} />,
      label: 'Ingreso',
      color: '#5C7A52',
      bg: 'rgba(92,122,82,0.10)',
      border: 'rgba(92,122,82,0.25)',
    },
  ];

  return (
    <>
      {/* ── FAB + Radial Menu ── */}
      <div className="fixed bottom-20 right-6 z-40" id="fab-container">

        {/* Radial items */}
        {options.map((opt, i) => (
          <button
            key={opt.type}
            id={`fab-radial-${opt.type.toLowerCase()}`}
            onClick={() => openForm(opt.type)}
            className="fab-radial-item"
            style={{
              bottom: '0px',
              right: '0px',
              transform: isOpen
                ? `translate(${RADIAL_POSITIONS[i].dx}px, ${RADIAL_POSITIONS[i].dy}px) scale(1)`
                : 'translate(0px, 0px) scale(0.3)',
              opacity: isOpen ? 1 : 0,
              pointerEvents: isOpen ? 'all' : 'none',
              transitionDelay: isOpen ? RADIAL_POSITIONS[i].delay : '0ms',
            }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shadow-float"
              style={{ background: opt.bg, border: `1px solid ${opt.border}`, color: opt.color, backdropFilter: 'blur(8px)' }}
            >
              {opt.icon}
            </div>
            <span
              className="text-[10px] font-[500] uppercase tracking-wider whitespace-nowrap"
              style={{ color: opt.color }}
            >
              {opt.label}
            </span>
          </button>
        ))}

        {/* Main FAB — circle with + (exactly like reference mockup) */}
        <button
          id="fab-main-btn"
          onClick={handleFabClick}
          className="w-14 h-14 rounded-full border border-[rgba(26,26,26,0.15)] bg-noria-bg flex items-center justify-center shadow-float active:scale-95 transition-all focus:outline-none"
          aria-label="Nuevo registro"
          style={{ position: 'relative', zIndex: 1 }}
        >
          <Plus
            size={20}
            strokeWidth={1.5}
            className="text-noria-text transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
          />
        </button>
      </div>

      {/* ── Dim overlay when radial is open (not blur) ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Bottom Sheet Form ── */}
      {activeForm && (
        <>
          <div
            className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40"
            onClick={closeSheet}
            aria-hidden="true"
          />
          <div
            ref={sheetRef}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-[#F5F2ED] rounded-t-[20px] animate-slide-up"
            style={{ boxShadow: '0 -8px 40px rgba(0,0,0,0.08)' }}
          >
            <form onSubmit={handleSubmit} id="fab-transaction-form">
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-8 h-[3px] rounded-full bg-[rgba(26,26,26,0.12)]" />
              </div>

              {success ? (
                <div className="flex flex-col items-center justify-center py-14 space-y-3" style={{ color: '#5C7A52' }}>
                  <div className="w-12 h-12 rounded-full border border-[rgba(92,122,82,0.3)] flex items-center justify-center text-xl">✓</div>
                  <p className="label-section" style={{ color: '#5C7A52' }}>Guardado</p>
                </div>
              ) : (
                <div className="px-6 pb-8 space-y-5">
                  {/* Title */}
                  <div className="flex justify-between items-center">
                    <h4 className="text-[16px] font-[400] text-noria-text">
                      {activeForm === 'TRANSFERENCIA' ? 'Mover Fondos (Transf.)' : activeForm === 'GASTO' ? 'Registrar Gasto' : 'Registrar Ingreso'}
                    </h4>
                    <button type="button" onClick={closeSheet} id="close-fab-sheet-btn"
                      className="text-noria-muted hover:text-noria-text transition-colors focus:outline-none p-1">
                      <X size={16} strokeWidth={1.5} />
                    </button>
                  </div>

                  {activeForm === 'TRANSFERENCIA' ? (
                    /* TRANSFERENCIA - Dual Amount Inputs */
                    <div className="space-y-4 animate-fade-in">
                      {(() => {
                        const sourceAcc = accounts.find(a => a.id.toString() === accountId);
                        const targetAcc = accounts.find(a => a.id.toString() === toAccountId);
                        const isMultiCurrency = sourceAcc && targetAcc && sourceAcc.currency !== targetAcc.currency;
                        
                        const amtNum = parseFloat(amount) || 0;
                        const recNum = parseFloat(amountReceived) || 0;
                        const feeAmt = Math.max(0, amtNum - recNum);

                        return (
                          <>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="py-2 border-b border-[rgba(0,0,0,0.07)]">
                                <p className="label-section mb-1">Monto a Enviar ({sourceAcc?.currency || ''})</p>
                                <input
                                  id="tx-amount-sent"
                                  type="number" step="0.01" inputMode="decimal"
                                  value={amount} onChange={e => handleAmountChange(e.target.value)}
                                  placeholder="0.00"
                                  className="w-full text-[22px] font-[300] text-noria-text bg-transparent outline-none placeholder:text-[rgba(26,26,26,0.15)]"
                                  autoFocus required
                                />
                              </div>

                              <div className="py-2 border-b border-[rgba(0,0,0,0.07)]">
                                <p className="label-section mb-1">Monto a Recibir ({targetAcc?.currency || ''})</p>
                                <input
                                  id="tx-amount-received"
                                  type="number" step="0.01" inputMode="decimal"
                                  value={amountReceived} onChange={e => handleAmountReceivedChange(e.target.value)}
                                  placeholder="0.00"
                                  className="w-full text-[22px] font-[300] text-noria-text bg-transparent outline-none placeholder:text-[rgba(26,26,26,0.15)]"
                                  required
                                />
                              </div>
                            </div>

                            {/* Mostrar Tasa de Cambio o Comisiones */}
                            {isMultiCurrency ? (
                              <div className="p-2.5 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.01)] flex justify-between items-center animate-fade-in">
                                <span className="label-section">Tasa de Cambio Implícita:</span>
                                <div className="flex items-center space-x-1">
                                  <input
                                    type="number" step="0.0001"
                                    value={exchangeRate} onChange={e => handleRateChange(e.target.value)}
                                    placeholder="Tasa"
                                    className="w-20 text-right bg-transparent border-b border-transparent focus:border-[#5C7A52] outline-none font-mono text-[13px] font-[500]"
                                  />
                                  <span className="text-[10px] text-noria-muted">{targetAcc?.currency}/{sourceAcc?.currency}</span>
                                </div>
                              </div>
                            ) : (
                              feeAmt > 0 && (
                                <div className="p-2.5 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.01)] flex justify-between items-center animate-fade-in text-[12px] font-mono text-noria-text/60">
                                  <span>Comisión cobrada:</span>
                                  <span className="text-noria-amber font-[500]">${fmt(feeAmt)}</span>
                                </div>
                              )
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    /* GASTO/INGRESO - Standard Hero Amount Input */
                    <div className="py-3 border-b border-[rgba(0,0,0,0.07)]">
                      <p className="label-section mb-2">Monto ({baseCurrency})</p>
                      <input
                        id="tx-amount"
                        type="number" step="0.01" inputMode="decimal"
                        value={amount} onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full text-[32px] font-[300] text-noria-text bg-transparent outline-none placeholder:text-[rgba(26,26,26,0.15)]"
                        autoFocus required
                      />
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <label className="muji-header block mb-1">Descripción</label>
                    <input id="tx-description" type="text" value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder={activeForm === 'TRANSFERENCIA' ? 'Ej. Recarga saldo Zinli' : activeForm === 'GASTO' ? 'Ej. Supermercado Central Madeirense' : 'Ej. Proyecto Casa Díaz'}
                      className="muji-input" />
                  </div>

                  {/* Income Source */}
                  {activeForm === 'INGRESO' && (
                    <div className="space-y-3">
                      <div>
                        <label className="muji-header block mb-1">Fuente de Ingreso</label>
                        <select id="tx-income-source" value={incomeSourceId}
                          onChange={e => { setIncomeSourceId(e.target.value); if (e.target.value === 'new') setNewSourceName(''); }}
                          className="muji-input">
                          {incomeSources.map(s => {
                            const emoji = s.type === 'SALARY' ? '💼' :
                                          s.type === 'FREELANCE' ? '💻' :
                                          s.type === 'INVESTMENT' ? '📈' :
                                          s.type === 'GIFT' ? '🎁' :
                                          s.type === 'BUSINESS' ? '🏪' : '💰';
                            return <option key={s.id} value={s.id}>{emoji} {s.name}</option>;
                          })}
                          <option value="new">+ Nueva fuente...</option>
                        </select>
                      </div>
                      {(incomeSourceId === 'new' || incomeSources.length === 0) && (
                        <div className="space-y-3 p-3 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.01)] animate-fade-in">
                          <div>
                            <label className="muji-header block mb-1">Nombre de la nueva fuente</label>
                            <input id="tx-new-source" type="text" value={newSourceName}
                              onChange={e => setNewSourceName(e.target.value)}
                              placeholder="Ej. Estudio CKM Visualización"
                              className="muji-input" required />
                          </div>
                          <div>
                            <label className="muji-header block mb-1">Tipo de Ingreso</label>
                            <select id="tx-new-source-type" value={newSourceType}
                              onChange={e => setNewSourceType(e.target.value)}
                              className="muji-input" required>
                              <option value="SALARY">Salario / Empleo</option>
                              <option value="FREELANCE">💻 Freelance / Servicios</option>
                              <option value="INVESTMENT">📈 Inversiones / Dividendos</option>
                              <option value="GIFT">🎁 Regalos / Bonos</option>
                              <option value="BUSINESS">🏪 Ventas / Negocio</option>
                              <option value="OTHER">Otro</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pillar pills */}
                  {activeForm === 'GASTO' && (
                    <div>
                      <p className="muji-header mb-2">Pilar</p>
                      <div className="flex space-x-2">
                        {[['NEED','Necesidad','#5C7A52','rgba(92,122,82,0.12)'],
                          ['WANT','Deseo','#4A6475','rgba(74,100,117,0.12)'],
                          ['SAVE','Ahorro','#B8860B','rgba(184,134,11,0.12)']].map(([val, label, col, bg]) => (
                          <button key={val} type="button" onClick={() => setPillar(val)}
                            className="flex-1 py-1.5 text-[10px] font-[500] uppercase tracking-wider rounded-pill border transition-all"
                            style={{
                              borderColor: pillar === val ? col : 'rgba(26,26,26,0.10)',
                              background:  pillar === val ? bg  : 'transparent',
                              color:       pillar === val ? col : 'rgba(26,26,26,0.4)',
                            }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Account + Date row */}
                  {activeForm === 'TRANSFERENCIA' ? (
                    /* Accounts for transfers */
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="muji-header block mb-1">Desde Cuenta</label>
                          <select id="tx-account" value={accountId} onChange={e => handleSourceAccountChange(e.target.value)}
                            className="muji-input" required>
                            {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="muji-header block mb-1">Hacia Cuenta</label>
                          <select id="tx-account-dest" value={toAccountId} onChange={e => handleTargetAccountChange(e.target.value)}
                            className="muji-input" required>
                            {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="muji-header block mb-1">Fecha</label>
                        <input id="tx-date" type="date" value={date} onChange={e => setDate(e.target.value)}
                          className="muji-input" required />
                      </div>
                    </div>
                  ) : (
                    /* Account + Date row standard */
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="muji-header block mb-1">Cuenta</label>
                        <select id="tx-account" value={accountId} onChange={e => setAccountId(e.target.value)}
                          className="muji-input" required>
                          {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="muji-header block mb-1">Fecha</label>
                        <input id="tx-date" type="date" value={date} onChange={e => setDate(e.target.value)}
                          className="muji-input" required />
                      </div>
                    </div>
                  )}

                  {error && <p className="text-[12px] font-[500]" style={{ color: '#B8860B' }} id="fab-error">{error}</p>}

                  {/* Submit */}
                  <button type="submit" id="fab-submit-btn"
                    className="w-full py-3.5 rounded-[6px] text-[13px] font-[500] uppercase tracking-wider transition-all active:scale-[0.98]"
                    style={{ background: '#1A1A1A', color: '#F5F2ED' }}>
                    Guardar
                  </button>
                </div>
              )}
            </form>
          </div>
        </>
      )}
    </>
  );
}
