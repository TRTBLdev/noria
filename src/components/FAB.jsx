import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { Plus, ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';

export default function FAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeForm, setActiveForm] = useState(null); // 'GASTO' | 'INGRESO' | null
  const paletteRef = useRef(null);

  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const incomeSources = useLiveQuery(() => db.income_sources.toArray()) || [];
  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const baseCurrency = baseCurrencyObj?.value || 'USD';

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [pillar, setPillar] = useState('NEED');
  const [tagId, setTagId] = useState('');
  const [description, setDescription] = useState('');
  const [incomeSourceId, setIncomeSourceId] = useState('');
  const [newSourceName, setNewSourceName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (accounts.length > 0 && !accountId) setAccountId(accounts[0].id.toString());
    if (tags.length > 0 && !tagId) setTagId(tags[0].id.toString());
    if (incomeSources.length > 0 && !incomeSourceId) setIncomeSourceId(incomeSources[0].id.toString());
  }, [accounts, tags, incomeSources]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (paletteRef.current && !paletteRef.current.contains(e.target)) {
        const fabBtn = document.getElementById('universal-fab-btn');
        if (fabBtn && fabBtn.contains(e.target)) return;
        handleClose();
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const resetForm = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setAmount('');
    setPillar('NEED');
    setDescription('');
    setNewSourceName('');
    setError('');
    setSuccess(false);
    if (accounts.length > 0) setAccountId(accounts[0].id.toString());
    if (tags.length > 0) setTagId(tags[0].id.toString());
    if (incomeSources.length > 0) setIncomeSourceId(incomeSources[0].id.toString());
  };

  const handleOpen = () => {
    resetForm();
    setActiveForm(null);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
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
      const selectedAccount = accounts.find(a => a.id.toString() === accountId);
      if (!selectedAccount) { setError('Cuenta no encontrada'); return; }

      // Handle new income source creation if requested
      let resolvedIncomeSourceId = incomeSourceId ? parseInt(incomeSourceId) : null;
      if (activeForm === 'INGRESO' && newSourceName.trim()) {
        const existing = incomeSources.find(s => s.name.toLowerCase() === newSourceName.trim().toLowerCase());
        if (existing) {
          resolvedIncomeSourceId = existing.id;
        } else {
          resolvedIncomeSourceId = await db.income_sources.add({
            name: newSourceName.trim(),
            type: 'OTHER',
            isActive: true
          });
        }
      }

      await db.transactions.add({
        date: new Date(date + 'T12:00:00'),
        type: activeForm === 'GASTO' ? 'OUT' : 'IN',
        amount: parsedAmount,
        currency: selectedAccount.currency,
        accountId: parseInt(accountId),
        tagId: activeForm === 'GASTO' ? parseInt(tagId) : null,
        pillar: activeForm === 'GASTO' ? pillar : null,
        incomeSourceId: activeForm === 'INGRESO' ? resolvedIncomeSourceId : null,
        description: description.trim()
      });

      const delta = activeForm === 'GASTO' ? -parsedAmount : parsedAmount;
      await db.accounts.update(parseInt(accountId), {
        balance: selectedAccount.balance + delta
      });

      setSuccess(true);
      setTimeout(() => handleClose(), 900);
    } catch (err) {
      setError('Error al registrar transacción');
    }
  };

  return (
    <>
      {/* FAB Button */}
      <button
        id="universal-fab-btn"
        onClick={isOpen ? handleClose : handleOpen}
        className="fixed bottom-20 right-6 w-12 h-12 rounded-full bg-noria-text text-noria-bg flex items-center justify-center shadow-md hover:opacity-85 active:scale-95 transition-all z-40 focus:outline-none"
        aria-label="Agregar registro"
      >
        <Plus size={22} strokeWidth={1.5} className={`transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`} />
      </button>

      {/* Command Palette — slides in from right */}
      <div
        ref={paletteRef}
        className={`fixed top-0 right-0 h-full w-80 max-w-[88vw] bg-noria-bg border-l border-noria-text/8 z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Palette Header */}
        <div className="flex justify-between items-center px-6 pt-12 pb-6 border-b border-noria-text/6">
          <h3 className="text-[10px] font-light uppercase tracking-[0.2em] text-noria-text/50">
            {activeForm ? (activeForm === 'GASTO' ? 'Registrar Gasto' : 'Registrar Ingreso') : 'Nuevo Registro'}
          </h3>
          <button id="close-palette-btn" onClick={handleClose} className="text-noria-text/40 hover:text-noria-text focus:outline-none">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Palette Body */}
        <div className="flex-1 overflow-y-auto">
          {!activeForm && (
            // Command options list
            <nav className="py-4" id="fab-command-list">
              <button
                id="fab-opt-gasto"
                onClick={() => setActiveForm('GASTO')}
                className="w-full flex items-center space-x-4 px-6 py-4 hover:bg-noria-text/3 transition-colors focus:outline-none border-b border-noria-text/5 group"
              >
                <div className="w-8 h-8 rounded-full border border-noria-amber/30 flex items-center justify-center group-hover:border-noria-amber/60 transition-colors">
                  <ArrowDownLeft size={14} strokeWidth={1.5} className="text-noria-amber" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-light text-noria-text">Gasto</span>
                  <span className="text-[10px] font-light text-noria-text/40 mt-0.5">Registrar un egreso</span>
                </div>
              </button>

              <button
                id="fab-opt-ingreso"
                onClick={() => setActiveForm('INGRESO')}
                className="w-full flex items-center space-x-4 px-6 py-4 hover:bg-noria-text/3 transition-colors focus:outline-none group"
              >
                <div className="w-8 h-8 rounded-full border border-noria-salvia/30 flex items-center justify-center group-hover:border-noria-salvia/60 transition-colors">
                  <ArrowUpRight size={14} strokeWidth={1.5} className="text-noria-salvia" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-light text-noria-text">Ingreso</span>
                  <span className="text-[10px] font-light text-noria-text/40 mt-0.5">Registrar dinero recibido</span>
                </div>
              </button>
            </nav>
          )}

          {activeForm && (
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-5" id="fab-transaction-form">
              {success ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3 text-noria-salvia">
                  <div className="w-12 h-12 rounded-full border border-noria-salvia/30 flex items-center justify-center">
                    <span className="text-lg">✓</span>
                  </div>
                  <p className="text-xs font-light uppercase tracking-widest">Guardado</p>
                </div>
              ) : (
                <>
                  {/* Amount — large and prominent */}
                  <div className="py-4 border-b border-noria-text/8">
                    <label className="muji-header block mb-2">Monto ({baseCurrency})</label>
                    <input
                      id="tx-amount"
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full text-2xl font-extralight bg-transparent outline-none text-noria-text placeholder:text-noria-text/15"
                      autoFocus
                      required
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="muji-header block mb-1">Descripción</label>
                    <input
                      id="tx-description"
                      type="text"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder={activeForm === 'GASTO' ? 'Ej. Supermercado Central Madeirense' : 'Ej. Proyecto Casa Díaz'}
                      className="muji-input text-sm"
                    />
                  </div>

                  {/* Income Source (only for INGRESO) */}
                  {activeForm === 'INGRESO' && (
                    <div>
                      <label className="muji-header block mb-1">Fuente de Ingreso</label>
                      {incomeSources.length > 0 ? (
                        <select
                          id="tx-income-source"
                          value={incomeSourceId}
                          onChange={e => {
                            setIncomeSourceId(e.target.value);
                            if (e.target.value === 'new') setNewSourceName('');
                          }}
                          className="muji-input text-sm"
                        >
                          {incomeSources.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                          <option value="new">+ Nueva fuente...</option>
                        </select>
                      ) : (
                        <p className="text-[10px] text-noria-text/40 font-light">No hay fuentes. Escribe el nombre:</p>
                      )}
                      {(incomeSourceId === 'new' || incomeSources.length === 0) && (
                        <input
                          id="tx-new-source"
                          type="text"
                          value={newSourceName}
                          onChange={e => setNewSourceName(e.target.value)}
                          placeholder="Ej. Estudio CKM Visualización"
                          className="muji-input text-sm mt-2"
                        />
                      )}
                    </div>
                  )}

                  {/* Pilar (only for GASTO) */}
                  {activeForm === 'GASTO' && (
                    <div>
                      <label className="muji-header block mb-2">Pilar</label>
                      <div className="flex space-x-2">
                        {[['NEED', 'Necesidad'], ['WANT', 'Deseo'], ['SAVE', 'Ahorro']].map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setPillar(val)}
                            className={`flex-1 py-1.5 text-[10px] font-light uppercase tracking-wider border rounded-full transition-all ${
                              pillar === val
                                ? val === 'NEED' ? 'border-noria-salvia bg-noria-salvia/10 text-noria-salvia'
                                  : val === 'WANT' ? 'border-noria-slate bg-noria-slate/10 text-noria-slate'
                                  : 'border-noria-amber bg-noria-amber/10 text-noria-amber'
                                : 'border-noria-text/10 text-noria-text/40'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Account */}
                  <div>
                    <label className="muji-header block mb-1">Cuenta</label>
                    <select
                      id="tx-account"
                      value={accountId}
                      onChange={e => setAccountId(e.target.value)}
                      className="muji-input text-sm"
                      required
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                      ))}
                    </select>
                  </div>

                  {/* Date */}
                  <div>
                    <label className="muji-header block mb-1">Fecha</label>
                    <input
                      id="tx-date"
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="muji-input text-sm"
                      required
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-noria-amber font-light text-center" id="fab-form-error">{error}</p>
                  )}

                  {/* Actions */}
                  <div className="flex space-x-2 pt-2 pb-6">
                    <button
                      type="button"
                      id="fab-form-back-btn"
                      onClick={() => setActiveForm(null)}
                      className="flex-1 py-2.5 text-xs font-light uppercase tracking-wider text-noria-text/50 hover:text-noria-text transition-colors border-b border-noria-text/10"
                    >
                      Atrás
                    </button>
                    <button
                      type="submit"
                      id="fab-form-submit-btn"
                      className="flex-1 py-2.5 text-xs font-light uppercase tracking-wider text-noria-salvia border-b border-noria-salvia/30 hover:border-noria-salvia transition-colors"
                    >
                      Guardar
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Subtle dim overlay (not blur) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-noria-text/10 z-40"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}
    </>
  );
}
