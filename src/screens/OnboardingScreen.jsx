import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db.js';
import { sha256 } from '../config/access.private.js';
import { Check, ArrowRight, ArrowLeft, Shield, Plus, Trash2 } from 'lucide-react';

export default function OnboardingScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [currencies, setCurrencies] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState('');
  const [lotCurrency, setLotCurrency] = useState('');
  const [currencyRelations, setCurrencyRelations] = useState({});
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [usePin, setUsePin] = useState(true);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currencyError, setCurrencyError] = useState('');
  const [newCurrency, setNewCurrency] = useState({
    code: '', name: '', symbol: '', symbolPosition: 'before', decimalPlaces: 2, isFiat: true,
  });

  const stepsTotal = 5;

  useEffect(() => {
    if (baseCurrency && !currencies.some(currency => currency.code === baseCurrency)) setBaseCurrency('');
    if (lotCurrency && (!currencies.some(currency => currency.code === lotCurrency) || lotCurrency === baseCurrency)) {
      setLotCurrency('');
    }
  }, [currencies, baseCurrency, lotCurrency]);

  const handleAddCurrency = (e) => {
    e.preventDefault();
    setCurrencyError('');
    const code = newCurrency.code.trim().toUpperCase();
    const name = newCurrency.name.trim();
    const symbol = newCurrency.symbol.trim();
    if (!/^[A-Z]{3,4}$/.test(code)) return setCurrencyError('El código debe tener entre 3 y 4 letras.');
    if (!name || !symbol) return setCurrencyError('Completa nombre y símbolo.');
    if (currencies.some(currency => currency.code === code)) return setCurrencyError('Esa divisa ya existe.');
    setCurrencies(previous => [...previous, {
      code, name, symbol,
      symbolPosition: newCurrency.symbolPosition,
      decimalPlaces: Number(newCurrency.decimalPlaces),
      isFiat: newCurrency.isFiat,
      isActive: true,
    }].sort((a, b) => a.code.localeCompare(b.code)));
    setCurrencyRelations(prev => ({ ...prev, [code]: { mode: 'UNTRACKED', unitsPerBase: '1' } }));
    setNewCurrency({ code: '', name: '', symbol: '', symbolPosition: 'before', decimalPlaces: 2, isFiat: true });
    if (!baseCurrency) setBaseCurrency(code);
  };

  const handleDeleteCurrency = (currency) => {
    if (currency.code === baseCurrency) setBaseCurrency('');
    if (currency.code === lotCurrency) setLotCurrency('');
    setCurrencyRelations(prev => {
      const next = { ...prev };
      delete next[currency.code];
      return next;
    });
    setCurrencies(previous => previous.filter(item => item.code !== currency.code));
  };

  const updateCurrencyRelation = (code, patch) => {
    setCurrencyRelations(prev => ({
      ...prev,
      [code]: { mode: 'UNTRACKED', unitsPerBase: '1', ...prev[code], ...patch },
    }));
  };

  const handleNext = () => {
    if (step < stepsTotal - 1) {
      setStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(prev => prev - 1);
    }
  };

  const handleComplete = async (e) => {
    e.preventDefault();
    setPinError('');

    if (!baseCurrency || !currencies.some(currency => currency.code === baseCurrency)) {
      setPinError('Selecciona una moneda base válida.');
      return;
    }
    if (lotCurrency === baseCurrency) {
      setPinError('La divisa de lotes debe ser distinta de la moneda base.');
      return;
    }
    const invalidParity = currencies.some(currency => {
      if (currency.code === baseCurrency || currency.code === lotCurrency) return false;
      const relation = currencyRelations[currency.code];
      return relation?.mode === 'PARITY' && (!Number.isFinite(Number(relation.unitsPerBase)) || Number(relation.unitsPerBase) <= 0);
    });
    if (invalidParity) {
      setPinError('Toda paridad debe ser mayor a cero.');
      return;
    }

    if (usePin) {
      if (pin.length < 4 || pin.length > 6) {
        setPinError('El PIN debe tener entre 4 y 6 dígitos');
        return;
      }
      if (pin !== confirmPin) {
        setPinError('Los PINs no coinciden');
        return;
      }
    }

    setLoading(true);
    try {
      const hashedPin = usePin ? await sha256(pin) : null;

      await db.transaction('rw', [db.app_config, db.institutions, db.accounts, db.currencies], async () => {
        await db.currencies.clear();
        await db.currencies.bulkAdd(currencies.map(currency => {
          const relation = currency.code === baseCurrency
            ? 'BASE'
            : currency.code === lotCurrency
              ? 'LOTS'
              : currencyRelations[currency.code]?.mode || 'UNTRACKED';
          return {
            ...currency,
            baseRelation: relation,
            unitsPerBase: relation === 'PARITY' ? Number(currencyRelations[currency.code]?.unitsPerBase) : undefined,
          };
        }));
        await db.app_config.put({ key: 'baseCurrency', value: baseCurrency });
        await db.app_config.put({ key: 'lotCurrency', value: lotCurrency || null });
        await db.app_config.put({ key: 'monthlyIncome', value: parseFloat(monthlyIncome) || 0 });
        await db.app_config.put({ key: 'hashedPin', value: hashedPin });
        await db.app_config.put({ key: 'accessGranted', value: true });

        const cashInstId = await db.institutions.add({
          name: 'Efectivo',
          type: 'CASH',
          country: 'VE'
        });

        await db.accounts.add({
          institutionId: cashInstId,
          name: `Efectivo (${baseCurrency})`,
          type: 'CASH',
          currency: baseCurrency,
          balance: 0
        });

        await db.app_config.put({ key: 'onboardingComplete', value: true });
      });

      const [completed, storedBase, storedCurrencies] = await Promise.all([
        db.app_config.get('onboardingComplete'),
        db.app_config.get('baseCurrency'),
        db.currencies.count(),
      ]);
      if (completed?.value !== true || storedBase?.value !== baseCurrency || storedCurrencies !== currencies.length) {
        throw new Error('La configuración final no quedó completamente persistida.');
      }

      navigate('/home', { replace: true });
    } catch (err) {
      console.error('Error completing onboarding:', err);
      setPinError(`No se pudo completar: ${err.message || 'error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-tr from-[#F2EEE8] via-[#EFEBE4] to-[#E9E5DB] flex flex-col justify-between p-8 font-sans max-w-md mx-auto">
      {/* Top Header */}
      <header className="pt-6">
        <div className="flex justify-between items-center">
          <span className="text-xs font-light text-noria-text/40 tracking-[0.2em] uppercase select-none">
            Noria
          </span>
          <span className="text-xs font-light text-noria-text/40 tracking-wider">
            {step + 1} / {stepsTotal}
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-noria-text/5 h-[1px] mt-4 rounded-full overflow-hidden">
          <div
            className="bg-noria-salvia h-full transition-all duration-300"
            style={{ width: `${((step + 1) / stepsTotal) * 100}%` }}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <section className="flex-1 flex flex-col justify-center py-12">
        {step === 0 && (
          // Step 1: Privacy Manifesto
          <div className="space-y-6 animate-fade-in" id="onboarding-step-manifesto">
            <div className="w-12 h-12 rounded-full bg-noria-salvia/10 flex items-center justify-center text-noria-salvia">
              <Shield size={24} />
            </div>
            <h2 className="text-xl font-light tracking-wide text-noria-text">
              Manifiesto de Soberanía Digital
            </h2>
            <div className="space-y-4 text-sm font-light text-noria-text/70 leading-relaxed">
              <p>
                Noria vive en tu dispositivo. No hay servidor que guarde tus datos, no hay empresa que los vea. Solo tú y tu economía, en privado.
              </p>
              <p>
                Esta es una promesa técnica, no solo de palabra: la app funciona sin internet. Si algún día la cierras, tus datos permanecen aquí, a salvo. Si eliges borrarlos, desaparecen para siempre — de verdad.
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5 animate-fade-in" id="onboarding-step-currency">
            <h2 className="text-xl font-light tracking-wide text-noria-text">Tus divisas</h2>
            <p className="text-sm font-light text-noria-text/60 leading-relaxed">
              Crea las divisas que usarás. La moneda base será la unidad contable de Noria y quedará fija al terminar.
            </p>

            <form onSubmit={handleAddCurrency} className="space-y-3 border border-noria-text/15 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="muji-header block">Código</label>
                  <input value={newCurrency.code} maxLength={4} onChange={e => setNewCurrency(prev => ({ ...prev, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))} placeholder="ABC" className="muji-input" />
                </div>
                <div>
                  <label className="muji-header block">Nombre</label>
                  <input value={newCurrency.name} onChange={e => setNewCurrency(prev => ({ ...prev, name: e.target.value }))} placeholder="Nombre" className="muji-input" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="muji-header block">Símbolo</label>
                  <input value={newCurrency.symbol} onChange={e => setNewCurrency(prev => ({ ...prev, symbol: e.target.value }))} placeholder="¤" className="muji-input" />
                </div>
                <div>
                  <label className="muji-header block">Posición</label>
                  <select value={newCurrency.symbolPosition} onChange={e => setNewCurrency(prev => ({ ...prev, symbolPosition: e.target.value }))} className="muji-input">
                    <option value="before">Antes</option>
                    <option value="after">Después</option>
                  </select>
                </div>
                <div>
                  <label className="muji-header block">Decimales</label>
                  <input type="number" min="0" max="8" value={newCurrency.decimalPlaces} onChange={e => setNewCurrency(prev => ({ ...prev, decimalPlaces: e.target.value }))} className="muji-input" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <select value={newCurrency.isFiat ? 'fiat' : 'crypto'} onChange={e => setNewCurrency(prev => ({ ...prev, isFiat: e.target.value === 'fiat' }))} className="muji-input max-w-[140px]">
                  <option value="fiat">Fiat</option>
                  <option value="crypto">Cripto</option>
                </select>
                <button type="submit" className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-noria-salvia"><Plus size={13} /> Añadir</button>
              </div>
              {currencyError && <p className="text-[10px] text-noria-amber">{currencyError}</p>}
            </form>

            <div className="space-y-2 max-h-32 overflow-y-auto">
              {currencies.map(currency => (
                <div key={currency.code} className="flex items-center justify-between border-b border-noria-text/10 py-2">
                  <span className="text-xs"><strong>{currency.code}</strong> · {currency.name}</span>
                  <button type="button" onClick={() => handleDeleteCurrency(currency)} className="text-noria-muted hover:text-[#9F2F2D]" aria-label={`Eliminar ${currency.code}`}><Trash2 size={13} /></button>
                </div>
              ))}
              {currencies.length === 0 && <p className="text-[11px] text-noria-muted text-center py-2">Añade al menos una divisa.</p>}
            </div>

            <div className="space-y-2 pt-1">
              <label htmlFor="currency-select" className="muji-header block">Moneda base</label>
              <select
                id="currency-select"
                value={baseCurrency}
                onChange={e => setBaseCurrency(e.target.value)}
                className="muji-input text-base"
              >
                <option value="" disabled>Selecciona...</option>
                {currencies.map(currency => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-fade-in" id="onboarding-step-lots">
            <h2 className="text-xl font-light tracking-wide text-noria-text">Seguimiento por lotes</h2>
            <div className="space-y-3 text-sm font-light text-noria-text/60 leading-relaxed">
              <p>Los lotes conservan el costo histórico de una divisa en tu moneda base y se consumen en orden FIFO.</p>
              <p>Es útil cuando adquieres una moneda a tasas distintas. Puedes omitirlo y activarlo una sola vez más adelante.</p>
            </div>
            <div className="space-y-2 pt-3">
              <label htmlFor="lot-currency-select" className="muji-header block">Divisa controlada por lotes</label>
              <select id="lot-currency-select" value={lotCurrency} onChange={e => setLotCurrency(e.target.value)} className="muji-input text-base">
                <option value="">No usar lotes por ahora</option>
                {currencies.filter(currency => currency.code !== baseCurrency).map(currency => (
                  <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>
                ))}
              </select>
              {lotCurrency && <p className="text-[10px] text-noria-text/45">Las tasas se expresarán como {lotCurrency} por cada {baseCurrency}.</p>}
            </div>
            <div className="space-y-3 border-t border-noria-text/10 pt-4">
              <div>
                <p className="muji-header">Relación con la moneda base{baseCurrency ? ` (${baseCurrency})` : ''}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-noria-text/45">Declara paridad solo cuando su valor se trate como fijo frente a la base. Las demás quedarán fuera de consolidados.</p>
              </div>
              {currencies.filter(currency => currency.code !== baseCurrency && currency.code !== lotCurrency).map(currency => {
                const relation = currencyRelations[currency.code] || { mode: 'UNTRACKED', unitsPerBase: '1' };
                return (
                  <div key={currency.code} className="grid grid-cols-[1fr_1.2fr] items-end gap-2 border-b border-noria-text/10 pb-3">
                    <div>
                      <label className="muji-header block">{currency.code}</label>
                      <select value={relation.mode} onChange={event => updateCurrencyRelation(currency.code, { mode: event.target.value })} className="muji-input">
                        <option value="UNTRACKED">Sin conversión</option>
                        <option value="PARITY">Paridad fija</option>
                      </select>
                    </div>
                    {relation.mode === 'PARITY' && (
                      <div>
                        <label className="muji-header block">{currency.code} por 1 {baseCurrency}</label>
                        <input type="number" min="0" step="any" value={relation.unitsPerBase} onChange={event => updateCurrencyRelation(currency.code, { unitsPerBase: event.target.value })} className="muji-input" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-fade-in" id="onboarding-step-income">
            <h2 className="text-xl font-light tracking-wide text-noria-text">
              Ingresos del Mes
            </h2>
            <p className="text-sm font-light text-noria-text/60 leading-relaxed">
              ¿Cuál es tu ingreso mensual estimado? Esto ayudará a calcular tus porcentajes de homeostasis (50% Necesidades, 30% Deseos, 20% Ahorro).
            </p>

            <div className="space-y-2 pt-4">
              <label htmlFor="income-input" className="muji-header block">Monto en {baseCurrency}</label>
              <input
                id="income-input"
                type="number"
                inputMode="decimal"
                value={monthlyIncome}
                onChange={e => setMonthlyIncome(e.target.value)}
                placeholder="Ej. 1200"
                className="muji-input text-base"
              />
              <p className="text-[10px] font-light text-noria-text/40">
                Puedes cambiar este valor o añadir fuentes de ingreso detalladas más adelante.
              </p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 animate-fade-in" id="onboarding-step-pin">
            <h2 className="text-xl font-light tracking-wide text-noria-text">
              PIN de Seguridad
            </h2>
            <p className="text-sm font-light text-noria-text/60 leading-relaxed">
              Protege el acceso a tu información financiera en este dispositivo.
            </p>
            <p className="text-[11px] font-light text-noria-text/50 leading-relaxed border-l border-noria-text/20 pl-3">
              Crea un PIN nuevo de 4 a 6 dígitos. No introduzcas aquí la clave beta con letras.
            </p>

            <div className="pt-2 space-y-4">
              <div className="flex items-center space-x-3 p-3 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.02)]">
                <input
                  type="checkbox"
                  id="enable-pin-checkbox"
                  checked={usePin}
                  onChange={e => setUsePin(e.target.checked)}
                  className="rounded border-[rgba(26,26,26,0.15)] text-[#5C7A52] focus:ring-[#5C7A52] w-4 h-4 cursor-pointer"
                />
                <label htmlFor="enable-pin-checkbox" className="text-xs font-[500] text-noria-text/75 uppercase tracking-wide cursor-pointer select-none">
                  Habilitar PIN de acceso
                </label>
              </div>

              {usePin ? (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <label htmlFor="pin-input" className="muji-header block">PIN de acceso</label>
                    <input
                      id="pin-input"
                      type="password"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      maxLength={6}
                      value={pin}
                      onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      className="muji-input text-center text-lg tracking-[0.3em]"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirm-pin-input" className="muji-header block">Confirmar PIN</label>
                    <input
                      id="confirm-pin-input"
                      type="password"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      maxLength={6}
                      value={confirmPin}
                      onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      className="muji-input text-center text-lg tracking-[0.3em]"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3 border border-dashed border-[rgba(0,0,0,0.08)] rounded bg-transparent animate-fade-in">
                  <p className="text-[12px] text-noria-text/60 leading-relaxed">
                    Has omitido el PIN de acceso. Tu homeostasis financiera se cargará directamente al iniciar la aplicación. Podrás activarlo cuando lo desees en la sección de Ajustes.
                  </p>
                </div>
              )}

              {pinError && (
                <p className="text-xs text-noria-amber font-light tracking-wide text-center" id="onboarding-pin-error">
                  {pinError}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Navigation Buttons */}
      <footer className="flex justify-between items-center py-6">
        {step > 0 ? (
          <button
            id="onboarding-prev-btn"
            onClick={handleBack}
            className="flex items-center space-x-2 text-noria-text/60 hover:text-noria-text text-sm font-light uppercase tracking-wider transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Atrás</span>
          </button>
        ) : (
          <div /> // Spacer
        )}

        {step < stepsTotal - 1 ? (
          <button
            id="onboarding-next-btn"
            onClick={handleNext}
            disabled={step === 1 && !baseCurrency}
            className="flex items-center space-x-2 py-2 px-5 bg-noria-text text-noria-bg rounded-noria text-sm font-light uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30"
          >
            <span>Continuar</span>
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            id="onboarding-finish-btn"
            onClick={handleComplete}
            disabled={loading || (usePin && (pin.length < 4 || confirmPin.length < 4))}
            className="flex items-center space-x-2 py-2 px-5 bg-noria-text text-noria-bg rounded-noria text-sm font-light uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:scale-100"
          >
            <span>Listo</span>
            <Check size={16} />
          </button>
        )}
      </footer>
    </main>
  );
}
