import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import FAB from '../components/FAB.jsx';
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Wallet } from 'lucide-react';

export default function BudgetScreen() {
  const [showArchived, setShowArchived] = useState(false);

  // Estados para creación
  const [showAddModal, setShowAddModal] = useState(false);
  const [anchorName, setAnchorName] = useState('');
  const [anchorAmount, setAnchorAmount] = useState('');
  const [anchorPillar, setAnchorPillar] = useState('NEED');
  const [anchorAccountId, setAnchorAccountId] = useState('');
  const [anchorDueDate, setAnchorDueDate] = useState('');
  const [anchorError, setAnchorError] = useState('');

  // Estados para edición
  const [editingAnchor, setEditingAnchor] = useState(null);
  const [editAnchorName, setEditAnchorName] = useState('');
  const [editAnchorAmount, setEditAnchorAmount] = useState('');
  const [editAnchorPillar, setEditAnchorPillar] = useState('NEED');
  const [editAnchorDueDate, setEditAnchorDueDate] = useState('');
  const [editAnchorAccountId, setEditAnchorAccountId] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  // Dexie Queries
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const anchors = useLiveQuery(() => db.anchors.toArray()) || [];
  
  const activeAccounts = accounts.filter(a => !a.isArchived);

  // Filtrar plantillas activas vs pausadas
  const templatesActive = anchors.filter(a => a.isTemplate === true && !a.isArchived);
  const templatesPaused = anchors.filter(a => a.isTemplate === true && a.isArchived);

  const fmt = (n) => {
    if (typeof n !== 'number') return '0.00';
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2 });
  };
  
  const getAccountName = (id) => accounts.find(a => a.id === id)?.name || 'Ninguna';

  const handleCreateAnchorMaster = async (e) => {
    e.preventDefault();
    setAnchorError('');
    const amt = parseFloat(anchorAmount);
    if (isNaN(amt) || amt <= 0) { setAnchorError('Monto inválido'); return; }
    if (!anchorAccountId) { setAnchorError('Selecciona una cuenta'); return; }
    
    const selectedAcc = accounts.find(a => a.id.toString() === anchorAccountId);
    if (!selectedAcc) { setAnchorError('Cuenta no encontrada'); return; }

    try {
      await db.anchors.add({
        name: anchorName.trim(),
        type: 'FIXED',
        amount: amt,
        currency: selectedAcc.currency,
        accountId: parseInt(anchorAccountId),
        nextDueDate: anchorDueDate ? new Date(anchorDueDate + 'T12:00:00') : new Date(),
        status: 'PENDING',
        pillar: anchorPillar,
        isTemplate: true,
        isArchived: false
      });
      setShowAddModal(false);
      setAnchorName(''); setAnchorAmount(''); setAnchorDueDate(''); setAnchorAccountId('');
    } catch {
      setAnchorError('Error al crear plantilla de gasto fijo');
    }
  };

  const handleEditClick = (anchor) => {
    setEditingAnchor(anchor);
    setEditAnchorName(anchor.name);
    setEditAnchorAmount(anchor.amount.toString());
    setEditAnchorPillar(anchor.pillar);
    
    let formattedDate = '';
    if (anchor.nextDueDate) {
      const d = anchor.nextDueDate instanceof Date ? anchor.nextDueDate : new Date(anchor.nextDueDate);
      formattedDate = d.toISOString().slice(0, 10);
    }
    setEditAnchorDueDate(formattedDate);
    setEditAnchorAccountId(anchor.accountId ? anchor.accountId.toString() : '');
    setShowEditModal(true);
  };

  const handleUpdateAnchor = async (e) => {
    e.preventDefault();
    if (!editingAnchor) return;
    const amt = parseFloat(editAnchorAmount);
    if (isNaN(amt) || amt <= 0) { alert('Monto inválido'); return; }

    try {
      const parsedAccountId = editAnchorAccountId ? parseInt(editAnchorAccountId) : null;
      const parsedDueDate = editAnchorDueDate ? new Date(editAnchorDueDate + 'T12:00:00') : null;

      // 1. Actualizar plantilla
      await db.anchors.update(editingAnchor.id, {
        name: editAnchorName.trim(),
        amount: amt,
        pillar: editAnchorPillar,
        accountId: parsedAccountId,
        nextDueDate: parsedDueDate
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
            name: editAnchorName.trim(),
            amount: amt,
            pillar: editAnchorPillar,
            accountId: parsedAccountId
          });
        }
      }

      setShowEditModal(false);
      setEditingAnchor(null);
    } catch {
      alert('Error al actualizar el gasto programado');
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

      {/* ── MODAL AÑADIR GASTO FIJO RECURRENTE ── */}
      {showAddModal && (
        <>
          <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40" onClick={() => setShowAddModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up"
            style={{ background: '#F5F2ED', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)' }}>
            <form onSubmit={handleCreateAnchorMaster} className="px-6 pt-4 pb-10 space-y-4" id="add-anchor-form">
              <div className="flex justify-center mb-2">
                <div className="w-8 h-[3px] rounded-full" style={{ background: 'rgba(26,26,26,0.12)' }} />
              </div>

              <div className="flex justify-between items-center">
                <h4 className="text-[16px] font-[400] text-noria-text">Nuevo Gasto Fijo Recurrente</h4>
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="focus:outline-none p-1" style={{ color: 'rgba(26,26,26,0.4)' }}>✕</button>
              </div>

              <div>
                <label className="muji-header block mb-1">Nombre</label>
                <input type="text" value={anchorName} onChange={e => setAnchorName(e.target.value)}
                  placeholder="Ej. Alquiler, Condominio, Netflix" className="muji-input" required autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="muji-header block mb-1">Monto (USD)</label>
                  <input type="number" step="0.01" inputMode="decimal"
                    value={anchorAmount} onChange={e => setAnchorAmount(e.target.value)}
                    placeholder="0.00" className="muji-input" required />
                </div>
                <div>
                  <label className="muji-header block mb-1">Primer Vencimiento</label>
                  <input type="date" value={anchorDueDate}
                    onChange={e => setAnchorDueDate(e.target.value)} className="muji-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="muji-header block mb-1">Cuenta Asociada (Débito)</label>
                  <select value={anchorAccountId} onChange={e => setAnchorAccountId(e.target.value)}
                    className="muji-input" required>
                    <option value="" disabled>Selecciona...</option>
                    {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="muji-header block mb-2">Pilar</label>
                  <div className="flex space-x-1">
                    {[['NEED','N','#5C7A52'],['WANT','W','#4A6475'],['SAVE','S','#B8860B']].map(([val, short, col]) => (
                      <button key={val} type="button" onClick={() => setAnchorPillar(val)}
                        className="flex-1 py-1 text-[10px] font-[500] uppercase rounded border transition-all"
                        style={{
                          borderColor: anchorPillar === val ? col : 'rgba(26,26,26,0.10)',
                          color: anchorPillar === val ? col : 'rgba(26,26,26,0.35)',
                        }}>
                        {short}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {anchorError && <p className="text-[12px] font-[500]" style={{ color: '#B8860B' }}>{anchorError}</p>}

              <button type="submit"
                className="w-full py-3.5 text-[13px] font-[500] uppercase tracking-wider transition-all active:scale-[0.98] rounded-[6px] mt-2"
                style={{ background: '#1A1A1A', color: '#F5F2ED' }}>
                Programar Gasto Fijo
              </button>
            </form>
          </div>
        </>
      )}

      {/* ── MODAL EDITAR GASTO FIJO RECURRENTE ── */}
      {showEditModal && editingAnchor && (
        <>
          <div className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40" onClick={() => setShowEditModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-slide-up"
            style={{ background: '#F5F2ED', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.08)' }}>
            <form onSubmit={handleUpdateAnchor} className="px-6 pt-4 pb-10 space-y-4" id="edit-anchor-form">
              <div className="flex justify-center mb-2">
                <div className="w-8 h-[3px] rounded-full" style={{ background: 'rgba(26,26,26,0.12)' }} />
              </div>

              <div className="flex justify-between items-center">
                <h4 className="text-[16px] font-[400] text-noria-text">Editar Gasto Programado</h4>
                <button type="button" onClick={() => setShowEditModal(false)}
                  className="focus:outline-none p-1" style={{ color: 'rgba(26,26,26,0.4)' }}>✕</button>
              </div>

              <div>
                <label className="muji-header block mb-1">Nombre</label>
                <input type="text" value={editAnchorName} onChange={e => setEditAnchorName(e.target.value)}
                  className="muji-input" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="muji-header block mb-1">Monto Mensual (USD)</label>
                  <input type="number" step="0.01" inputMode="decimal"
                    value={editAnchorAmount} onChange={e => setEditAnchorAmount(e.target.value)}
                    className="muji-input" required />
                </div>
                <div>
                  <label className="muji-header block mb-1">Fecha de cobro estimada</label>
                  <input type="date" value={editAnchorDueDate}
                    onChange={e => setEditAnchorDueDate(e.target.value)} className="muji-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="muji-header block mb-1">Cuenta Asociada (Débito)</label>
                  <select value={editAnchorAccountId} onChange={e => setEditAnchorAccountId(e.target.value)}
                    className="muji-input" required={editingAnchor.pillar !== 'SAVE'}>
                    <option value="">Ninguna...</option>
                    {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="muji-header block mb-2">Pilar</label>
                  <div className="flex space-x-1">
                    {[['NEED','N','#5C7A52'],['WANT','W','#4A6475'],['SAVE','S','#B8860B']].map(([val, short, col]) => (
                      <button key={val} type="button" onClick={() => setEditAnchorPillar(val)}
                        disabled={editingAnchor.pillar === 'SAVE'}
                        className="flex-1 py-1 text-[10px] font-[500] uppercase rounded border transition-all disabled:opacity-50"
                        style={{
                          borderColor: editAnchorPillar === val ? col : 'rgba(26,26,26,0.10)',
                          color: editAnchorPillar === val ? col : 'rgba(26,26,26,0.35)',
                        }}>
                        {short}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button type="submit"
                className="w-full py-3.5 text-[13px] font-[500] uppercase tracking-wider transition-all active:scale-[0.98] rounded-[6px] mt-2"
                style={{ background: '#1A1A1A', color: '#F5F2ED' }}>
                Guardar Cambios
              </button>
            </form>
          </div>
        </>
      )}

      {/* FAB Radial */}
      <FAB />

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
