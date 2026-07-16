import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import NoriaSwitch from '../components/NoriaSwitch.jsx';
import CategoryTag from '../components/CategoryTag.jsx';
import { sha256 } from '../config/access.private.js';
import {
  Download,
  Upload,
  Trash2,
  Pencil,
  Plus,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const PILLARS = {
  NEED: { label: 'NECESIDADES', color: '#4F8F58' },
  WANT: { label: 'DESEOS', color: '#3F7F9C' },
  SAVE: { label: 'AHORRO', color: '#C58A14' }
};

const clampPct = (value) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

function SectionAccordion({ title, open, onToggle, action, children, id }) {
  return (
    <section id={id} className="py-3">
      <div className="flex items-center justify-between gap-3 border-b border-[#1A1A1A] pb-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 items-center gap-2 text-left focus:outline-none"
        >
          {open ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
          <h2 className="text-[17px] font-[600] leading-tight text-noria-text">{title}</h2>
        </button>
        {action}
      </div>
      {open && <div className="pt-4">{children}</div>}
    </section>
  );
}

function OutlineButton({ id, children, onClick, disabled, danger = false, as: Component = 'button', type = 'button', className = '', ...props }) {
  return (
    <Component
      id={id}
      type={Component === 'button' ? type : undefined}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-2 border px-3 py-2 font-mono text-[10px] font-[700] uppercase tracking-[0.12em] transition-colors focus:outline-none disabled:opacity-30',
        className
      ].join(' ')}
      style={{
        borderColor: danger ? '#9F2F2D' : '#1A1A1A',
        color: danger ? '#9F2F2D' : '#1A1A1A',
        background: 'transparent'
      }}
      {...props}
    >
      {children}
    </Component>
  );
}

