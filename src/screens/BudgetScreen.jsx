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

  // Estados para modales componentizados
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAnchor, setEditingAnchor] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Dexie Queries
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const anchors = useLiveQuery(() => db.anchors.toArray()) || [];
  const macetas = useLiveQuery(() => db.macetas.toArray()) || [];

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

  // Filtrar plantillas activas vs pausadas
  const templatesActive = anchors.filter(a => a.isTemplate === true && !a.isArchived);
  const templatesPaused = anchors.filter(a => a.isTemplate === true && a.isArchived);

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
            ${fmt(src.amount)}/mes {src.accountId && `· De: ${getAccountName(src.accountId)}`}
            {src.nextDueDate && ` · Cobro: día ${new Date(src.nextDueDate).getDate()}`}
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

  return (
    <div className="min-h-screen pb-32 pt-16" style={{ background: '#F5F2ED' }}>
      <div className="w-full max-w-md mx-auto px-6">
        <Header title="Presupuesto" />

        {/* Botón Añadir Plantilla */}
        <div className="flex justify-end my-5">
          <button
            onClick={() => {
              setAnchorName(''); setAnchorAmount(''); setAnchorDueDate(''); setAnchorError('');
              if (activeAccounts.length > 0) setAnchorAccountId(activeAccounts[0].id.toString());
              setAnchorPillar('NEED');
              setShowAddModal(true);
            }}
            className="flex items-center space-x-1 focus:outline-none"
            style={{ color: '#5C7A52', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            <Plus size={12} strokeWidth={2} />
            <span>Nuevo Gasto Fijo</span>
          </button>
        </div>

        {/* Listado de Plantillas Activas */}
        {templatesActive.length === 0 ? (
          <div className="flex flex-col items-center py-12 space-y-3" style={{ background: 'rgba(26,26,26,0.01)', border: '1px dashed rgba(26,26,26,0.08)', borderRadius: '8px' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(26,26,26,0.05)' }}>
              <Wallet size={20} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.2)' }} />
            </div>
            <p className="text-[13px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin gastos recurrentes programados</p>
            <button
              onClick={() => {
                setAnchorName(''); setAnchorAmount(''); setAnchorDueDate(''); setAnchorError('');
                if (activeAccounts.length > 0) setAnchorAccountId(activeAccounts[0].id.toString());
                setAnchorPillar('NEED');
                setShowAddModal(true);
              }}
              className="text-[12px] font-[500] uppercase tracking-wider underline underline-offset-2 focus:outline-none"
              style={{ color: '#5C7A52' }}
            >
              Programar el primero
            </button>
          </div>
        ) : (
          <div className="divide-y divide-noria-text/5 bg-transparent rounded-lg">
            {templatesActive.map(renderAnchorRow)}
          </div>
        )}

        {/* Listado de Plantillas Pausadas */}
        {templatesPaused.length > 0 && (
          <div className="pt-6 mt-6 border-t border-[rgba(0,0,0,0.05)]">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="w-full flex justify-between items-center py-2 focus:outline-none text-[11px] font-[500] uppercase tracking-wider text-noria-muted"
            >
              <span>Suscripciones / Gastos Pausados ({templatesPaused.length})</span>
              <span>{showArchived ? 'Ocultar' : 'Ver'}</span>
            </button>
            {showArchived && (
              <div className="divide-y divide-noria-text/5 mt-2 animate-fade-in">
                {templatesPaused.map(renderAnchorRow)}
              </div>
            )}
          </div>
        )}
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
