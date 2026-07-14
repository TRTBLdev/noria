import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import { Download, Upload, EyeOff, Fingerprint, Palette, DollarSign, Trash2, Plus, Pencil } from 'lucide-react';

export default function SettingsScreen() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');

  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const monthlyIncomeObj = useLiveQuery(() => db.app_config.get('monthlyIncome'));
  const maskBalancesObj = useLiveQuery(() => db.app_config.get('maskBalances'));
  const biometricLockObj = useLiveQuery(() => db.app_config.get('biometricLock'));
  const themeObj = useLiveQuery(() => db.app_config.get('theme'));
  const incomeSources = useLiveQuery(() => db.income_sources.toArray()) || [];

  const baseCurrency = baseCurrencyObj?.value || 'USD';
  const monthlyIncome = monthlyIncomeObj?.value || 0;
  const maskBalances = maskBalancesObj?.value || false;
  const biometricLock = biometricLockObj?.value || false;
  const theme = themeObj?.value || 'System';

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'Dark') root.classList.add('dark');
    else if (theme === 'Light') root.classList.remove('dark');
    else root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, [theme]);

  const handleExport = async () => {
    setMessage(''); setError(''); setLoading(true);
    try {
      const exportData = {};
      for (const table of db.tables) {
        exportData[table.name] = await table.toArray();
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `noria_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Datos exportados con éxito');
    } catch (err) {
      setError('Error al exportar los datos');
    } finally {
      setLoading(false);
    }
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
      } catch (err) {
        setError('Archivo inválido o corrupto');
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const toggleConfig = async (key, val) => await db.app_config.put({ key, value: !val });
  const putConfig = async (key, value) => await db.app_config.put({ key, value });

  const handleAddSource = async (e) => {
    e.preventDefault();
    if (!newSourceName.trim()) return;
    const exists = incomeSources.find(s => s.name.toLowerCase() === newSourceName.trim().toLowerCase());
    if (!exists) {
      await db.income_sources.add({ name: newSourceName.trim(), type: 'OTHER', isActive: true });
    }
    setNewSourceName('');
    setShowAddSource(false);
  };

  const handleDeleteSource = async (id, name) => {
    if (!confirm(`¿Eliminar la fuente "${name}"?`)) return;
    await db.income_sources.delete(id);
  };

  const handleClearAll = async () => {
    if (!confirm('¿Estás COMPLETAMENTE seguro? Esta acción es irreversible.')) return;
    setLoading(true);
    try {
      await db.delete();
      window.location.href = '/';
    } catch (err) {
      setError('Error al eliminar base de datos');
      setLoading(false);
    }
  };

  // Toggle component
  const Toggle = ({ id, value, onToggle }) => (
    <button id={id} onClick={onToggle}
      className={`w-10 h-5 rounded-full p-0.5 transition-colors focus:outline-none ${value ? 'bg-noria-salvia' : 'bg-noria-text/15'}`}>
      <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ${value ? 'translate-x-5' : ''}`} />
    </button>
  );

  return (
    <div className="min-h-screen bg-noria-bg pb-24 pt-16">
      <Header title="Configuración" showBack={true} />

      <main className="px-6 max-w-md mx-auto">

        {/* Section: Data Portability */}
        <section className="py-6" id="portability-section">
          <h3 className="muji-header mb-4">Portabilidad de Datos</h3>

          <div className="flex space-x-0 divide-x divide-noria-text/8 border-t border-b border-noria-text/8">
            <button id="export-data-btn" onClick={handleExport} disabled={loading}
              className="flex-1 flex items-center justify-center space-x-2 py-4 hover:bg-noria-text/3 transition-colors disabled:opacity-30 focus:outline-none">
              <Download size={14} strokeWidth={1.5} className="text-noria-text/60" />
              <span className="text-xs font-light text-noria-text/70">Exportar JSON</span>
            </button>

            <label id="import-data-label" className="flex-1 flex items-center justify-center space-x-2 py-4 hover:bg-noria-text/3 transition-colors cursor-pointer">
              <Upload size={14} strokeWidth={1.5} className="text-noria-text/60" />
              <span className="text-xs font-light text-noria-text/70">Importar JSON</span>
              <input id="import-file-input" type="file" accept=".json" onChange={handleImport} disabled={loading} className="hidden" />
            </label>
          </div>

          {message && <p className="text-xs text-noria-salvia font-light mt-3" id="settings-success-msg">{message}</p>}
          {error && <p className="text-xs text-noria-amber font-light mt-3" id="settings-error-msg">{error}</p>}
        </section>

        <div className="border-t border-noria-text/8" />

        {/* Section: Privacy Shield */}
        <section className="py-6" id="privacy-section">
          <h3 className="muji-header mb-4">Escudo de Privacidad</h3>

          <div className="divide-y divide-noria-text/5">
            <div className="flex justify-between items-center py-3.5">
              <div className="flex items-center space-x-3">
                <EyeOff size={15} strokeWidth={1.5} className="text-noria-text/40" />
                <div>
                  <p className="text-sm font-light text-noria-text">Ocultar Saldos</p>
                  <p className="text-[10px] font-light text-noria-text/40 mt-0.5">Ofusca montos al iniciar</p>
                </div>
              </div>
              <Toggle id="toggle-mask-balances" value={maskBalances} onToggle={() => toggleConfig('maskBalances', maskBalances)} />
            </div>

            <div className="flex justify-between items-center py-3.5">
              <div className="flex items-center space-x-3">
                <Fingerprint size={15} strokeWidth={1.5} className="text-noria-text/40" />
                <div>
                  <p className="text-sm font-light text-noria-text">Bloqueo Biométrico</p>
                  <p className="text-[10px] font-light text-noria-text/40 mt-0.5">Requiere FaceID / Huella</p>
                </div>
              </div>
              <Toggle id="toggle-biometric-lock" value={biometricLock} onToggle={() => toggleConfig('biometricLock', biometricLock)} />
            </div>
          </div>
        </section>

        <div className="border-t border-noria-text/8" />

        {/* Section: Income Sources */}
        <section className="py-6" id="income-sources-section">
          <div className="flex justify-between items-center mb-4">
            <h3 className="muji-header">Fuentes de Ingreso</h3>
            <button onClick={() => setShowAddSource(!showAddSource)}
              className="flex items-center space-x-1 text-[10px] font-light uppercase tracking-widest text-noria-salvia hover:text-noria-salvia/70 focus:outline-none">
              <Plus size={12} strokeWidth={1.5} />
              <span>Nueva</span>
            </button>
          </div>

          {showAddSource && (
            <form onSubmit={handleAddSource} className="flex space-x-3 mb-4" id="add-income-source-form">
              <input type="text" value={newSourceName} onChange={e => setNewSourceName(e.target.value)}
                placeholder="Ej. Estudio CKM Visualización" className="muji-input flex-1" autoFocus />
              <button type="submit" className="text-xs font-light uppercase tracking-wider text-noria-salvia border-b border-noria-salvia/30 pb-0.5 whitespace-nowrap">
                Añadir
              </button>
            </form>
          )}

          <div className="divide-y divide-noria-text/5">
            {incomeSources.length === 0 ? (
              <p className="text-xs font-light text-noria-text/30 py-4">No hay fuentes registradas.</p>
            ) : (
              incomeSources.map(src => (
                <div key={src.id} className="flex justify-between items-center py-3">
                  <p className="text-sm font-light text-noria-text">{src.name}</p>
                  <button onClick={() => handleDeleteSource(src.id, src.name)}
                    className="text-noria-text/15 hover:text-noria-amber transition-colors p-1 focus:outline-none">
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="border-t border-noria-text/8" />

        {/* Section: Preferences */}
        <section className="py-6" id="preferences-section">
          <h3 className="muji-header mb-4">Preferencias</h3>

          <div className="divide-y divide-noria-text/5">
            <div className="flex justify-between items-center py-3.5">
              <div className="flex items-center space-x-3">
                <DollarSign size={15} strokeWidth={1.5} className="text-noria-text/40" />
                <p className="text-sm font-light text-noria-text">Ingreso Mensual Base</p>
              </div>
              <input type="number" value={monthlyIncome}
                onChange={e => putConfig('monthlyIncome', parseFloat(e.target.value) || 0)}
                className="w-24 text-right bg-transparent outline-none text-sm font-light text-noria-text border-b border-noria-text/10 focus:border-noria-salvia transition-colors pb-0.5"
                id="settings-income-input"
              />
            </div>

            <div className="flex justify-between items-center py-3.5">
              <div className="flex items-center space-x-3">
                <DollarSign size={15} strokeWidth={1.5} className="text-noria-text/40" />
                <p className="text-sm font-light text-noria-text">Moneda Base</p>
              </div>
              <select value={baseCurrency} onChange={e => putConfig('baseCurrency', e.target.value)}
                className="bg-transparent text-sm font-light text-noria-text border-b border-noria-text/10 focus:border-noria-salvia outline-none pb-0.5 transition-colors"
                id="settings-currency-select">
                <option value="USD">USD</option>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
            </div>

            <div className="flex justify-between items-center py-3.5">
              <div className="flex items-center space-x-3">
                <Palette size={15} strokeWidth={1.5} className="text-noria-text/40" />
                <p className="text-sm font-light text-noria-text">Apariencia</p>
              </div>
              <select value={theme} onChange={e => putConfig('theme', e.target.value)}
                className="bg-transparent text-sm font-light text-noria-text border-b border-noria-text/10 focus:border-noria-salvia outline-none pb-0.5 transition-colors"
                id="settings-theme-select">
                <option value="System">Sistema</option>
                <option value="Light">Claro</option>
                <option value="Dark">Oscuro</option>
              </select>
            </div>
          </div>
        </section>

        <div className="border-t border-noria-text/8" />

        {/* Danger Zone */}
        <section className="py-8 flex justify-center" id="danger-zone-section">
          <button id="clear-all-data-btn" onClick={handleClearAll} disabled={loading}
            className="flex items-center space-x-2 text-[10px] font-light text-noria-amber/60 hover:text-noria-amber uppercase tracking-widest border-b border-noria-amber/20 hover:border-noria-amber/50 pb-0.5 transition-all focus:outline-none">
            <Trash2 size={12} strokeWidth={1.5} />
            <span>Eliminar todos mis datos</span>
          </button>
        </section>

      </main>
    </div>
  );
}