function SettingRow({ label, meta, right, children }) {
  return (
    <div className="border-b border-[#1A1A1A]/12 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[15px] font-[600] text-noria-text">{label}</p>
          {meta && <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-noria-muted">{meta}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function PillarControl({ pillar, value, onChange }) {
  const meta = PILLARS[pillar];
  const numericValue = clampPct(parseInt(value, 10));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.16em]" style={{ color: meta.color }}>
          {meta.label}
        </p>
        <div className="flex items-center gap-1">
          <input
            id={`pillar-pct-${pillar.toLowerCase()}`}
            type="number"
            min="0"
            max="100"
            step="1"
            value={numericValue}
            onChange={e => onChange(pillar, e.target.value)}
            className="w-12 border-0 border-b border-[#1A1A1A]/40 bg-transparent text-right font-mono text-[13px] font-[700] text-noria-text outline-none focus:border-[#647C78]"
          />
          <span className="font-mono text-[11px] text-noria-muted">%</span>
        </div>
      </div>
      <div className="relative h-6">
        <div className="absolute left-0 right-0 top-1/2 h-[6px] -translate-y-1/2 border border-[#1A1A1A] bg-transparent" />
        <div
          className="absolute left-px top-1/2 h-[4px] -translate-y-1/2"
          style={{ width: `${numericValue}%`, background: meta.color }}
        />
        <span
          className="absolute top-1/2 h-5 w-[4px] -translate-x-1/2 -translate-y-1/2 bg-[#1A1A1A]"
          style={{ left: `${numericValue}%` }}
        />
        <input
          type="range"
          min="0"
          max="100"
          value={numericValue}
          onChange={e => onChange(pillar, e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

export default function SettingsScreen() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [openSections, setOpenSections] = useState({
    portability: true,
    privacy: true,
    homeostasis: true,
    catalogs: true,
    preferences: false,
    danger: false,
    institutions: false,
    tags: false
  });

  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const monthlyIncomeObj = useLiveQuery(() => db.app_config.get('monthlyIncome'));
  const maskBalancesObj = useLiveQuery(() => db.app_config.get('maskBalances'));
  const themeObj = useLiveQuery(() => db.app_config.get('theme'));
  const pillarPctObj = useLiveQuery(() => db.app_config.get('pillarPct'));
  const hashedPinObj = useLiveQuery(() => db.app_config.get('hashedPin'));

  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];

  const baseCurrency = baseCurrencyObj?.value || 'USD';
  const monthlyIncome = monthlyIncomeObj?.value || 0;
  const maskBalances = maskBalancesObj?.value || false;
  const theme = themeObj?.value || 'System';
  const pillarPct = pillarPctObj?.value || { NEED: 50, WANT: 30, SAVE: 20 };
  const hasPin = !!hashedPinObj?.value;

  const [editingInstId, setEditingInstId] = useState(null);
  const [editInstName, setEditInstName] = useState('');
  const [editInstType, setEditInstType] = useState('BANK');

  const [editingTagId, setEditingTagId] = useState(null);
  const [editTagName, setEditTagName] = useState('');
  const [showAddTagForm, setShowAddTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const [isConfiguringPin, setIsConfiguringPin] = useState(false);
  const [isDeactivatingPin, setIsDeactivatingPin] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [currentPinVerify, setCurrentPinVerify] = useState('');
  const [pinError, setPinError] = useState('');

  const [needPct, setNeedPct] = useState(pillarPct.NEED);
  const [wantPct, setWantPct] = useState(pillarPct.WANT);
  const [savePct, setSavePct] = useState(pillarPct.SAVE);
  const [pillarError, setPillarError] = useState('');

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

  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  const putConfig = async (key, value) => db.app_config.put({ key, value });
  const toggleConfig = async (key, val) => db.app_config.put({ key, value: !val });

  const getPillarValues = () => ({
    NEED: clampPct(parseInt(needPct, 10)),
    WANT: clampPct(parseInt(wantPct, 10)),
    SAVE: clampPct(parseInt(savePct, 10))
  });

  const setPillarValues = (values) => {
    setNeedPct(values.NEED);
    setWantPct(values.WANT);
    setSavePct(values.SAVE);
  };

  const handleLinkedPillarChange = (key, rawValue) => {
    const nextValue = clampPct(parseInt(rawValue || '0', 10));
    const values = getPillarValues();
    const delta = nextValue - values[key];
    values[key] = nextValue;

    let remaining = -delta;
    const order = {
      NEED: ['SAVE', 'WANT'],
      WANT: ['SAVE', 'NEED'],
      SAVE: ['WANT', 'NEED']
    }[key];

    for (const otherKey of order) {
      if (remaining === 0) break;
      if (remaining < 0) {
        const reduction = Math.min(values[otherKey], Math.abs(remaining));
        values[otherKey] -= reduction;
        remaining += reduction;
      } else {
        const increase = Math.min(100 - values[otherKey], remaining);
        values[otherKey] += increase;
        remaining -= increase;
      }
    }

    const total = values.NEED + values.WANT + values.SAVE;
    if (total !== 100) values[order[order.length - 1]] += 100 - total;
    setPillarValues(values);
    setPillarError('');
  };

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
    const values = getPillarValues();
    const total = values.NEED + values.WANT + values.SAVE;
    if (total !== 100) {
      setPillarError(`Los porcentajes deben sumar 100%. Ahora suman ${total}%.`);
      return;
    }
    setPillarError('');
    await putConfig('pillarPct', values);
    setMessage('Porcentajes guardados');
    setTimeout(() => setMessage(''), 2000);
  };

  const handleExport = async () => {
    setMessage('');
    setError('');
    setLoading(true);
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
    } catch {
      setError('Error al exportar');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Esta operación reemplazará TODOS los datos actuales. ¿Continuar?')) {
      e.target.value = '';
      return;
    }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        await db.transaction('rw', db.tables, async () => {
          for (const table of db.tables) {
            if (data[table.name]) {
              await table.clear();
              await table.bulkAdd(data[table.name]);
            }
          }
        });
        setMessage('Importado. Recargando...');
        setTimeout(() => window.location.reload(), 1500);
      } catch {
        setError('Archivo inválido');
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleUpdateInst = async (id) => {
    if (!editInstName.trim()) return;
    try {
      await db.institutions.update(id, { name: editInstName.trim(), type: editInstType });
      const relatedAccs = accounts.filter(a => a.institutionId === id);
      for (const acc of relatedAccs) await db.accounts.update(acc.id, { name: editInstName.trim() });
      setEditingInstId(null);
      setMessage('Banco actualizado');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al actualizar el banco');
    }
  };

  const handleDeleteInst = async (id, name) => {
    const count = accounts.filter(a => a.institutionId === id).length;
    if (count > 0) {
      alert(`No puedes eliminar la institución "${name}" porque tiene ${count} cuenta(s) asociada(s).`);
      return;
    }
    if (!confirm(`¿Eliminar la institución "${name}"?`)) return;
    try {
      await db.institutions.delete(id);
      setMessage('Institución eliminada');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al eliminar');
    }
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    try {
      await db.tags.add({ name: newTagName.trim() });
      setNewTagName('');
      setShowAddTagForm(false);
      setMessage('Categoría añadida');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al crear categoría');
    }
  };

  const handleUpdateTag = async (id) => {
    if (!editTagName.trim()) return;
    try {
      await db.tags.update(id, { name: editTagName.trim() });
      setEditingTagId(null);
      setMessage('Categoría actualizada');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al actualizar categoría');
    }
  };

  const handleDeleteTag = async (id, name) => {
    if (!confirm(`¿Eliminar la categoría "${name}"?`)) return;
    try {
      await db.tags.delete(id);
      setMessage('Categoría eliminada');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al eliminar');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('¿Estás COMPLETAMENTE seguro? Esta acción es irreversible.')) return;
    setLoading(true);
    try {
      await db.delete();
      window.location.href = '/';
    } catch {
      setError('Error al eliminar base de datos');
      setLoading(false);
    }
  };

  const activeInstitutions = institutions.length;
  const totalAccounts = accounts.length;

  return (
    <div className="min-h-screen pb-24 pt-16" style={{ background: '#F5F2ED' }}>
      <Header title="Configuración" showBack={true} />

      <main className="mx-auto max-w-md px-6">
        {(message || error) && (
          <div className="py-3 font-mono text-[11px] font-[700] uppercase tracking-[0.1em]">
            {message && <p style={{ color: '#4F8F58' }} id="settings-success-msg">{message}</p>}
            {error && <p style={{ color: '#9F2F2D' }} id="settings-error-msg">{error}</p>}
          </div>
        )}

        <div className="space-y-3">
          <SectionAccordion
            id="portability-section"
            title="Portabilidad"
            open={openSections.portability}
            onToggle={() => toggleSection('portability')}
          >
            <p className="mb-4 text-[13px] leading-relaxed text-noria-muted">
              Mueve tu libro de cuentas libremente. Exporta o restaura un respaldo JSON completo.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <OutlineButton id="export-data-btn" onClick={handleExport} disabled={loading}>
                <Download size={13} strokeWidth={1.7} />
                Exportar
              </OutlineButton>
              <OutlineButton as="label" id="import-data-label">
                <Upload size={13} strokeWidth={1.7} />
                Importar
                <input id="import-file-input" type="file" accept=".json" onChange={handleImport} disabled={loading} className="hidden" />
              </OutlineButton>
            </div>
          </SectionAccordion>

          <SectionAccordion
            id="privacy-section"
            title="Privacidad"
            open={openSections.privacy}
            onToggle={() => toggleSection('privacy')}
          >
            <SettingRow
              label="Ocultar saldos"
              meta="Protege cifras en pantalla"
              right={<NoriaSwitch id="toggle-mask-balances" checked={maskBalances} onChange={() => toggleConfig('maskBalances', maskBalances)} />}
            />
            <SettingRow
              label="PIN de seguridad"
              meta={hasPin ? 'Activo' : 'Inactivo'}
              right={<NoriaSwitch id="toggle-security-pin" checked={hasPin} onChange={handleTogglePin} />}
            />

            {isConfiguringPin && (
              <form onSubmit={handleEnablePin} className="mt-4 space-y-3 border border-[#1A1A1A] p-4" id="enable-pin-form">
                <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Habilitar PIN de seguridad</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="muji-header mb-1 block">Nuevo PIN</label>
                    <input type="password" pattern="[0-9]*" inputMode="numeric" maxLength={6} value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))} placeholder="0000" className="muji-input text-center text-sm" required />
                  </div>
                  <div>
                    <label className="muji-header mb-1 block">Confirmar PIN</label>
                    <input type="password" pattern="[0-9]*" inputMode="numeric" maxLength={6} value={confirmPinInput} onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, ''))} placeholder="0000" className="muji-input text-center text-sm" required />
                  </div>
                </div>
                {pinError && <p className="text-[11px] font-[500]" style={{ color: '#9F2F2D' }}>{pinError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <OutlineButton onClick={() => { setIsConfiguringPin(false); setPinError(''); }}>Cancelar</OutlineButton>
                  <OutlineButton type="submit">Activar</OutlineButton>
                </div>
              </form>
            )}

            {isDeactivatingPin && (
              <form onSubmit={handleDisablePin} className="mt-4 space-y-3 border border-[#1A1A1A] p-4" id="disable-pin-form">
                <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Confirmar desactivación</p>
                <label className="muji-header mb-1 block">PIN actual</label>
                <input type="password" pattern="[0-9]*" inputMode="numeric" maxLength={6} value={currentPinVerify} onChange={e => setCurrentPinVerify(e.target.value.replace(/\D/g, ''))} placeholder="0000" className="muji-input text-center text-sm" required />
                {pinError && <p className="text-[11px] font-[500]" style={{ color: '#9F2F2D' }}>{pinError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <OutlineButton onClick={() => { setIsDeactivatingPin(false); setPinError(''); }}>Cancelar</OutlineButton>
                  <OutlineButton danger type="submit">Desactivar</OutlineButton>
                </div>
              </form>
            )}

            {isChangingPin && (
              <form onSubmit={handleChangePin} className="mt-4 space-y-3 border border-[#1A1A1A] p-4" id="change-pin-form">
                <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Cambiar PIN de seguridad</p>
                <label className="muji-header mb-1 block">PIN actual</label>
                <input type="password" pattern="[0-9]*" inputMode="numeric" maxLength={6} value={currentPinVerify} onChange={e => setCurrentPinVerify(e.target.value.replace(/\D/g, ''))} placeholder="0000" className="muji-input text-center text-sm" required />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="muji-header mb-1 block">Nuevo PIN</label>
                    <input type="password" pattern="[0-9]*" inputMode="numeric" maxLength={6} value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))} placeholder="0000" className="muji-input text-center text-sm" required />
                  </div>
                  <div>
                    <label className="muji-header mb-1 block">Confirmar</label>
                    <input type="password" pattern="[0-9]*" inputMode="numeric" maxLength={6} value={confirmPinInput} onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, ''))} placeholder="0000" className="muji-input text-center text-sm" required />
                  </div>
                </div>
                {pinError && <p className="text-[11px] font-[500]" style={{ color: '#9F2F2D' }}>{pinError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <OutlineButton onClick={() => { setIsChangingPin(false); setPinError(''); }}>Cancelar</OutlineButton>
                  <OutlineButton type="submit">Guardar</OutlineButton>
                </div>
              </form>
            )}

            {hasPin && !isConfiguringPin && !isDeactivatingPin && !isChangingPin && (
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
                className="mt-3 font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-[#647C78] focus:outline-none"
              >
                Cambiar PIN de seguridad
              </button>
            )}
          </SectionAccordion>

          <SectionAccordion
            id="homeostasis-config-section"
            title="Homeostasis"
            open={openSections.homeostasis}
            onToggle={() => toggleSection('homeostasis')}
          >
            <p className="mb-5 text-[13px] leading-relaxed text-noria-muted">
              Ajusta la distribución. Los otros pilares se compensan automáticamente para mantener 100%.
            </p>
            <div className="space-y-5">
              <PillarControl pillar="NEED" value={needPct} onChange={handleLinkedPillarChange} />
              <PillarControl pillar="WANT" value={wantPct} onChange={handleLinkedPillarChange} />
              <PillarControl pillar="SAVE" value={savePct} onChange={handleLinkedPillarChange} />
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-[#1A1A1A] pt-3">
              <span className="label-section">Total bloqueado</span>
              <span className="font-mono text-[14px] font-[700] text-noria-text">
                {getPillarValues().NEED + getPillarValues().WANT + getPillarValues().SAVE}%
              </span>
            </div>
            {pillarError && <p className="mt-3 text-[11px] font-[500]" style={{ color: '#9F2F2D' }}>{pillarError}</p>}
            <OutlineButton id="save-pillar-pct-btn" onClick={savePillarPct} className="mt-4 w-full">
              Guardar porcentajes
            </OutlineButton>
          </SectionAccordion>

          <SectionAccordion
            id="catalogs-section"
            title="Catálogos"
            open={openSections.catalogs}
            onToggle={() => toggleSection('catalogs')}
          >
            <div className="border-y border-[#1A1A1A]">
              <button
                type="button"
                onClick={() => toggleSection('institutions')}
                className="flex w-full items-center justify-between gap-3 border-b border-[#1A1A1A] py-4 text-left focus:outline-none"
              >
                <div>
                  <p className="text-[15px] font-[600] text-noria-text">Instituciones</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-noria-muted">
                    {activeInstitutions} entidades / {totalAccounts} cuentas
                  </p>
                </div>
                <span className="h-10 w-10 border border-[#1A1A1A] flex items-center justify-center">
                  {openSections.institutions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {openSections.institutions && (
                <div className="space-y-3 border-b border-[#1A1A1A] py-4">
                  {institutions.map(inst => {
                    const isEditing = editingInstId === inst.id;
                    const relatedCount = accounts.filter(a => a.institutionId === inst.id).length;

                    return (
                      <div key={inst.id} className="border border-[#1A1A1A]/20 p-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input type="text" value={editInstName} onChange={e => setEditInstName(e.target.value)} className="muji-input text-[12px]" required />
                            <select value={editInstType} onChange={e => setEditInstType(e.target.value)} className="muji-input text-[12px]">
                              <option value="BANK">Banco</option>
                              <option value="NEOBANK">Banco digital</option>
                              <option value="EXCHANGE">Exchange</option>
                              <option value="HOT_WALLET">Hot Wallet</option>
                              <option value="COLD_WALLET">Cold Wallet</option>
                              <option value="CASH">Efectivo</option>
                            </select>
                            <div className="grid grid-cols-2 gap-2">
                              <OutlineButton onClick={() => setEditingInstId(null)}>Cancelar</OutlineButton>
                              <OutlineButton onClick={() => handleUpdateInst(inst.id)}>Guardar</OutlineButton>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[14px] font-[600] text-noria-text">{inst.name}</p>
                              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-noria-muted">
                                {inst.type} / {relatedCount} {relatedCount === 1 ? 'cuenta' : 'cuentas'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => { setEditingInstId(inst.id); setEditInstName(inst.name); setEditInstType(inst.type); }} className="p-1.5 text-noria-muted hover:text-noria-text focus:outline-none" title="Editar banco">
                                <Pencil size={12} strokeWidth={1.5} />
                              </button>
                              <button type="button" onClick={() => handleDeleteInst(inst.id, inst.name)} disabled={relatedCount > 0} className="p-1.5 text-noria-muted hover:text-[#9F2F2D] disabled:opacity-30 focus:outline-none" title={relatedCount > 0 ? 'No se puede eliminar' : 'Eliminar banco'}>
                                <Trash2 size={12} strokeWidth={1.5} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => toggleSection('tags')}
                className="flex w-full items-center justify-between gap-3 py-4 text-left focus:outline-none"
              >
                <div>
                  <p className="text-[15px] font-[600] text-noria-text">Categorías globales</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-noria-muted">
                    {tags.length} categorías
                  </p>
                </div>
                <span className="h-10 w-10 border border-[#1A1A1A] flex items-center justify-center">
                  {openSections.tags ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {openSections.tags && (
                <div className="space-y-3 border-t border-[#1A1A1A] py-4">
                  <button
                    type="button"
                    onClick={() => setShowAddTagForm(!showAddTagForm)}
                    className="flex items-center gap-1 font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-[#647C78] focus:outline-none"
                  >
                    <Plus size={12} />
                    Añadir categoría
                  </button>

                  {showAddTagForm && (
                    <form onSubmit={handleCreateTag} className="space-y-3 border border-[#1A1A1A] p-3">
                      <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Nueva categoría</p>
                      <input type="text" value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Ej. Mascotas" className="muji-input text-[12px]" required />
                      <div className="grid grid-cols-2 gap-2">
                        <OutlineButton onClick={() => setShowAddTagForm(false)}>Cancelar</OutlineButton>
                        <OutlineButton type="submit">Crear</OutlineButton>
                      </div>
                    </form>
                  )}

                  {tags.map(tag => {
                    const isEditing = editingTagId === tag.id;
                    return (
                      <div key={tag.id} className="border-b border-[#1A1A1A]/14 py-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input type="text" value={editTagName} onChange={e => setEditTagName(e.target.value)} className="muji-input text-[12px]" required />
                            <div className="grid grid-cols-2 gap-2">
                              <OutlineButton onClick={() => setEditingTagId(null)}>Cancelar</OutlineButton>
                              <OutlineButton onClick={() => handleUpdateTag(tag.id)}>Guardar</OutlineButton>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-[14px] font-[600] text-noria-text">{tag.name}</span>
                              <CategoryTag name={tag.name} size="xs" />
                            </div>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => { setEditingTagId(tag.id); setEditTagName(tag.name); }} className="p-1.5 text-noria-muted hover:text-noria-text focus:outline-none" title="Editar categoría">
                                <Pencil size={12} strokeWidth={1.5} />
                              </button>
                              <button type="button" onClick={() => handleDeleteTag(tag.id, tag.name)} className="p-1.5 text-noria-muted hover:text-[#9F2F2D] focus:outline-none" title="Eliminar categoría">
                                <Trash2 size={12} strokeWidth={1.5} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SectionAccordion>

          <SectionAccordion
            id="preferences-section"
            title="Preferencias"
            open={openSections.preferences}
            onToggle={() => toggleSection('preferences')}
          >
            <SettingRow
              label="Ingreso mensual base"
              right={<input id="settings-income-input" type="number" value={monthlyIncome} onChange={e => putConfig('monthlyIncome', parseFloat(e.target.value) || 0)} className="w-28 border-0 border-b border-[#1A1A1A]/40 bg-transparent text-right font-mono text-[13px] text-noria-text outline-none focus:border-[#647C78]" />}
            />
            <SettingRow
              label="Moneda base"
              right={
                <select id="settings-currency-select" value={baseCurrency} onChange={e => putConfig('baseCurrency', e.target.value)} className="border-0 border-b border-[#1A1A1A]/40 bg-transparent font-mono text-[13px] text-noria-text outline-none focus:border-[#647C78]">
                  <option value="USD">USD</option>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                </select>
              }
            />
            <SettingRow
              label="Apariencia"
              right={
                <select id="settings-theme-select" value={theme} onChange={e => putConfig('theme', e.target.value)} className="border-0 border-b border-[#1A1A1A]/40 bg-transparent font-mono text-[13px] text-noria-text outline-none focus:border-[#647C78]">
                  <option value="System">Sistema</option>
                  <option value="Light">Claro</option>
                  <option value="Dark">Oscuro</option>
                </select>
              }
            />
          </SectionAccordion>

          <SectionAccordion
            id="danger-zone-section"
            title="Zona crítica"
            open={openSections.danger}
            onToggle={() => toggleSection('danger')}
          >
            <p className="mb-4 text-[13px] leading-relaxed text-noria-muted">
              Esta acción borra la base local completa y no puede deshacerse.
            </p>
            <OutlineButton id="clear-all-data-btn" onClick={handleClearAll} disabled={loading} danger className="w-full">
              <Trash2 size={13} strokeWidth={1.7} />
              Eliminar todos mis datos
            </OutlineButton>
          </SectionAccordion>
        </div>
      </main>
    </div>
  );
}
