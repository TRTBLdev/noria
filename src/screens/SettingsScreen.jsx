import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import FAB from '../components/FAB.jsx';
import NoriaSwitch from '../components/NoriaSwitch.jsx';
import CategoryTag from '../components/CategoryTag.jsx';
import CategoryIcon from '../components/CategoryIcon.jsx';
import IconGridPicker from '../components/IconGridPicker.jsx';
import { sha256 } from '../config/access.private.js';
import { exportDatabase, importDatabase, navigateToAccess } from '../db/backup.js';
import {
  Download,
  Upload,
  Trash2,
  Pencil,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Search,
  X
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
    expenseTags: false,
    incomeTypes: false,
    currencies: false,
    thirdParties: false
  });

  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const lotCurrencyObj = useLiveQuery(() => db.app_config.get('lotCurrency'));
  const monthlyIncomeObj = useLiveQuery(() => db.app_config.get('monthlyIncome'));
  const maskBalancesObj = useLiveQuery(() => db.app_config.get('maskBalances'));
  const themeObj = useLiveQuery(() => db.app_config.get('theme'));
  const pillarPctObj = useLiveQuery(() => db.app_config.get('pillarPct'));
  const hashedPinObj = useLiveQuery(() => db.app_config.get('hashedPin'));

  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.orderBy('name').toArray()) || [];
  const incomeTypes = useLiveQuery(() => db.income_types.orderBy('name').toArray()) || [];
  const incomeSources = useLiveQuery(() => db.income_sources.toArray()) || [];
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const currencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const thirdParties = useLiveQuery(() => db.third_parties.orderBy('name').toArray()) || [];

  const baseCurrency = baseCurrencyObj?.value || '';
  const lotCurrency = lotCurrencyObj?.value || '';
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
  const [editTagIconKey, setEditTagIconKey] = useState('');
  const [editTagParentId, setEditTagParentId] = useState('');
  const [editTagPillar, setEditTagPillar] = useState('NEED');
  const [showAddTagForm, setShowAddTagForm] = useState(false);
  const [newTagKind, setNewTagKind] = useState('EXPENSE');
  const [newTagName, setNewTagName] = useState('');
  const [newTagIconKey, setNewTagIconKey] = useState('');
  const [newTagParentId, setNewTagParentId] = useState('');
  const [newTagPillar, setNewTagPillar] = useState('NEED');
  const [newTagBudget, setNewTagBudget] = useState('');
  const [editTagBudget, setEditTagBudget] = useState('');
  const [editingIncomeTypeId, setEditingIncomeTypeId] = useState(null);
  const [editIncomeTypeName, setEditIncomeTypeName] = useState('');
  const [editIncomeTypeIconKey, setEditIncomeTypeIconKey] = useState('');
  const [showAddIncomeTypeForm, setShowAddIncomeTypeForm] = useState(false);
  const [newIncomeTypeName, setNewIncomeTypeName] = useState('');
  const [newIncomeTypeIconKey, setNewIncomeTypeIconKey] = useState('');

  const [editingThirdPartyId, setEditingThirdPartyId] = useState(null);
  const [editThirdPartyName, setEditThirdPartyName] = useState('');
  const [showAddThirdPartyForm, setShowAddThirdPartyForm] = useState(false);
  const [newThirdPartyName, setNewThirdPartyName] = useState('');
  const [thirdPartySearch, setThirdPartySearch] = useState('');

  const [editingCurrencyId, setEditingCurrencyId] = useState(null);
  const [editCurrencyName, setEditCurrencyName] = useState('');
  const [editCurrencySymbol, setEditCurrencySymbol] = useState('');
  const [editCurrencyIsFiat, setEditCurrencyIsFiat] = useState(true);
  const [editCurrencyIsActive, setEditCurrencyIsActive] = useState(true);
  const [editCurrencyDecimalPlaces, setEditCurrencyDecimalPlaces] = useState(2);
  const [editCurrencySymbolPosition, setEditCurrencySymbolPosition] = useState('before');
  const [editCurrencyBaseRelation, setEditCurrencyBaseRelation] = useState('UNTRACKED');
  const [editCurrencyUnitsPerBase, setEditCurrencyUnitsPerBase] = useState('1');

  const [showAddCurrencyForm, setShowAddCurrencyForm] = useState(false);
  const [newCurrencyCode, setNewCurrencyCode] = useState('');
  const [newCurrencyName, setNewCurrencyName] = useState('');
  const [newCurrencySymbol, setNewCurrencySymbol] = useState('');
  const [newCurrencyIsFiat, setNewCurrencyIsFiat] = useState(true);
  const [newCurrencyIsActive, setNewCurrencyIsActive] = useState(true);
  const [newCurrencyDecimalPlaces, setNewCurrencyDecimalPlaces] = useState(2);
  const [newCurrencySymbolPosition, setNewCurrencySymbolPosition] = useState('before');
  const [newCurrencyBaseRelation, setNewCurrencyBaseRelation] = useState('UNTRACKED');
  const [newCurrencyUnitsPerBase, setNewCurrencyUnitsPerBase] = useState('1');

  const [expandedParentTagIds, setExpandedParentTagIds] = useState({});

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
      const exportData = await exportDatabase(db);
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
    setError('');
    try {
      await importDatabase(db, await file.text());
      setMessage('Respaldo restaurado. Recargando...');
      setTimeout(navigateToAccess, 800);
    } catch (err) {
      console.error('Error importing backup:', err);
      setError(`No se pudo restaurar: ${err.message || 'error desconocido'}`);
      setLoading(false);
      e.target.value = '';
    }
  };



  const handleCreateTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    try {
      const parentIdVal = newTagParentId ? parseInt(newTagParentId) : null;
      let finalPillar = newTagPillar;
      if (parentIdVal) {
        const parent = tags.find(t => t.id === parentIdVal);
        if (parent) finalPillar = parent.pillar || 'NEED';
      }
      const parsedBudget = parseFloat(newTagBudget);
      const monthlyBudget = isNaN(parsedBudget) || parsedBudget <= 0 ? null : parsedBudget;

      await db.tags.add({
        name: newTagName.trim(),
        iconKey: newTagIconKey || null,
        kind: newTagKind,
        pillar: finalPillar,
        parentId: parentIdVal,
        monthlyBudget: newTagKind === 'EXPENSE' ? monthlyBudget : null
      });
      setNewTagName('');
      setNewTagIconKey('');
      setNewTagParentId('');
      setNewTagPillar('NEED');
      setNewTagBudget('');
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
      const parentIdVal = editTagParentId ? parseInt(editTagParentId) : null;
      let finalPillar = editTagPillar;
      if (parentIdVal) {
        const parent = tags.find(t => t.id === parentIdVal);
        if (parent) finalPillar = parent.pillar || 'NEED';
      }
      const currentTag = tags.find(t => t.id === id);
      const parsedBudget = parseFloat(editTagBudget);
      const monthlyBudget = isNaN(parsedBudget) || parsedBudget <= 0 ? null : parsedBudget;

      await db.tags.update(id, {
        name: editTagName.trim(),
        iconKey: editTagIconKey || null,
        pillar: finalPillar,
        parentId: parentIdVal,
        monthlyBudget: (currentTag?.kind || 'EXPENSE') === 'EXPENSE' ? monthlyBudget : null
      });
      
      // If it's a parent tag, update all children to have the same pillar
      if (!parentIdVal) {
        await db.tags.where('parentId').equals(id).modify({ pillar: finalPillar });
      }

      setEditingTagId(null);
      setEditTagBudget('');
      setMessage('Categoría actualizada');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al actualizar categoría');
    }
  };

  const handleDeleteTag = async (id, name) => {
    try {
      const children = await db.tags.where('parentId').equals(id).toArray();
      let confirmMsg = `¿Eliminar la categoría "${name}"?`;
      if (children.length > 0) {
        confirmMsg = `La categoría "${name}" tiene ${children.length} subcategorías. Si la eliminas, también se borrarán todas sus subcategorías. ¿Deseas continuar?`;
      }
      if (!confirm(confirmMsg)) return;

      // Nullify tagId in transactions for this category
      await db.transactions.where('tagId').equals(id).modify({ tagId: null });

      // Handle children
      for (const child of children) {
        await db.transactions.where('tagId').equals(child.id).modify({ tagId: null });
        await db.tags.delete(child.id);
      }

      await db.tags.delete(id);
      setMessage('Categoría eliminada');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al eliminar');
    }
  };

  const handleCreateThirdParty = async (e) => {
    e.preventDefault();
    if (!newThirdPartyName.trim()) return;
    try {
      await db.third_parties.add({ name: newThirdPartyName.trim() });
      setNewThirdPartyName('');
      setShowAddThirdPartyForm(false);
      setMessage('Tercero añadido');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al crear tercero');
    }
  };

  const handleUpdateThirdParty = async (id) => {
    if (!editThirdPartyName.trim()) return;
    try {
      await db.third_parties.update(id, { name: editThirdPartyName.trim() });
      setEditingThirdPartyId(null);
      setMessage('Tercero actualizado');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al actualizar tercero');
    }
  };

  const handleDeleteThirdParty = async (id, name) => {
    try {
      const txCount = await db.transactions.where('thirdPartyId').equals(id).count();
      const debtsCount = await db.debts.where('thirdPartyId').equals(id).count();
      
      const totalAssociations = txCount + debtsCount;
      let confirmMsg = `¿Eliminar al tercero "${name}"?`;
      if (totalAssociations > 0) {
        confirmMsg = `El tercero "${name}" está asociado a ${txCount} transacciones y ${debtsCount} deudas. Si lo eliminas, estas relaciones quedarán sin tercero asociado. ¿Deseas continuar?`;
      }
      
      if (!confirm(confirmMsg)) return;

      if (txCount > 0) {
        await db.transactions.where('thirdPartyId').equals(id).modify({ thirdPartyId: null });
      }
      if (debtsCount > 0) {
        await db.debts.where('thirdPartyId').equals(id).modify({ thirdPartyId: null });
      }

      await db.third_parties.delete(id);
      setMessage('Tercero eliminado');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al eliminar tercero');
    }
  };


  const handleCreateIncomeType = async (e) => {
    e.preventDefault();
    if (!newIncomeTypeName.trim()) return;
    try {
      await db.income_types.add({
        name: newIncomeTypeName.trim(),
        iconKey: newIncomeTypeIconKey || 'money',
        isDefault: false
      });
      setNewIncomeTypeName('');
      setNewIncomeTypeIconKey('');
      setShowAddIncomeTypeForm(false);
      setMessage('Tipo de ingreso añadido');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al crear tipo de ingreso');
    }
  };

  const handleUpdateIncomeType = async (id) => {
    if (!editIncomeTypeName.trim()) return;
    try {
      await db.income_types.update(id, {
        name: editIncomeTypeName.trim(),
        iconKey: editIncomeTypeIconKey || 'money'
      });
      setEditingIncomeTypeId(null);
      setMessage('Tipo de ingreso actualizado');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al actualizar tipo de ingreso');
    }
  };

  const handleDeleteIncomeType = async (id, name) => {
    const relatedCount = incomeSources.filter(source => source.incomeTypeId === id).length;
    if (relatedCount > 0) {
      alert(`No puedes eliminar "${name}" porque tiene ${relatedCount} fuente(s) asociada(s).`);
      return;
    }
    if (!confirm(`¿Eliminar el tipo de ingreso "${name}"?`)) return;
    try {
      await db.income_types.delete(id);
      setMessage('Tipo de ingreso eliminado');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al eliminar tipo de ingreso');
    }
  };

  const handleCreateCurrency = async (e) => {
    e.preventDefault();
    const code = newCurrencyCode.trim().toUpperCase();
    if (!code || !newCurrencyName.trim() || !newCurrencySymbol.trim()) {
      setError('Por favor completa todos los campos');
      return;
    }
    if (!/^[A-Z]{3,4}$/.test(code)) {
      setError('El código debe tener entre 3 y 4 letras');
      return;
    }
    if (newCurrencyBaseRelation === 'PARITY' && (!Number.isFinite(Number(newCurrencyUnitsPerBase)) || Number(newCurrencyUnitsPerBase) <= 0)) {
      setError('La paridad debe ser mayor a cero');
      return;
    }
    try {
      const exists = currencies.some(c => c.code === code);
      if (exists) {
        setError('El código de divisa ya existe');
        return;
      }
      await db.currencies.add({
        code,
        name: newCurrencyName.trim(),
        symbol: newCurrencySymbol.trim(),
        symbolPosition: newCurrencySymbolPosition,
        isFiat: newCurrencyIsFiat,
        isActive: newCurrencyIsActive,
        decimalPlaces: Number.isInteger(parseInt(newCurrencyDecimalPlaces, 10)) ? parseInt(newCurrencyDecimalPlaces, 10) : 2,
        baseRelation: newCurrencyBaseRelation,
        unitsPerBase: newCurrencyBaseRelation === 'PARITY' ? Number(newCurrencyUnitsPerBase) : undefined,
      });
      setNewCurrencyCode('');
      setNewCurrencyName('');
      setNewCurrencySymbol('');
      setNewCurrencyIsFiat(true);
      setNewCurrencyIsActive(true);
      setNewCurrencyDecimalPlaces(2);
      setNewCurrencySymbolPosition('before');
      setNewCurrencyBaseRelation('UNTRACKED');
      setNewCurrencyUnitsPerBase('1');
      setShowAddCurrencyForm(false);
      setMessage('Divisa añadida');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al crear divisa');
    }
  };

  const handleUpdateCurrency = async (currency) => {
    if (!editCurrencyName.trim() || !editCurrencySymbol.trim()) return;
    if (!editCurrencyIsActive && (currency.code === baseCurrency || currency.code === lotCurrency)) {
      setError('La moneda base y la divisa de lotes no pueden desactivarse.');
      return;
    }
    const lockedRelation = currency.code === baseCurrency || currency.code === lotCurrency;
    if (!lockedRelation && editCurrencyBaseRelation === 'PARITY' && (!Number.isFinite(Number(editCurrencyUnitsPerBase)) || Number(editCurrencyUnitsPerBase) <= 0)) {
      setError('La paridad debe ser mayor a cero');
      return;
    }
    try {
      await db.currencies.update(currency.id, {
        name: editCurrencyName.trim(),
        symbol: editCurrencySymbol.trim(),
        symbolPosition: editCurrencySymbolPosition,
        isFiat: editCurrencyIsFiat,
        isActive: editCurrencyIsActive,
        decimalPlaces: Number.isInteger(parseInt(editCurrencyDecimalPlaces, 10)) ? parseInt(editCurrencyDecimalPlaces, 10) : 2,
        baseRelation: lockedRelation ? currency.baseRelation : editCurrencyBaseRelation,
        unitsPerBase: !lockedRelation && editCurrencyBaseRelation === 'PARITY' ? Number(editCurrencyUnitsPerBase) : undefined,
      });
      setEditingCurrencyId(null);
      setMessage('Divisa actualizada');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al actualizar divisa');
    }
  };

  const handleDeleteCurrency = async (id, code) => {
    if (code === baseCurrency || code === lotCurrency) {
      alert(`No puedes eliminar "${code}" porque forma parte de la configuración contable.`);
      return;
    }
    const referenceCounts = await Promise.all([
      db.accounts.where('currency').equals(code).count(),
      db.transactions.filter(item => item.currency === code || item.targetCurrency === code || item.baseCurrency === code).count(),
      db.lots.filter(item => item.currency === code || item.costCurrency === code).count(),
      db.anchors.where('currency').equals(code).count(),
      db.debts.where('currency').equals(code).count(),
      db.macetas.where('currency').equals(code).count(),
      db.maceta_allocations.where('currency').equals(code).count(),
      db.debt_payments.filter(item => item.currency === code || item.paymentCurrency === code).count(),
    ]);
    const count = referenceCounts.reduce((sum, value) => sum + value, 0);
    if (count > 0) {
      alert(`No puedes eliminar "${code}" porque tiene ${count} registro(s) asociado(s).`);
      return;
    }
    if (!confirm(`¿Eliminar la divisa "${code}"?`)) return;
    try {
      await db.currencies.delete(id);
      setMessage('Divisa eliminada');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setError('Error al eliminar divisa');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('¿Estás COMPLETAMENTE seguro? Esta acción es irreversible.')) return;
    setLoading(true);
    try {
      await db.delete();
      navigateToAccess();
    } catch {
      setError('Error al eliminar base de datos');
      setLoading(false);
    }
  };


  const expenseTags = tags.filter(tag => (tag.kind || 'EXPENSE') === 'EXPENSE');

  const toggleParentTag = (id) => {
    setExpandedParentTagIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const renderTagCatalog = (kind, title, catalogTags, addLabel) => {
    const sectionKey = 'expenseTags';
    const isAddingHere = showAddTagForm && newTagKind === kind;

    const parentTags = catalogTags.filter(tag => !tag.parentId);
    const subTags = catalogTags.filter(tag => tag.parentId);

    const renderTagRow = (tag, isSub = false, hasChildren = false, isExpanded = false) => {
      const isEditing = editingTagId === tag.id;

      return (
        <div key={tag.id} className={`border-b border-[#1A1A1A]/10 py-2.5 ${isSub ? 'ml-6 border-l border-[#1A1A1A]/20 pl-4 bg-noria-bg/5' : ''}`}>
          {isEditing ? (
            <div className="space-y-2">
              <input type="text" value={editTagName} onChange={e => setEditTagName(e.target.value)} className="muji-input text-[12px]" required />
              
              {!hasChildren && (
                <div>
                  <label className="block mb-1 text-[11px] text-noria-muted">Categoría Padre</label>
                  <select value={editTagParentId} onChange={e => {
                    setEditTagParentId(e.target.value);
                    if (e.target.value) {
                      const parent = tags.find(p => p.id === parseInt(e.target.value));
                      if (parent) setEditTagPillar(parent.pillar || 'NEED');
                    }
                  }} className="muji-input text-[12px]">
                    <option value="">Ninguna (Categoría Principal)</option>
                    {parentTags.filter(p => p.id !== tag.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              {!editTagParentId && (
                <div>
                  <label className="block mb-1 text-[11px] text-noria-muted">Pilar por defecto</label>
                  <select value={editTagPillar} onChange={e => setEditTagPillar(e.target.value)} className="muji-input text-[12px]">
                    <option value="NEED">Necesidad (Need)</option>
                    <option value="WANT">Deseo (Want)</option>
                    <option value="SAVE">Ahorro (Save)</option>
                  </select>
                </div>
              )}

              {tag.kind === 'EXPENSE' && (
                <div>
                  <label className="block mb-1 text-[11px] text-noria-muted">Presupuesto Mensual Objetivo ({baseCurrency})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ej. 150"
                    value={editTagBudget}
                    onChange={e => setEditTagBudget(e.target.value)}
                    className="muji-input text-[12px]"
                  />
                </div>
              )}

              <IconGridPicker value={editTagIconKey} onChange={setEditTagIconKey} />
              <div className="grid grid-cols-2 gap-2">
                <OutlineButton onClick={() => { setEditingTagId(null); setEditTagBudget(''); }}>Cancelar</OutlineButton>
                <OutlineButton onClick={() => handleUpdateTag(tag.id)}>Guardar</OutlineButton>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1.5">
                {!isSub ? (
                  hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggleParentTag(tag.id)}
                      className="p-1 -ml-1 text-noria-muted hover:text-noria-text focus:outline-none flex-shrink-0"
                      title={isExpanded ? "Colapsar subcategorías" : "Expandir subcategorías"}
                    >
                      {isExpanded ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />}
                    </button>
                  ) : (
                    <div className="w-5 flex-shrink-0" />
                  )
                ) : null}
                <CategoryIcon iconKey={tag.iconKey} size={15} />
                <span 
                  className={`truncate text-[14px] font-[600] text-noria-text ${hasChildren ? 'cursor-pointer select-none hover:opacity-80' : ''}`}
                  onClick={() => hasChildren && toggleParentTag(tag.id)}
                >
                  {tag.name}
                </span>
                {!tag.parentId && <CategoryTag name={tag.pillar} size="xs" />}
                {tag.kind === 'EXPENSE' && tag.monthlyBudget > 0 && (
                  <span className="font-mono text-[10px] text-noria-muted ml-2">
                    (${tag.monthlyBudget.toFixed(2)}/mes)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => { 
                  setEditingTagId(tag.id); 
                  setEditTagName(tag.name); 
                  setEditTagIconKey(tag.iconKey || ''); 
                  setEditTagParentId(tag.parentId ? tag.parentId.toString() : '');
                  setEditTagPillar(tag.pillar || 'NEED');
                  setEditTagBudget(tag.monthlyBudget ? tag.monthlyBudget.toString() : '');
                }} className="p-1.5 text-noria-muted hover:text-noria-text focus:outline-none" title="Editar categoría">
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
    };

    return (
      <>
        <button
          type="button"
          onClick={() => toggleSection(sectionKey)}
          className="flex w-full items-center justify-between gap-3 border-b border-[#1A1A1A]/10 py-3 text-left focus:outline-none"
        >
          <div>
            <p className="text-[14px] font-[600] text-noria-text">{title}</p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-noria-muted font-bold">
              {catalogTags.length} categorías
            </p>
          </div>
          <span className="text-noria-muted p-1 hover:text-noria-text transition-colors">
            {openSections[sectionKey] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {openSections[sectionKey] && (
          <div className="space-y-3 border-b border-[#1A1A1A]/10 py-3.5">
            <button
              type="button"
              onClick={() => {
                setShowAddTagForm(!isAddingHere);
                setNewTagKind(kind);
                setNewTagName('');
                setNewTagIconKey('');
                setNewTagParentId('');
                setNewTagPillar('NEED');
              }}
              className="flex items-center gap-1 font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-[#647C78] focus:outline-none"
            >
              <Plus size={12} />
              {addLabel}
            </button>

            {isAddingHere && (
              <form onSubmit={handleCreateTag} className="space-y-3 border border-[#1A1A1A] p-3 text-[12px]">
                <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Nueva categoría</p>
                <div>
                  <label className="block mb-1 text-[11px] text-noria-muted">Nombre</label>
                  <input type="text" value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Ej. Mascotas" className="muji-input text-[12px]" required />
                </div>
                
                <div>
                  <label className="block mb-1 text-[11px] text-noria-muted">Categoría Padre (Opcional)</label>
                  <select value={newTagParentId} onChange={e => {
                    setNewTagParentId(e.target.value);
                    if (e.target.value) {
                      const parent = tags.find(p => p.id === parseInt(e.target.value));
                      if (parent) setNewTagPillar(parent.pillar || 'NEED');
                    }
                  }} className="muji-input text-[12px]">
                    <option value="">Ninguna (Categoría Principal)</option>
                    {parentTags.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {!newTagParentId && (
                  <div>
                    <label className="block mb-1 text-[11px] text-noria-muted">Pilar por defecto</label>
                    <select value={newTagPillar} onChange={e => setNewTagPillar(e.target.value)} className="muji-input text-[12px]">
                      <option value="NEED">Necesidad (Need)</option>
                      <option value="WANT">Deseo (Want)</option>
                      <option value="SAVE">Ahorro (Save)</option>
                    </select>
                  </div>
                )}
                
                {kind === 'EXPENSE' && (
                  <div>
                    <label className="block mb-1 text-[11px] text-noria-muted">Presupuesto Mensual Objetivo ({baseCurrency})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ej. 150"
                      value={newTagBudget}
                      onChange={e => setNewTagBudget(e.target.value)}
                      className="muji-input text-[12px]"
                    />
                  </div>
                )}
                
                <IconGridPicker value={newTagIconKey} onChange={setNewTagIconKey} />
                
                <div className="grid grid-cols-2 gap-2">
                  <OutlineButton onClick={() => { setShowAddTagForm(false); setNewTagIconKey(''); setNewTagParentId(''); setNewTagBudget(''); }}>Cancelar</OutlineButton>
                  <OutlineButton type="submit">Crear</OutlineButton>
                </div>
              </form>
            )}

            {parentTags.map(parent => {
              const children = subTags.filter(st => st.parentId === parent.id);
              const isExpanded = !!expandedParentTagIds[parent.id];
              return (
                <React.Fragment key={parent.id}>
                  {renderTagRow(parent, false, children.length > 0, isExpanded)}
                  {isExpanded && children.map(child => renderTagRow(child, true))}
                </React.Fragment>
              );
            })}

            {/* Render orphaned subcategories just in case */}
            {subTags.filter(st => !parentTags.some(p => p.id === st.parentId)).map(orphan => renderTagRow(orphan, true))}
          </div>
        )}
      </>
    );
  };


  const renderIncomeTypeCatalog = () => (
    <>
      <button
        type="button"
        onClick={() => toggleSection('incomeTypes')}
        className="flex w-full items-center justify-between gap-3 border-b border-[#1A1A1A]/10 py-3 text-left focus:outline-none"
      >
        <div>
          <p className="text-[14px] font-[600] text-noria-text">Tipos de ingreso</p>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-noria-muted font-bold">
            {incomeTypes.length} tipos
          </p>
        </div>
        <span className="text-noria-muted p-1 hover:text-noria-text transition-colors">
          {openSections.incomeTypes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {openSections.incomeTypes && (
        <div className="space-y-3 border-b border-[#1A1A1A]/10 py-3.5">
          <button
            type="button"
            onClick={() => {
              setShowAddIncomeTypeForm(prev => !prev);
              setNewIncomeTypeName('');
              setNewIncomeTypeIconKey('');
            }}
            className="flex items-center gap-1 font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-[#647C78] focus:outline-none"
          >
            <Plus size={12} />
            Añadir tipo
          </button>

          {showAddIncomeTypeForm && (
            <form onSubmit={handleCreateIncomeType} className="space-y-3 border border-[#1A1A1A] p-3">
              <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Nuevo tipo de ingreso</p>
              <input type="text" value={newIncomeTypeName} onChange={e => setNewIncomeTypeName(e.target.value)} placeholder="Ej. Consultoría" className="muji-input text-[12px]" required />
              <IconGridPicker value={newIncomeTypeIconKey} onChange={setNewIncomeTypeIconKey} />
              <div className="grid grid-cols-2 gap-2">
                <OutlineButton onClick={() => { setShowAddIncomeTypeForm(false); setNewIncomeTypeIconKey(''); }}>Cancelar</OutlineButton>
                <OutlineButton type="submit">Crear</OutlineButton>
              </div>
            </form>
          )}

          {incomeTypes.map(incomeType => {
            const isEditing = editingIncomeTypeId === incomeType.id;
            const relatedCount = incomeSources.filter(source => source.incomeTypeId === incomeType.id).length;
            return (
              <div key={incomeType.id} className="border-b border-[#1A1A1A]/14 py-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <input type="text" value={editIncomeTypeName} onChange={e => setEditIncomeTypeName(e.target.value)} className="muji-input text-[12px]" required />
                    <IconGridPicker value={editIncomeTypeIconKey} onChange={setEditIncomeTypeIconKey} />
                    <div className="grid grid-cols-2 gap-2">
                      <OutlineButton onClick={() => setEditingIncomeTypeId(null)}>Cancelar</OutlineButton>
                      <OutlineButton onClick={() => handleUpdateIncomeType(incomeType.id)}>Guardar</OutlineButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <CategoryIcon iconKey={incomeType.iconKey} size={15} />
                      <div className="min-w-0">
                        <span className="block truncate text-[14px] font-[600] text-noria-text">{incomeType.name}</span>
                        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-noria-muted">{relatedCount} fuentes</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => { setEditingIncomeTypeId(incomeType.id); setEditIncomeTypeName(incomeType.name); setEditIncomeTypeIconKey(incomeType.iconKey || 'money'); }} className="p-1.5 text-noria-muted hover:text-noria-text focus:outline-none" title="Editar tipo">
                        <Pencil size={12} strokeWidth={1.5} />
                      </button>
                      <button type="button" onClick={() => handleDeleteIncomeType(incomeType.id, incomeType.name)} disabled={relatedCount > 0} className="p-1.5 text-noria-muted hover:text-[#9F2F2D] disabled:opacity-30 focus:outline-none" title={relatedCount > 0 ? 'Tipo en uso' : 'Eliminar tipo'}>
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
    </>
  );

  const renderCurrenciesCatalog = () => {
    const isAddingHere = showAddCurrencyForm;

    return (
      <>
        <button
          type="button"
          onClick={() => toggleSection('currencies')}
          className="flex w-full items-center justify-between gap-3 border-b border-[#1A1A1A]/10 py-3 text-left focus:outline-none"
        >
          <div>
            <p className="text-[14px] font-[600] text-noria-text">Divisas</p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-noria-muted font-bold">
              {currencies.length} divisas registradas
            </p>
          </div>
          <span className="text-noria-muted p-1 hover:text-noria-text transition-colors">
            {openSections.currencies ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {openSections.currencies && (
          <div className="space-y-3 border-b border-[#1A1A1A]/10 py-3.5">
            <button
              type="button"
              onClick={() => {
                setShowAddCurrencyForm(!isAddingHere);
                setNewCurrencyCode('');
                setNewCurrencyName('');
                setNewCurrencySymbol('');
                setNewCurrencyIsFiat(true);
                setNewCurrencyIsActive(true);
                setNewCurrencyDecimalPlaces(2);
                setNewCurrencySymbolPosition('before');
                setNewCurrencyBaseRelation('UNTRACKED');
                setNewCurrencyUnitsPerBase('1');
              }}
              className="flex items-center gap-1 font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-[#647C78] focus:outline-none"
            >
              <Plus size={12} />
              Añadir divisa
            </button>

            {isAddingHere && (
              <form onSubmit={handleCreateCurrency} className="space-y-3 border border-[#1A1A1A] p-3">
                <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Nueva divisa</p>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Código (3-4 letras)</label>
                    <input type="text" value={newCurrencyCode} onChange={e => setNewCurrencyCode(e.target.value)} placeholder="Ej. ABC" className="muji-input text-[12px]" required />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Nombre</label>
                    <input type="text" value={newCurrencyName} onChange={e => setNewCurrencyName(e.target.value)} placeholder="Ej. Dólar" className="muji-input text-[12px]" required />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Símbolo</label>
                    <input type="text" value={newCurrencySymbol} onChange={e => setNewCurrencySymbol(e.target.value)} placeholder="Ej. $" className="muji-input text-[12px]" required />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Decimales</label>
                    <input type="number" min="0" max="8" value={newCurrencyDecimalPlaces} onChange={e => setNewCurrencyDecimalPlaces(e.target.value)} className="muji-input text-[12px] font-mono" required />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Tipo</label>
                    <select value={newCurrencyIsFiat ? 'fiat' : 'crypto'} onChange={e => setNewCurrencyIsFiat(e.target.value === 'fiat')} className="muji-input text-[12px]">
                      <option value="fiat">Fiat</option>
                      <option value="crypto">Crypto</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Posición del símbolo</label>
                    <select value={newCurrencySymbolPosition} onChange={e => setNewCurrencySymbolPosition(e.target.value)} className="muji-input text-[12px]">
                      <option value="before">Antes del monto</option>
                      <option value="after">Después del monto</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Estado</label>
                    <select value={newCurrencyIsActive ? 'active' : 'inactive'} onChange={e => setNewCurrencyIsActive(e.target.value === 'active')} className="muji-input text-[12px]">
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Conversión a {baseCurrency}</label>
                    <select value={newCurrencyBaseRelation} onChange={e => setNewCurrencyBaseRelation(e.target.value)} className="muji-input text-[12px]">
                      <option value="UNTRACKED">Sin conversión</option>
                      <option value="PARITY">Paridad fija</option>
                    </select>
                  </div>
                  {newCurrencyBaseRelation === 'PARITY' && (
                    <div>
                      <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Unidades por 1 {baseCurrency}</label>
                      <input type="number" min="0" step="any" value={newCurrencyUnitsPerBase} onChange={e => setNewCurrencyUnitsPerBase(e.target.value)} className="muji-input text-[12px] font-mono" required />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <OutlineButton onClick={() => setShowAddCurrencyForm(false)}>Cancelar</OutlineButton>
                  <OutlineButton type="submit">Crear</OutlineButton>
                </div>
              </form>
            )}

            {currencies.map(currency => {
              const isEditing = editingCurrencyId === currency.id;
              const relatedCount = accounts.filter(a => a.currency === currency.code).length;
              const relationLocked = currency.code === baseCurrency || currency.code === lotCurrency;

              return (
                <div key={currency.id} className="border-b border-[#1A1A1A]/14 py-3">
                  {isEditing ? (
                    <div className="space-y-3 border border-[#1A1A1A] p-3">
                      <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">
                        Editar divisa: {currency.code}
                      </p>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Nombre</label>
                          <input type="text" value={editCurrencyName} onChange={e => setEditCurrencyName(e.target.value)} className="muji-input text-[12px]" required />
                        </div>
                        <div>
                          <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Símbolo</label>
                          <input type="text" value={editCurrencySymbol} onChange={e => setEditCurrencySymbol(e.target.value)} className="muji-input text-[12px]" required />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Decimales</label>
                          <input type="number" min="0" max="8" value={editCurrencyDecimalPlaces} onChange={e => setEditCurrencyDecimalPlaces(e.target.value)} className="muji-input text-[12px] font-mono" required />
                        </div>
                        <div>
                          <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Tipo</label>
                          <select value={editCurrencyIsFiat ? 'fiat' : 'crypto'} onChange={e => setEditCurrencyIsFiat(e.target.value === 'fiat')} className="muji-input text-[12px]">
                            <option value="fiat">Fiat</option>
                            <option value="crypto">Crypto</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Estado</label>
                          <select value={editCurrencyIsActive ? 'active' : 'inactive'} onChange={e => setEditCurrencyIsActive(e.target.value === 'active')} className="muji-input text-[12px]">
                            <option value="active">Activo</option>
                            <option value="inactive">Inactivo</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Posición del símbolo</label>
                        <select value={editCurrencySymbolPosition} onChange={e => setEditCurrencySymbolPosition(e.target.value)} className="muji-input text-[12px]">
                          <option value="before">Antes del monto</option>
                          <option value="after">Después del monto</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Conversión a {baseCurrency}</label>
                          <select value={editCurrencyBaseRelation} onChange={e => setEditCurrencyBaseRelation(e.target.value)} disabled={relationLocked} className="muji-input text-[12px] disabled:opacity-50">
                            {relationLocked && <option value={currency.code === baseCurrency ? 'BASE' : 'LOTS'}>{currency.code === baseCurrency ? 'Moneda base' : 'Lotes FIFO'}</option>}
                            {!relationLocked && <option value="UNTRACKED">Sin conversión</option>}
                            {!relationLocked && <option value="PARITY">Paridad fija</option>}
                          </select>
                        </div>
                        {!relationLocked && editCurrencyBaseRelation === 'PARITY' && (
                          <div>
                            <label className="block text-[9px] font-mono uppercase text-noria-muted mb-1">Unidades por 1 {baseCurrency}</label>
                            <input type="number" min="0" step="any" value={editCurrencyUnitsPerBase} onChange={e => setEditCurrencyUnitsPerBase(e.target.value)} className="muji-input text-[12px] font-mono" />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <OutlineButton onClick={() => setEditingCurrencyId(null)}>Cancelar</OutlineButton>
                        <OutlineButton onClick={() => handleUpdateCurrency(currency)}>Guardar</OutlineButton>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-[14px] font-[700] text-noria-text">{currency.code}</span>
                          <span className="text-[12px] text-noria-muted">({currency.symbol})</span>
                          <span className="truncate text-[13px] text-noria-text">{currency.name}</span>
                        </div>
                        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-noria-muted mt-0.5">
                          {currency.isFiat ? 'Fiat' : 'Crypto'} / {currency.decimalPlaces} decimales / {currency.isActive ? 'Activo' : 'Inactivo'} / {currency.code === baseCurrency ? 'Base' : currency.code === lotCurrency ? 'Lotes FIFO' : currency.baseRelation === 'PARITY' ? `${currency.unitsPerBase} por ${baseCurrency}` : 'Sin conversión'} {relatedCount > 0 ? `· ${relatedCount} cuenta(s)` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCurrencyId(currency.id);
                            setEditCurrencyName(currency.name);
                            setEditCurrencySymbol(currency.symbol);
                            setEditCurrencyIsFiat(currency.isFiat);
                            setEditCurrencyIsActive(currency.isActive);
                            setEditCurrencyDecimalPlaces(currency.decimalPlaces);
                            setEditCurrencySymbolPosition(currency.symbolPosition || 'before');
                            setEditCurrencyBaseRelation(currency.code === baseCurrency ? 'BASE' : currency.code === lotCurrency ? 'LOTS' : currency.baseRelation || 'UNTRACKED');
                            setEditCurrencyUnitsPerBase(String(currency.unitsPerBase || 1));
                          }}
                          className="p-1.5 text-noria-muted hover:text-noria-text focus:outline-none"
                          title="Editar divisa"
                        >
                          <Pencil size={12} strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCurrency(currency.id, currency.code)}
                          disabled={relatedCount > 0}
                          className="p-1.5 text-noria-muted hover:text-[#9F2F2D] disabled:opacity-30 focus:outline-none"
                          title={relatedCount > 0 ? 'No se puede eliminar' : 'Eliminar divisa'}
                        >
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
      </>
    );
  };

  const renderThirdPartyCatalog = () => {
    const isAddingHere = showAddThirdPartyForm;
    const filteredThirdParties = thirdParties.filter(tp =>
      tp.name.toLowerCase().includes(thirdPartySearch.toLowerCase())
    );

    return (
      <>
        <button
          type="button"
          onClick={() => toggleSection('thirdParties')}
          className="flex w-full items-center justify-between gap-3 border-b border-[#1A1A1A]/10 py-3 text-left focus:outline-none"
        >
          <div>
            <p className="text-[14px] font-[600] text-noria-text">Terceros / Comercios</p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-noria-muted font-bold">
              {thirdParties.length} registrados
            </p>
          </div>
          <span className="text-noria-muted p-1 hover:text-noria-text transition-colors">
            {openSections.thirdParties ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {openSections.thirdParties && (
          <div className="space-y-3.5 border-b border-[#1A1A1A]/10 py-3.5 animate-fade-in">
            <div className="flex justify-between items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddThirdPartyForm(!isAddingHere);
                  setNewThirdPartyName('');
                }}
                className="flex items-center gap-1 font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-[#647C78] focus:outline-none shrink-0"
              >
                <Plus size={12} />
                Añadir tercero
              </button>

              {/* Search bar inside catalog */}
              <div className="relative flex-1 max-w-[200px]">
                <input
                  type="text"
                  value={thirdPartySearch}
                  onChange={e => setThirdPartySearch(e.target.value)}
                  placeholder="Buscar tercero..."
                  className="muji-input text-[12px] bg-transparent pl-8 border-b border-[rgba(26,26,26,0.25)] focus:border-[#1A1A1A] w-full"
                />
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-noria-muted" size={12} />
                {thirdPartySearch && (
                  <button
                    type="button"
                    onClick={() => setThirdPartySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-noria-muted hover:text-noria-text focus:outline-none"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            {isAddingHere && (
              <form onSubmit={handleCreateThirdParty} className="space-y-3 border border-[#1A1A1A] p-3 text-[12px]">
                <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Nuevo tercero</p>
                <input type="text" value={newThirdPartyName} onChange={e => setNewThirdPartyName(e.target.value)} placeholder="Ej. Abasto San José" className="muji-input text-[12px]" required />
                <div className="grid grid-cols-2 gap-2">
                  <OutlineButton onClick={() => setShowAddThirdPartyForm(false)}>Cancelar</OutlineButton>
                  <OutlineButton type="submit">Crear</OutlineButton>
                </div>
              </form>
            )}

            {filteredThirdParties.length === 0 ? (
              <p className="text-[11px] text-noria-muted italic text-center py-4">No se encontraron terceros.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto pr-1 bg-transparent p-3 border border-[#1A1A1A] text-[12px] font-mono leading-relaxed space-y-2">
                {filteredThirdParties.map(tp => {
                  const isEditing = editingThirdPartyId === tp.id;
                  return (
                    <div key={tp.id} className="border-b border-[#1A1A1A]/10 pb-2 last:border-b-0 last:pb-0">
                      {isEditing ? (
                        <div className="space-y-2 py-1">
                          <input type="text" value={editThirdPartyName} onChange={e => setEditThirdPartyName(e.target.value)} className="muji-input text-[12px]" required />
                          <div className="grid grid-cols-2 gap-2">
                            <OutlineButton onClick={() => setEditingThirdPartyId(null)}>Cancelar</OutlineButton>
                            <OutlineButton onClick={() => handleUpdateThirdParty(tp.id)}>Guardar</OutlineButton>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3 py-1.5">
                          <span className="truncate text-[13px] font-[600] text-noria-text">{tp.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => { setEditingThirdPartyId(tp.id); setEditThirdPartyName(tp.name); }} className="p-1 text-noria-muted hover:text-noria-text focus:outline-none" title="Editar tercero">
                              <Pencil size={11} strokeWidth={1.5} />
                            </button>
                            <button type="button" onClick={() => handleDeleteThirdParty(tp.id, tp.name)} className="p-1 text-noria-muted hover:text-[#9F2F2D] focus:outline-none" title="Eliminar tercero">
                              <Trash2 size={11} strokeWidth={1.5} />
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
        )}
      </>
    );
  };


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
            <SettingRow
              label="Ingreso mensual promedio"
              meta={`Base de homeostasis · ${baseCurrency}`}
              right={<input id="settings-income-input" type="number" min="0" step="any" value={monthlyIncome} onChange={e => putConfig('monthlyIncome', parseFloat(e.target.value) || 0)} className="w-28 border-0 border-b border-[#1A1A1A]/40 bg-transparent text-right font-mono text-[13px] text-noria-text outline-none focus:border-[#647C78]" />}
            />
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
            <div className="border-y border-[#1A1A1A]/10">
              {renderTagCatalog('EXPENSE', 'Categorías de gasto', expenseTags, 'Añadir categoría')}
              {renderIncomeTypeCatalog()}
              {renderCurrenciesCatalog()}
              {renderThirdPartyCatalog()}

            </div>
          </SectionAccordion>
          <SectionAccordion
            id="preferences-section"
            title="Preferencias"
            open={openSections.preferences}
            onToggle={() => toggleSection('preferences')}
          >
            <SettingRow
              label="Moneda base"
              right={<span id="settings-currency-select" className="font-mono text-[13px] font-bold">{baseCurrency}</span>}
            />
            <SettingRow
              label="Divisa de lotes"
              right={<span className="font-mono text-[13px] font-bold">{lotCurrency || 'No activada'}</span>}
            />
            <p className="-mt-1 pb-2 text-[9px] leading-relaxed text-noria-muted">Estas decisiones contables quedan fijas. Para cambiarlas debes eliminar la base local y completar un onboarding nuevo.</p>
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
      <FAB />
    </div>
  );
}
