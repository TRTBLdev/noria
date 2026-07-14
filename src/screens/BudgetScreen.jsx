import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import FAB from '../components/FAB.jsx';
import AnchorFormModal from '../components/AnchorFormModal.jsx';
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Wallet } from 'lucide-react';

export default function BudgetScreen() {
  const [showArchived, setShowArchived] = useState(false);
  const [templatesTab, setTemplatesTab] = useState('GASTOS'); // 'GASTOS' o 'AHORROS'
  const [projectionInterval, setProjectionInterval] = useState('MONTH'); // 'WEEK', 'MONTH', 'NEXT_MONTH', 'ALL'

  // Estados para modales componentizados
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAnchor, setEditingAnchor] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Dexie Queries
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const anchors = useLiveQuery(() => db.anchors.toArray()) || [];
  const macetas = useLiveQuery(() => db.macetas.toArray()) || [];
  const macetaAllocations = useLiveQuery(() => db.maceta_allocations.toArray()) || [];

  // Migración retrospectiva en caliente de anclas heredadas
  React.useEffect(() => {
    if (anchors.length === 0) return;
    const runMigration = async () => {
      const legacy = anchors.filter(a => a.isTemplate === undefined);
      if (legacy.length > 0) {
        for (const a of legacy) {
          await db.anchors.update(a.id, { isTemplate: true, isArchived: false });
        }
      }
    };
    runMigration();
  }, [anchors]);

  const activeAccounts = accounts.filter(a => !a.isArchived);

  // 1. Cálculos de Homeostasis Mensual (Mes Actual)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

  // Instancias de este mes
  const thisMonthInstances = anchors.filter(a => {
    if (a.isTemplate !== false) return false;
    const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate);
    return d >= startOfMonth && d <= endOfMonth;
  });

  const totalAggregatedBalance = activeAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalAllocatedToMacetas = macetaAllocations.reduce((sum, a) => sum + a.amount, 0);

  // Gastos Recurrentes de este mes
  const thisMonthGastos = thisMonthInstances.filter(a => a.pillar === 'NEED' || a.pillar === 'WANT');
  const planifiedGastos = thisMonthGastos.reduce((sum, a) => sum + a.amount, 0);
  const paidGastos = thisMonthGastos.filter(a => a.status === 'PAID').reduce((sum, a) => sum + a.amount, 0);
  const pendingGastos = thisMonthGastos.filter(a => a.status !== 'PAID').reduce((sum, a) => sum + a.amount, 0);

  // Aportes a Metas de este mes
  const thisMonthAhorros = thisMonthInstances.filter(a => a.pillar === 'SAVE');
  const planifiedAhorros = thisMonthAhorros.reduce((sum, a) => sum + a.amount, 0);
  const paidAhorros = thisMonthAhorros.filter(a => a.status === 'PAID').reduce((sum, a) => sum + a.amount, 0);
  const pendingAhorros = thisMonthAhorros.filter(a => a.status !== 'PAID').reduce((sum, a) => sum + a.amount, 0);

  const totalComprometido = planifiedGastos + planifiedAhorros;

  // Disponible Libre Real
  const disponibleLibreReal = Math.max(0, totalAggregatedBalance - totalAllocatedToMacetas - pendingGastos - pendingAhorros);

  // Filtrar plantillas activas vs pausadas
  const templates = anchors.filter(a => a.isTemplate === true);
  const templatesActive = templates.filter(a => !a.isArchived);
  const templatesPaused = templates.filter(a => a.isArchived);

  const fmt = (n) => {
    if (typeof n !== 'number') return '0.00';
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2 });
  };
  
  const getAccountName = (id) => accounts.find(a => a.id === id)?.name || 'Ninguna';

  const handleCreateAnchor = async (data) => {
    try {
      let currency = 'USD';
      if (data.pillar === 'SAVE') {
        const targetMaceta = macetas.find(m => m.id === data.macetaId);
        if (targetMaceta) currency = targetMaceta.currency;
      } else {
        const selectedAcc = accounts.find(a => a.id === data.accountId);
        if (selectedAcc) currency = selectedAcc.currency;
      }

      await db.anchors.add({
        name: data.name,
        type: 'FIXED',
        amount: data.amount,
        currency,
        accountId: data.accountId || null,
        macetaId: data.macetaId || null,
        nextDueDate: data.nextDueDate ? new Date(data.nextDueDate.getTime() + 12*60*60*1000) : new Date(), // Ajustar a mediodía para evitar problemas de zona horaria
        status: 'PENDING',
        pillar: data.pillar,
        isTemplate: true,
        isArchived: false
      });
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
      alert('Error al crear el elemento programado');
    }
  };

  const handleEditClick = (anchor) => {
    setEditingAnchor(anchor);
    setShowEditModal(true);
  };

  const handleUpdateAnchor = async (data) => {
    if (!editingAnchor) return;
    try {
      let currency = 'USD';
      if (data.pillar === 'SAVE') {
        const targetMaceta = macetas.find(m => m.id === data.macetaId);
        if (targetMaceta) currency = targetMaceta.currency;
      } else {
        const selectedAcc = accounts.find(a => a.id === data.accountId);
        if (selectedAcc) currency = selectedAcc.currency;
      }

      // 1. Actualizar plantilla
      await db.anchors.update(editingAnchor.id, {
        name: data.name,
        amount: data.amount,
        currency,
        pillar: data.pillar,
        accountId: data.accountId || null,
        macetaId: data.macetaId || null,
        nextDueDate: data.nextDueDate ? new Date(data.nextDueDate.getTime() + 12*60*60*1000) : null
      });

      // 2. Propagar a instancias activas del mes
      const now = new Date();
      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const activeInstances = anchors.filter(a => 
        a.isTemplate === false && 
        a.parentAnchorId === editingAnchor.id && 
        a.status === 'PENDING'
      );

      for (const inst of activeInstances) {
        const instDate = inst.nextDueDate instanceof Date ? inst.nextDueDate : new Date(inst.nextDueDate);
        if (instDate >= startOfCurrentMonth && instDate <= endOfCurrentMonth) {
          await db.anchors.update(inst.id, {
            name: data.name,
            amount: data.amount,
            currency,
            pillar: data.pillar,
            accountId: data.accountId || null,
            macetaId: data.macetaId || null
          });
        }
      }

      setShowEditModal(false);
      setEditingAnchor(null);
    } catch (err) {
      console.error(err);
      alert('Error al actualizar el elemento programado');
    }
  };

  const handleToggleArchiveAnchor = async (anchor) => {
    try {
      const newArchivedState = !anchor.isArchived;
      await db.anchors.update(anchor.id, { isArchived: newArchivedState });
      
      if (newArchivedState) {
        const now = new Date();
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const pendingInstancesThisMonth = anchors.filter(a => 
          a.isTemplate === false && 
          a.parentAnchorId === anchor.id && 
          a.status === 'PENDING'
        );

        for (const inst of pendingInstancesThisMonth) {
          const instDate = inst.nextDueDate instanceof Date ? inst.nextDueDate : new Date(inst.nextDueDate);
          if (instDate >= startOfCurrentMonth && instDate <= endOfCurrentMonth) {
            await db.anchors.delete(inst.id);
          }
        }
      }
    } catch {
      alert('Error al cambiar el estado del gasto programado');
    }
  };

  const handleDeleteAnchorMaster = async (anchor) => {
    const confirmMsg = anchor.pillar === 'SAVE' 
      ? `¿Eliminar permanentemente la meta y plantilla de ahorro "${anchor.name}"?`
      : `¿Eliminar permanentemente la plantilla de gasto fijo "${anchor.name}"?`;
    if (!confirm(confirmMsg)) return;

    try {
      await db.anchors.delete(anchor.id);
      const pendingInstances = anchors.filter(a => 
        a.isTemplate === false && 
        a.parentAnchorId === anchor.id && 
        a.status === 'PENDING'
      );
      for (const inst of pendingInstances) {
        await db.anchors.delete(inst.id);
      }
    } catch {
      alert('Error al eliminar el gasto programado');
    }
  };

  const getFrequencyLabel = (interval, unit) => {
    const intVal = interval || 1;
    const unitVal = unit || 'MONTHS';
    let unitStr = '';
    if (unitVal === 'DAYS') unitStr = intVal === 1 ? 'día' : 'días';
    else if (unitVal === 'WEEKS') unitStr = intVal === 1 ? 'semana' : 'semanas';
    else if (unitVal === 'MONTHS') unitStr = intVal === 1 ? 'mes' : 'meses';
    else if (unitVal === 'YEARS') unitStr = intVal === 1 ? 'año' : 'años';

    if (intVal === 1) {
      if (unitVal === 'MONTHS') return 'mensual';
      if (unitVal === 'WEEKS') return 'semanal';
      if (unitVal === 'DAYS') return 'diario';
      if (unitVal === 'YEARS') return 'anual';
    }
    return `cada ${intVal} ${unitStr}`;
  };

  const renderAnchorRow = (src) => {
    const pilarColor = src.pillar === 'NEED' ? '#5C7A52' : src.pillar === 'WANT' ? '#4A6475' : '#B8860B';
    const pilarBg = src.pillar === 'NEED' ? 'rgba(92,122,82,0.10)' : src.pillar === 'WANT' ? 'rgba(74,100,117,0.10)' : 'rgba(184,134,11,0.10)';

    return (
      <div key={src.id} className="noria-row py-3.5" id={`anchor-row-${src.id}`} style={{ opacity: src.isArchived ? 0.5 : 1 }}>
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center space-x-2">
            <span className="text-[14px] font-[500] text-noria-text truncate">{src.name}</span>
            <span className="text-[9px] font-[600] px-1.5 py-0.5 rounded uppercase tracking-wider" 
              style={{ background: pilarBg, color: pilarColor }}>
              {src.pillar}
            </span>
          </div>
          <p className="text-[11px] text-noria-muted uppercase tracking-wider mt-0.5 font-mono">
            ${fmt(src.amount)} {getFrequencyLabel(src.frequencyInterval, src.frequencyUnit)} {src.accountId && `· De: ${getAccountName(src.accountId)}`}
            {src.nextDueDate && ` · Inicio/Prox: ${new Date(src.nextDueDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}`}
          </p>
        </div>
        <div className="flex items-center space-x-1">
          <button onClick={() => handleEditClick(src)} className="p-1.5 focus:outline-none hover:bg-noria-text/5 rounded transition-colors" title="Editar">
            <Pencil size={13} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.5)' }} />
          </button>
          <button onClick={() => handleToggleArchiveAnchor(src)} className="p-1.5 focus:outline-none hover:bg-noria-text/5 rounded transition-colors" title={src.isArchived ? "Re-activar" : "Pausar/Archivar"}>
            {src.isArchived ? (
              <ArchiveRestore size={13} strokeWidth={1.5} style={{ color: '#5C7A52' }} />
            ) : (
              <Archive size={13} strokeWidth={1.5} style={{ color: '#B8860B' }} />
            )}
          </button>
          <button onClick={() => handleDeleteAnchorMaster(src)} className="p-1.5 focus:outline-none hover:bg-[#9F2F2D]/10 rounded transition-colors" title="Eliminar definitivamente">
            <Trash2 size={13} strokeWidth={1.5} style={{ color: '#9F2F2D' }} />
          </button>
        </div>
      </div>
    );
  };

  // Lógica de Proyección de cobros por Intervalo
  const getProjectedInstances = () => {
    const today = new Date();
    let start, end;
    if (projectionInterval === 'WEEK') {
      const currentDay = today.getDay();
      const distance = currentDay === 0 ? -6 : 1 - currentDay;
      start = new Date(today); start.setDate(today.getDate() + distance); start.setHours(0,0,0,0);
      end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
    } else if (projectionInterval === 'MONTH') {
      start = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (projectionInterval === 'NEXT_MONTH') {
      start = new Date(today.getFullYear(), today.getMonth() + 1, 1, 0, 0, 0);
      end = new Date(today.getFullYear(), today.getMonth() + 2, 0, 23, 59, 59, 999);
    } else {
      return anchors.filter(a => a.isTemplate === false).sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate));
    }

    return anchors.filter(a => {
      if (a.isTemplate !== false) return false;
      const d = new Date(a.nextDueDate);
      return d >= start && d <= end;
    }).sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate));
  };

  const projectedInstances = getProjectedInstances();

  // Filtrar plantillas según la pestaña activa
  const filteredActive = templatesActive.filter(a => {
    if (templatesTab === 'GASTOS') return a.pillar === 'NEED' || a.pillar === 'WANT';
    return a.pillar === 'SAVE';
  });

  const filteredPaused = templatesPaused.filter(a => {
    if (templatesTab === 'GASTOS') return a.pillar === 'NEED' || a.pillar === 'WANT';
    return a.pillar === 'SAVE';
  });

  return (
    <div className="min-h-screen pb-32 pt-16" style={{ background: '#F5F2ED' }}>
      <div className="w-full max-w-md mx-auto px-6">
        <Header title="Línea de Flotación" />

        {/* ── 1. Resumen de Homeostasis Mensual ── */}
        <section className="py-5 space-y-4" id="homeostasis-summary-section">
          {/* Bento Disponible Libre */}
          <div className="p-4 border border-[rgba(0,0,0,0.06)] rounded-[8px] bg-[rgba(26,26,26,0.015)]">
            <span className="text-[10px] text-noria-muted font-[500] uppercase tracking-wider block mb-1">Disponible Libre Real</span>
            <span className="text-[28px] font-[400] text-noria-text font-mono block" style={{ lineHeight: 1 }}>
              ${fmt(disponibleLibreReal)}
            </span>
            <span className="text-[9px] text-noria-muted tracking-wider block mt-1.5 uppercase">
              Descontando allocations de metas y pagos pendientes del mes
            </span>
          </div>

          {/* Grids de Comprometido y Desglose */}
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div className="p-3 border border-[rgba(0,0,0,0.05)] rounded-[6px] bg-white">
              <span className="text-[9px] text-noria-muted uppercase tracking-wider block mb-0.5">Comprometido Mes</span>
              <span className="font-mono text-noria-text font-[500]">${fmt(totalComprometido)}</span>
            </div>
            <div className="p-3 border border-[rgba(0,0,0,0.05)] rounded-[6px] bg-white">
              <span className="text-[9px] text-noria-muted uppercase tracking-wider block mb-0.5">Realizado / Pagado</span>
              <span className="font-mono text-[#5C7A52] font-[500]">${fmt(paidGastos + paidAhorros)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[11px] opacity-75">
            <div className="px-3 py-1 flex justify-between">
              <span className="text-noria-muted">Gastos:</span>
              <span className="font-mono text-noria-text font-[500]">${fmt(paidGastos)} / ${fmt(planifiedGastos)}</span>
            </div>
            <div className="px-3 py-1 flex justify-between">
              <span className="text-noria-muted">Ahorros:</span>
              <span className="font-mono text-noria-text font-[500]">${fmt(paidAhorros)} / ${fmt(planifiedAhorros)}</span>
            </div>
          </div>
        </section>

        <div className="noria-divider my-2" />

        {/* ── 2. Proyección de Cobros/Ahorros por Intervalo ── */}
        <section className="py-4" id="projections-section">
          <div className="flex justify-between items-baseline mb-3">
            <h4 className="text-[12px] font-[600] uppercase tracking-wider text-noria-text opacity-40">Proyección de Pagos</h4>
            {/* Filtros de Intervalo */}
            <div className="flex space-x-1 bg-[rgba(26,26,26,0.04)] p-0.5 rounded">
              {[
                ['WEEK', 'Semana'],
                ['MONTH', 'Mes'],
                ['NEXT_MONTH', 'Siguiente'],
                ['ALL', 'Todo']
              ].map(([val, label]) => {
                const isSelected = projectionInterval === val;
                return (
                  <button
                    key={val}
                    onClick={() => setProjectionInterval(val)}
                    className="text-[9px] font-[600] px-2 py-0.5 rounded transition-all focus:outline-none uppercase"
                    style={{
                      background: isSelected ? '#1A1A1A' : 'transparent',
                      color: isSelected ? '#F5F2ED' : 'rgba(26,26,26,0.45)'
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {projectedInstances.length === 0 ? (
            <p className="text-[12px] text-noria-muted text-center py-4">No hay pagos proyectados en este periodo.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {projectedInstances.map(inst => {
                const dateObj = inst.nextDueDate instanceof Date ? inst.nextDueDate : new Date(inst.nextDueDate);
                const isPaid = inst.status === 'PAID';
                const isOverdue = !isPaid && dateObj < new Date(new Date().setHours(0,0,0,0));

                let statusColor = 'rgba(26,26,26,0.45)';
                if (isPaid) statusColor = '#5C7A52';
                else if (isOverdue) statusColor = '#9F2F2D';

                return (
                  <div key={inst.id} className="flex justify-between items-center text-[12px] py-1.5 px-2 border border-[rgba(0,0,0,0.03)] rounded bg-white/40">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <span className="text-[9px] font-[500] px-1 rounded uppercase tracking-wider text-noria-muted" style={{ background: 'rgba(0,0,0,0.04)' }}>
                        {dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).toUpperCase()}
                      </span>
                      <span className={`truncate font-[450] text-noria-text ${isPaid ? 'line-through opacity-40' : ''}`}>
                        {inst.name}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 pl-2">
                      <span className="font-mono font-[500] text-noria-text">${fmt(inst.amount)}</span>
                      <span className="text-[9px] font-[600] px-1.5 py-0.5 rounded uppercase tracking-wider" 
                        style={{
                          background: isPaid ? 'rgba(92,122,82,0.1)' : isOverdue ? 'rgba(159,47,45,0.1)' : 'rgba(0,0,0,0.04)',
                          color: statusColor
                        }}>
                        {isPaid ? 'Listo' : isOverdue ? 'Vencido' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="noria-divider my-2" />

        {/* ── 3. Gestión de Plantillas Maestras ── */}
        <section className="py-4" id="templates-section">
          <div className="flex justify-between items-center mb-3">
            {/* Selector de Pestaña */}
            <div className="flex space-x-3">
              {[
                ['GASTOS', 'Gastos Fijos'],
                ['AHORROS', 'Metas Ahorro']
              ].map(([val, label]) => {
                const isSelected = templatesTab === val;
                return (
                  <button
                    key={val}
                    onClick={() => setTemplatesTab(val)}
                    className="text-[12px] font-[600] uppercase tracking-wider focus:outline-none transition-colors border-b-2 pb-0.5"
                    style={{
                      borderColor: isSelected ? '#5C7A52' : 'transparent',
                      color: isSelected ? '#1A1A1A' : 'rgba(26,26,26,0.35)'
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Botón Añadir Plantilla */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-1 focus:outline-none text-[10px] font-[500] uppercase tracking-wider text-[#5C7A52]"
            >
              <Plus size={10} strokeWidth={2} />
              <span>Añadir</span>
            </button>
          </div>

          {/* Listado de Plantillas Activas */}
          {filteredActive.length === 0 ? (
            <div className="flex flex-col items-center py-8 space-y-2 border border-dashed border-[rgba(0,0,0,0.08)] rounded-[6px] bg-[rgba(0,0,0,0.005)]">
              <p className="text-[12px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin plantillas programadas en esta pestaña</p>
            </div>
          ) : (
            <div className="divide-y divide-noria-text/5 bg-transparent rounded-lg">
              {filteredActive.map(renderAnchorRow)}
            </div>
          )}

          {/* Listado de Plantillas Pausadas */}
          {filteredPaused.length > 0 && (
            <div className="pt-4 mt-4 border-t border-[rgba(0,0,0,0.05)]">
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="w-full flex justify-between items-center py-1 focus:outline-none text-[10px] font-[500] uppercase tracking-wider text-noria-muted"
              >
                <span>Pausadas / Suscripciones desactivadas ({filteredPaused.length})</span>
                <span>{showArchived ? 'Ocultar' : 'Ver'}</span>
              </button>
              {showArchived && (
                <div className="divide-y divide-noria-text/5 mt-2 animate-fade-in">
                  {filteredPaused.map(renderAnchorRow)}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Modal para Añadir Plantilla */}
      <AnchorFormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreateAnchor}
        activeAccounts={activeAccounts}
        institutions={institutions}
        macetas={macetas}
      />

      {/* Modal para Editar Plantilla */}
      <AnchorFormModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingAnchor(null); }}
        onSubmit={handleUpdateAnchor}
        anchor={editingAnchor}
        activeAccounts={activeAccounts}
        institutions={institutions}
        macetas={macetas}
      />

      {/* FAB Radial */}
      <FAB />

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
