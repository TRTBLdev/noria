import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import { sha256 } from '../config/access.private.js';
import { Download, Upload, EyeOff, Fingerprint, Palette, DollarSign, Trash2, BarChart2, Lock } from 'lucide-react';


const Toggle = ({ id, value, onToggle }) => (
  <button id={id} onClick={onToggle}
    className="w-10 h-5 rounded-full p-0.5 transition-colors focus:outline-none"
    style={{ background: value ? '#5C7A52' : 'rgba(26,26,26,0.12)' }}>
    <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
      style={{ transform: value ? 'translateX(20px)' : 'translateX(0)' }} />
  </button>
);

export default function SettingsScreen() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError]     = useState('');

  const baseCurrencyObj  = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const monthlyIncomeObj = useLiveQuery(() => db.app_config.get('monthlyIncome'));
  const maskBalancesObj  = useLiveQuery(() => db.app_config.get('maskBalances'));
  const biometricLockObj = useLiveQuery(() => db.app_config.get('biometricLock'));
  const themeObj         = useLiveQuery(() => db.app_config.get('theme'));
  const pillarPctObj     = useLiveQuery(() => db.app_config.get('pillarPct'));
  const hashedPinObj     = useLiveQuery(() => db.app_config.get('hashedPin'));

  const baseCurrency   = baseCurrencyObj?.value  || 'USD';
  const monthlyIncome  = monthlyIncomeObj?.value  || 0;
  const maskBalances   = maskBalancesObj?.value   || false;
  const biometricLock  = biometricLockObj?.value  || false;
  const theme          = themeObj?.value          || 'System';
  const pillarPct      = pillarPctObj?.value      || { NEED: 50, WANT: 30, SAVE: 20 };
  const hasPin         = !!hashedPinObj?.value;

  // PIN settings states
  const [isConfiguringPin, setIsConfiguringPin]   = useState(false);
  const [isDeactivatingPin, setIsDeactivatingPin] = useState(false);
  const [isChangingPin, setIsChangingPin]         = useState(false);
  const [pinInput, setPinInput]                   = useState('');
  const [confirmPinInput, setConfirmPinInput]     = useState('');
  const [currentPinVerify, setCurrentPinVerify]   = useState('');
  const [pinError, setPinError]                   = useState('');


  // Local pillar percentages for editing
  const [needPct,  setNeedPct]  = useState(pillarPct.NEED);
  const [wantPct,  setWantPct]  = useState(pillarPct.WANT);
  const [savePct,  setSavePct]  = useState(pillarPct.SAVE);
  const [pillarError, setPillarError] = useState('');

  // Sync from DB when loaded
  useEffect(() => {
    if (pillarPctObj?.value) {
      setNeedPct(pillarPctObj.value.NEED);
      setWantPct(pillarPctObj.value.WANT);
      setSavePct(pillarPctObj.value.SAVE);
    }
  }, [pillarPctObj]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'Dark') root.classList.add('dark');
    else if (theme === 'Light') root.classList.remove('dark');
    else root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, [theme]);

  const putConfig = async (key, value) => db.app_config.put({ key, value });
  const toggleConfig = async (key, val) => db.app_config.put({ key, value: !val });

  const handleTogglePin = async () => {
    setPinError('');
    if (hasPin) {
      setIsDeactivatingPin(true);
      setIsConfiguringPin(false);
      setIsChangingPin(false);
      setCurrentPinVerify('');
    } else {
      setIsConfiguringPin(true);
      setIsDeactivatingPin(false);
      setIsChangingPin(false);
      setPinInput('');
      setConfirmPinInput('');
    }
  };

  const handleDisablePin = async (e) => {
    e.preventDefault();
    setPinError('');
    try {
      const hashedInput = await sha256(currentPinVerify);
      if (hashedInput === hashedPinObj.value) {
        await putConfig('hashedPin', null);
        setIsDeactivatingPin(false);
        setCurrentPinVerify('');
        setMessage('PIN de seguridad desactivado');
        setTimeout(() => setMessage(''), 2000);
      } else {
        setPinError('PIN actual incorrecto');
      }
    } catch {
      setPinError('Error al desactivar el PIN');
    }
  };

  const handleEnablePin = async (e) => {
    e.preventDefault();
    setPinError('');
    if (pinInput.length < 4 || pinInput.length > 6) {
      setPinError('El PIN debe tener entre 4 y 6 dígitos');
      return;
    }
    if (pinInput !== confirmPinInput) {
      setPinError('Los PINs no coinciden');
      return;
    }
    try {
      const hashed = await sha256(pinInput);
      await putConfig('hashedPin', hashed);
      setIsConfiguringPin(false);
      setPinInput('');
      setConfirmPinInput('');
      setMessage('PIN de seguridad activado');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setPinError('Error al activar el PIN');
    }
  };

  const handleChangePin = async (e) => {
    e.preventDefault();
    setPinError('');
    if (pinInput.length < 4 || pinInput.length > 6) {
      setPinError('El nuevo PIN debe tener entre 4 y 6 dígitos');
      return;
    }
    if (pinInput !== confirmPinInput) {
      setPinError('Los nuevos PINs no coinciden');
      return;
    }
    try {
      const hashedVerify = await sha256(currentPinVerify);
      if (hashedVerify !== hashedPinObj.value) {
        setPinError('PIN actual incorrecto');
        return;
      }
      const hashed = await sha256(pinInput);
      await putConfig('hashedPin', hashed);
      setIsChangingPin(false);
      setPinInput('');
      setConfirmPinInput('');
      setCurrentPinVerify('');
      setMessage('PIN cambiado con éxito');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setPinError('Error al cambiar el PIN');
    }
  };

  const savePillarPct = async () => {
    const total = parseInt(needPct) + parseInt(wantPct) + parseInt(savePct);
    if (total !== 100) {
      setPillarError(`Los porcentajes deben sumar 100%. Ahora suman ${total}%.`);
      return;
    }
    setPillarError('');
    await putConfig('pillarPct', { NEED: parseInt(needPct), WANT: parseInt(wantPct), SAVE: parseInt(savePct) });
    setMessage('Porcentajes guardados');
    setTimeout(() => setMessage(''), 2000);
  };

  const handleExport = async () => {
    setMessage(''); setError(''); setLoading(true);
    try {
      const exportData = {};
      for (const table of db.tables) exportData[table.name] = await table.toArray();
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `noria_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Datos exportados');
    } catch { setError('Error al exportar'); }
    finally { setLoading(false); }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Esta operación reemplazará TODOS los datos actuales. ¿Continuar?')) { e.target.value = ''; return; }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        await db.transaction('rw', db.tables, async () => {
          for (const table of db.tables) {
            if (data[table.name]) { await table.clear(); await table.bulkAdd(data[table.name]); }
          }
        });
        setMessage('Importado. Recargando...');
        setTimeout(() => window.location.reload(), 1500);
      } catch { setError('Archivo inválido'); setLoading(false); }
    };
    reader.readAsText(file);
  };

  const handleClearAll = async () => {
    if (!confirm('¿Estás COMPLETAMENTE seguro? Esta acción es irreversible.')) return;
    setLoading(true);
    try { await db.delete(); window.location.href = '/'; }
    catch { setError('Error al eliminar base de datos'); setLoading(false); }
  };

  // Section row component
  const Row = ({ icon, label, right }) => (
    <div className="noria-row">
      <div className="flex items-center space-x-3">
        <span style={{ color: 'rgba(26,26,26,0.4)' }}>{icon}</span>
        <p className="text-[15px] font-[400] text-noria-text">{label}</p>
      </div>
      {right}
    </div>
  );

  return (
    <div className="min-h-screen pb-24 pt-16" style={{ background: '#F5F2ED' }}>
      <Header title="Configuración" showBack={true} />

      <main className="px-6 max-w-md mx-auto">

        {/* ── Data Portability ── */}
        <section className="py-6" id="portability-section">
          <p className="label-section mb-4">Portabilidad de Datos</p>
          <p className="text-[13px] font-[400] mb-4" style={{ color: 'rgba(26,26,26,0.5)' }}>
            Mueve tu libro de cuentas libremente. Exporta como JSON legible.
          </p>

          <div className="flex space-x-4 mb-3">
            <button id="export-data-btn" onClick={handleExport} disabled={loading}
              className="flex items-center space-x-2 text-[13px] font-[400] focus:outline-none disabled:opacity-30 transition-opacity"
              style={{ color: '#1A1A1A' }}>
              <Download size={14} strokeWidth={1.5} />
              <span>Exportar JSON</span>
            </button>

            <label id="import-data-label"
              className="flex items-center space-x-2 text-[13px] font-[400] cursor-pointer"
              style={{ color: '#1A1A1A' }}>
              <Upload size={14} strokeWidth={1.5} />
              <span>Importar datos</span>
              <input id="import-file-input" type="file" accept=".json" onChange={handleImport} disabled={loading} className="hidden" />
            </label>
          </div>

          {message && <p className="text-[12px] font-[500]" style={{ color: '#5C7A52' }} id="settings-success-msg">{message}</p>}
          {error   && <p className="text-[12px] font-[500]" style={{ color: '#B8860B' }} id="settings-error-msg">{error}</p>}
        </section>

        <div className="noria-divider" />

        {/* ── Privacy Shield ── */}
        <section className="py-6" id="privacy-section">
          <p className="label-section mb-4">Escudo de Privacidad</p>

          <Row
            icon={<EyeOff size={15} strokeWidth={1.5} />}
            label="Ocultar Saldos"
            right={<Toggle id="toggle-mask-balances" value={maskBalances} onToggle={() => toggleConfig('maskBalances', maskBalances)} />}
          />

          <Row
            icon={<Lock size={15} strokeWidth={1.5} />}
            label="PIN de Seguridad"
            right={<Toggle id="toggle-security-pin" value={hasPin} onToggle={handleTogglePin} />}
          />

          {/* Formulario de Activación de PIN */}
          {isConfiguringPin && (
            <form onSubmit={handleEnablePin} className="mt-3 p-4 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.02)] space-y-3 animate-fade-in" id="enable-pin-form">
              <p className="text-[11px] font-[500] text-noria-text/60 uppercase tracking-wider">Habilitar PIN de seguridad</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="muji-header block mb-1">Nuevo PIN</label>
                  <input
                    type="password"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    maxLength={6}
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="muji-input text-center text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="muji-header block mb-1">Confirmar PIN</label>
                  <input
                    type="password"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPinInput}
                    onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="muji-input text-center text-sm"
                    required
                  />
                </div>
              </div>
              {pinError && <p className="text-[11px] font-[500]" style={{ color: '#B8860B' }}>{pinError}</p>}
              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setIsConfiguringPin(false); setPinError(''); }}
                  className="flex-1 py-1.5 text-[11px] border border-[rgba(26,26,26,0.15)] rounded bg-transparent uppercase tracking-wider font-[500]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 text-[11px] rounded uppercase tracking-wider font-[500]"
                  style={{ background: '#1A1A1A', color: '#F5F2ED' }}
                >
                  Activar
                </button>
              </div>
            </form>
          )}

          {/* Formulario de Desactivación de PIN */}
          {isDeactivatingPin && (
            <form onSubmit={handleDisablePin} className="mt-3 p-4 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.02)] space-y-3 animate-fade-in" id="disable-pin-form">
              <p className="text-[11px] font-[500] text-noria-text/60 uppercase tracking-wider">Confirmar Desactivación</p>
              <div>
                <label className="muji-header block mb-1">Introduce tu PIN actual</label>
                <input
                  type="password"
                  pattern="[0-9]*"
                  inputMode="numeric"
                  maxLength={6}
                  value={currentPinVerify}
                  onChange={e => setCurrentPinVerify(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="muji-input text-center text-sm"
                  required
                />
              </div>
              {pinError && <p className="text-[11px] font-[500]" style={{ color: '#B8860B' }}>{pinError}</p>}
              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setIsDeactivatingPin(false); setPinError(''); }}
                  className="flex-1 py-1.5 text-[11px] border border-[rgba(26,26,26,0.15)] rounded bg-transparent uppercase tracking-wider font-[500]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 text-[11px] rounded uppercase tracking-wider font-[500]"
                  style={{ background: '#9F2F2D', color: '#F5F2ED' }}
                >
                  Desactivar
                </button>
              </div>
            </form>
          )}

          {/* Formulario de Cambio de PIN */}
          {isChangingPin && (
            <form onSubmit={handleChangePin} className="mt-3 p-4 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.02)] space-y-3 animate-fade-in" id="change-pin-form">
              <p className="text-[11px] font-[500] text-noria-text/60 uppercase tracking-wider">Cambiar PIN de seguridad</p>
              <div>
                <label className="muji-header block mb-1">PIN Actual</label>
                <input
                  type="password"
                  pattern="[0-9]*"
                  inputMode="numeric"
                  maxLength={6}
                  value={currentPinVerify}
                  onChange={e => setCurrentPinVerify(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="muji-input text-center text-sm mb-2"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="muji-header block mb-1">Nuevo PIN</label>
                  <input
                    type="password"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    maxLength={6}
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="muji-input text-center text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="muji-header block mb-1">Confirmar Nuevo PIN</label>
                  <input
                    type="password"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPinInput}
                    onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="muji-input text-center text-sm"
                    required
                  />
                </div>
              </div>
              {pinError && <p className="text-[11px] font-[500]" style={{ color: '#B8860B' }}>{pinError}</p>}
              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setIsChangingPin(false); setPinError(''); }}
                  className="flex-1 py-1.5 text-[11px] border border-[rgba(26,26,26,0.15)] rounded bg-transparent uppercase tracking-wider font-[500]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 text-[11px] rounded uppercase tracking-wider font-[500]"
                  style={{ background: '#1A1A1A', color: '#F5F2ED' }}
                >
                  Guardar
                </button>
              </div>
            </form>
          )}

          {/* Botón de Cambiar PIN si el PIN ya está activo y no se está editando nada */}
          {hasPin && !isConfiguringPin && !isDeactivatingPin && !isChangingPin && (
            <div className="mt-2 text-right">
              <button
                type="button"
                id="start-change-pin-btn"
                onClick={() => {
                  setIsChangingPin(true);
                  setIsConfiguringPin(false);
                  setIsDeactivatingPin(false);
                  setPinInput('');
                  setConfirmPinInput('');
                  setCurrentPinVerify('');
                  setPinError('');
                }}
                className="text-[11px] font-[500] uppercase tracking-wider text-[#5C7A52] underline underline-offset-2 focus:outline-none"
              >
                Cambiar PIN de seguridad
              </button>
            </div>
          )}
        </section>

        <div className="noria-divider" />

        {/* ── Homeostasis — configurar pilares ── */}
        <section className="py-6" id="homeostasis-config-section">
          <p className="label-section mb-1">Pilares de Homeostasis</p>
          <p className="text-[13px] mb-4" style={{ color: 'rgba(26,26,26,0.5)' }}>
            Ajusta los porcentajes de Necesidades, Deseos y Ahorro. Deben sumar 100%.
          </p>

          <div className="space-y-4">
            {[
              { key: 'NEED', label: 'Necesidades', val: needPct, set: setNeedPct, color: '#5C7A52' },
              { key: 'WANT', label: 'Deseos',      val: wantPct, set: setWantPct, color: '#4A6475' },
              { key: 'SAVE', label: 'Ahorro',      val: savePct, set: setSavePct, color: '#B8860B' },
            ].map(({ key, label, val, set, color }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <p className="text-[14px] font-[400] text-noria-text">{label}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    id={`pillar-pct-${key.toLowerCase()}`}
                    type="number" min="0" max="100" step="1"
                    value={val} onChange={e => set(e.target.value)}
                    className="w-14 text-right bg-transparent outline-none text-[15px] font-[400] text-noria-text border-b border-[rgba(26,26,26,0.10)] pb-0.5 focus:border-[#5C7A52] transition-colors"
                  />
                  <span className="text-[13px]" style={{ color: 'rgba(26,26,26,0.4)' }}>%</span>
                </div>
              </div>
            ))}

            {/* Sum indicator */}
            <div className="flex items-center justify-between pt-1">
              <span className="label-section">Total</span>
              <span
                className="text-[14px] font-[500]"
                style={{ color: parseInt(needPct) + parseInt(wantPct) + parseInt(savePct) === 100 ? '#5C7A52' : '#B8860B' }}
              >
                {(parseInt(needPct) || 0) + (parseInt(wantPct) || 0) + (parseInt(savePct) || 0)}%
              </span>
            </div>

            {pillarError && <p className="text-[11px] font-[500]" style={{ color: '#B8860B' }}>{pillarError}</p>}

            <button id="save-pillar-pct-btn" onClick={savePillarPct}
              className="w-full py-2.5 text-[12px] font-[500] uppercase tracking-wider rounded-[6px] transition-all active:scale-[0.98] mt-1"
              style={{ background: '#1A1A1A', color: '#F5F2ED' }}>
              Guardar Porcentajes
            </button>
          </div>
        </section>

        <div className="noria-divider" />

        {/* ── Preferences ── */}
        <section className="py-6" id="preferences-section">
          <p className="label-section mb-4">Preferencias</p>

          <Row
            icon={<DollarSign size={15} strokeWidth={1.5} />}
            label="Ingreso Mensual Base"
            right={
              <input type="number" value={monthlyIncome}
                onChange={e => putConfig('monthlyIncome', parseFloat(e.target.value) || 0)}
                className="w-24 text-right bg-transparent outline-none text-[15px] font-[400] text-noria-text border-b border-[rgba(26,26,26,0.10)] pb-0.5 focus:border-[#5C7A52] transition-colors"
                id="settings-income-input" />
            }
          />
          <Row
            icon={<DollarSign size={15} strokeWidth={1.5} />}
            label="Moneda Base"
            right={
              <select value={baseCurrency} onChange={e => putConfig('baseCurrency', e.target.value)}
                className="bg-transparent text-[15px] font-[400] text-noria-text outline-none border-b border-[rgba(26,26,26,0.10)] pb-0.5"
                id="settings-currency-select">
                <option value="USD">USD</option>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
            }
          />
          <Row
            icon={<Palette size={15} strokeWidth={1.5} />}
            label="Apariencia"
            right={
              <select value={theme} onChange={e => putConfig('theme', e.target.value)}
                className="bg-transparent text-[15px] font-[400] text-noria-text outline-none border-b border-[rgba(26,26,26,0.10)] pb-0.5"
                id="settings-theme-select">
                <option value="System">Sistema</option>
                <option value="Light">Claro</option>
                <option value="Dark">Oscuro</option>
              </select>
            }
          />
        </section>

        <div className="noria-divider" />

        {/* ── Danger Zone ── */}
        <section className="py-8 flex justify-center" id="danger-zone-section">
          <button id="clear-all-data-btn" onClick={handleClearAll} disabled={loading}
            className="flex items-center space-x-2 text-[12px] font-[500] uppercase tracking-wider focus:outline-none disabled:opacity-30 border-b pb-0.5 transition-all"
            style={{ color: '#9F2F2D', borderColor: 'rgba(159,47,45,0.25)' }}>
            <Trash2 size={12} strokeWidth={1.5} />
            <span>Eliminar todos mis datos</span>
          </button>
        </section>

      </main>
    </div>
  );
}
