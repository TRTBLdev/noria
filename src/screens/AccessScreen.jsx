import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db.js';
import { validateBetaCode, sha256 } from '../config/access.private.js';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';

export default function AccessScreen() {
  const navigate = useNavigate();
  const [hasConfig, setHasConfig] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkExistingAccess() {
      const config = await db.app_config.get('onboardingComplete');
      const pinObj = await db.app_config.get('hashedPin');
      const granted = await db.app_config.get('accessGranted');

      if (granted && granted.value === true) {
        if (pinObj && pinObj.value) {
          setPinRequired(true);
        } else {
          // If granted access but no PIN, go to onboarding directly
          navigate('/onboarding');
        }
      }
      setHasConfig(true);
    }
    checkExistingAccess();
  }, [navigate]);

  const handleBetaSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const isValid = await validateBetaCode(code);
      if (isValid) {
        // Save access granted to db
        await db.app_config.put({ key: 'accessGranted', value: true });
        await db.app_config.put({ key: 'accessLevel', value: 'BETA_USER' });
        navigate('/onboarding');
      } else {
        setError('Código de invitación inválido');
        setAttempts(prev => prev + 1);
      }
    } catch (err) {
      setError('Ocurrió un error al validar');
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const storedPinObj = await db.app_config.get('hashedPin');
      if (storedPinObj && storedPinObj.value) {
        const hashedInput = await sha256(pin);
        if (hashedInput === storedPinObj.value) {
          navigate('/home');
        } else {
          setError('PIN incorrecto');
          setAttempts(prev => prev + 1);
        }
      } else {
        setError('Error de configuración del sistema');
      }
    } catch (err) {
      setError('Error al procesar el acceso');
    } finally {
      setLoading(false);
    }
  };

  if (!hasConfig) {
    return (
      <div className="min-h-screen bg-noria-bg flex items-center justify-center font-sans">
        <span className="text-sm font-light text-noria-text/40 tracking-[0.2em] uppercase">Noria</span>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-tr from-[#F2EEE8] via-[#EFEBE4] to-[#E9E5DB] flex flex-col justify-between p-8 font-sans select-none max-w-md mx-auto">
      {/* Top Header Identity */}
      <header className="flex justify-center pt-12">
        <h1 className="text-2xl font-extralight tracking-[0.3em] text-noria-text uppercase select-none">
          Noria
        </h1>
      </header>

      {/* Middle Interactive Zone */}
      <section className="flex-1 flex flex-col justify-center max-w-xs mx-auto w-full">
        {pinRequired ? (
          // PIN Mode (Returning Owner)
          <form onSubmit={handlePinSubmit} className="space-y-8" id="pin-access-form">
            <div className="text-center space-y-2">
              <h2 className="text-sm font-light uppercase tracking-[0.15em] text-noria-text/70">
                Ingresa tu PIN
              </h2>
              <p className="text-xs font-light text-noria-text/40">
                Tu refugio financiero está cerrado
              </p>
            </div>

            <div className="relative border-b border-noria-text/10 focus-within:border-noria-salvia transition-colors">
              <input
                id="access-pin-input"
                type={showPin ? "text" : "password"}
                pattern="[0-9]*"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                className="w-full text-center text-xl tracking-[0.5em] py-3 bg-transparent outline-none font-light placeholder:text-noria-text/20 placeholder:tracking-normal"
                required
                disabled={loading}
              />
              <button
                type="button"
                id="toggle-pin-visibility"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-noria-text/40 hover:text-noria-text/75 transition-colors focus:outline-none"
              >
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-noria-amber font-light tracking-wide text-center" id="pin-error-msg">
                {error}
              </p>
            )}

            <button
              id="submit-pin-btn"
              type="submit"
              disabled={loading || pin.length < 4}
              className="w-full py-3 rounded-noria bg-noria-text text-noria-bg text-sm font-light uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:scale-100"
            >
              {loading ? 'Accediendo...' : 'Abrir'}
            </button>
          </form>
        ) : (
          // Beta Invitation Code Mode (First Visit)
          <form onSubmit={handleBetaSubmit} className="space-y-8" id="beta-access-form">
            <div className="text-center space-y-3">
              <h2 className="text-sm font-light uppercase tracking-[0.15em] text-noria-text/70">
                Prueba Privada
              </h2>
              <p className="text-xs font-light text-noria-text/40 leading-relaxed">
                Noria es actualmente por invitación. Introduce tu código de acceso beta.
              </p>
            </div>

            <div className="border-b border-noria-text/10 focus-within:border-noria-salvia transition-colors">
              <input
                id="access-code-input"
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Introduce tu código"
                className="w-full text-center py-3 bg-transparent outline-none font-light tracking-widest placeholder:tracking-normal placeholder:text-noria-text/20 text-sm"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-xs text-noria-amber font-light tracking-wide text-center" id="code-error-msg">
                {error}
              </p>
            )}

            <button
              id="submit-code-btn"
              type="submit"
              disabled={loading || code.trim().length === 0}
              className="w-full py-3 rounded-noria bg-noria-text text-noria-bg text-sm font-light uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:scale-100"
            >
              {loading ? 'Validando...' : 'Acceder'}
            </button>
          </form>
        )}
      </section>

      {/* Bottom Footer Notice */}
      <footer className="pb-8 flex flex-col items-center space-y-2 select-none">
        <div className="flex items-center space-y-1 text-noria-text/30">
          <ShieldCheck size={14} className="mr-1.5" />
          <span className="text-[10px] uppercase tracking-[0.1em] font-light">
            Cifrado Local-First
          </span>
        </div>
      </footer>
    </main>
  );
}
