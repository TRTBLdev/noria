import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db.js';
import { sha256 } from '../config/access.private.js';
import { Check, ArrowRight, ArrowLeft, Shield } from 'lucide-react';

export default function OnboardingScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [loading, setLoading] = useState(false);

  const stepsTotal = 4;

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

    if (pin.length < 4 || pin.length > 6) {
      setPinError('El PIN debe tener entre 4 y 6 dígitos');
      return;
    }

    if (pin !== confirmPin) {
      setPinError('Los PINs no coinciden');
      return;
    }

    setLoading(true);
    try {
      const hashedPin = await sha256(pin);

      // Save onboarding config
      await db.app_config.put({ key: 'baseCurrency', value: baseCurrency });
      await db.app_config.put({ key: 'monthlyIncome', value: parseFloat(monthlyIncome) || 0 });
      await db.app_config.put({ key: 'hashedPin', value: hashedPin });
      await db.app_config.put({ key: 'onboardingComplete', value: true });

      // Add standard cash account automatically matching base currency
      const cashInstId = await db.institutions.add({
        name: 'Efectivo Personal',
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

      navigate('/home');
    } catch (err) {
      setPinError('Error al guardar configuración');
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
          // Step 2: Base Currency Selection
          <div className="space-y-6 animate-fade-in" id="onboarding-step-currency">
            <h2 className="text-xl font-light tracking-wide text-noria-text">
              Moneda Base
            </h2>
            <p className="text-sm font-light text-noria-text/60 leading-relaxed">
              Elige la divisa en la que medirás tu homeostasis y tu Línea de Flotación agregada.
            </p>

            <div className="space-y-2 pt-4">
              <label htmlFor="currency-select" className="muji-header block mb-2">Seleccionar moneda</label>
              <select
                id="currency-select"
                value={baseCurrency}
                onChange={e => setBaseCurrency(e.target.value)}
                className="muji-input text-base"
              >
                <option value="USD">USD — Dólar Americano</option>
                <option value="USDT">USDT — Tether Stablecoin</option>
                <option value="USDC">USDC — USD Coin Stablecoin</option>
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          // Step 3: Optional Monthly Income
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

        {step === 3 && (
          // Step 4: Security PIN Setup
          <div className="space-y-6 animate-fade-in" id="onboarding-step-pin">
            <h2 className="text-xl font-light tracking-wide text-noria-text">
              Crea tu PIN de Acceso
            </h2>
            <p className="text-sm font-light text-noria-text/60 leading-relaxed">
              Crea un código de 4 a 6 dígitos para proteger tu información en este dispositivo.
            </p>

            <div className="space-y-4 pt-4">
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
            className="flex items-center space-x-2 py-2 px-5 bg-noria-text text-noria-bg rounded-noria text-sm font-light uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <span>Continuar</span>
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            id="onboarding-finish-btn"
            onClick={handleComplete}
            disabled={loading || pin.length < 4 || confirmPin.length < 4}
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
