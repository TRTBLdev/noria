import React from 'react';
import { Target, Trash2, Pencil } from 'lucide-react';

export default function MetasTab({
  macetas,
  accounts,
  macetaAllocations,
  anchors = [],
  onAddMaceta,
  onEditMaceta,
  onDeleteMaceta,
  onDistribute,
  onProgramSavings
}) {

  const fmt = (n, dec = 2) => {
    if (typeof n !== 'number') return '0.00';
    return n.toLocaleString('es-ES', { 
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  };

  const getMonthsRemaining = (targetDateStr) => {
    if (!targetDateStr) return 1;
    const now = new Date();
    const isYearMonthOnly = targetDateStr.includes('-') && targetDateStr.split('-').length === 2;
    const target = new Date(isYearMonthOnly ? targetDateStr + '-15' : targetDateStr);
    const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    return Math.max(1, months);
  };

  if (macetas.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 space-y-3" id="macetas-empty">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(26,26,26,0.05)' }}>
          <Target size={20} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.2)' }} />
        </div>
        <p className="text-[13px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin metas de ahorro activas</p>
        <button onClick={onAddMaceta} className="text-[12px] font-[500] uppercase tracking-wider underline underline-offset-2 focus:outline-none" style={{ color: '#5C7A52' }}>
          Crear primera meta
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {macetas.map(m => {
        const current = m.currentAmount || 0;
        const pct = Math.min(100, m.targetAmount > 0 ? (current / m.targetAmount) * 100 : 0);
        
        // Bloques unicode de progreso
        const filledBlocks = Math.round(pct / 10);
        const emptyBlocks = 10 - filledBlocks;
        const progressStr = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

        // Obtener asignaciones de esta meta
        const allocations = macetaAllocations.filter(a => a.macetaId === m.id);

        // Obtener ahorros recurrentes asociados
        const linkedSavings = anchors.filter(a => a.pillar === 'SAVE' && a.macetaId === m.id && a.isTemplate === true);

        // Calcular aporte mensual sugerido
        const monthsRemaining = getMonthsRemaining(m.targetDate);
        const suggestedAmount = Math.max(0, m.targetAmount - current) / monthsRemaining;

        return (
          <div key={m.id} className="border border-[rgba(0,0,0,0.07)] rounded-[8px] p-5 space-y-4 bg-transparent" id={`maceta-${m.id}`}>
            
            {/* Header: Title and Actions */}
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-2">
                <Target size={14} strokeWidth={1.8} style={{ color: '#5C7A52' }} />
                <p className="text-[15px] font-[500] text-noria-text">{m.name}</p>
              </div>
              <div className="flex items-center space-x-1">
                <button onClick={() => onEditMaceta(m)} className="p-1 focus:outline-none text-noria-muted hover:text-noria-text" title="Editar Meta">
                  <Pencil size={13} strokeWidth={1.5} />
                </button>
                <button onClick={() => onDeleteMaceta(m.id, m.name)} className="p-1 focus:outline-none text-noria-muted hover:text-[#9F2F2D]" title="Eliminar Meta">
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Progreso visual en unicode */}
            <div className="space-y-1">
              <p className="text-[11px] font-[500] text-noria-text/60 uppercase tracking-wider">Progreso</p>
              <div className="font-mono text-[12px] text-noria-text flex items-center space-x-2">
                <span className="text-[#5C7A52] tracking-normal">{progressStr}</span>
                <span className="font-[500]">{pct.toFixed(0)}%</span>
                <span className="text-noria-muted">(${fmt(current, 0)} / ${fmt(m.targetAmount, 0)})</span>
              </div>
            </div>

            {/* Distribución de Cuentas */}
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-[500] text-noria-text/60 uppercase tracking-wider">
                <span>💰 Fondos bloqueados en cuentas:</span>
              </p>
              {allocations.length === 0 ? (
                <p className="text-[11px] text-noria-muted italic pl-3">Sin fondos asignados de ninguna cuenta</p>
              ) : (
                <div className="font-mono text-[12px] text-noria-text pl-2 space-y-0.5">
                  {allocations.map((alloc, idx) => {
                    const acc = accounts.find(a => a.id === alloc.accountId);
                    const prefix = idx === allocations.length - 1 ? '└─ ' : '├─ ';
                    return (
                      <div key={alloc.id} className="flex items-center justify-between">
                        <span>{prefix}{acc ? acc.name : 'Cuenta Desconocida'}</span>
                        <span className="font-[500]">${fmt(alloc.amount, 0)} <span className="text-[#5C7A52]">✓</span></span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Ahorros Recurrentes Vinculados */}
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-[500] text-noria-text/60 uppercase tracking-wider">
                <span>🔄 Aportes mensuales programados:</span>
              </p>
              {linkedSavings.length === 0 ? (
                <p className="text-[11px] text-noria-muted italic pl-3">Sin aportes recurrentes programados</p>
              ) : (
                <div className="font-mono text-[12px] text-noria-text pl-2 space-y-0.5">
                  {linkedSavings.map((save, idx) => {
                    const prefix = idx === linkedSavings.length - 1 ? '└─ ' : '├─ ';
                    return (
                      <div key={save.id} className="flex items-center justify-between">
                        <span>{prefix}{save.name}</span>
                        <span className="font-[500]">${fmt(save.amount, 0)}/mes</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Aporte mensual sugerido y Fecha */}
            <div className="pt-2 border-t border-[rgba(0,0,0,0.05)] flex flex-wrap justify-between items-baseline gap-2">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-[11px] font-[500] text-noria-text/60 uppercase tracking-wider">📊 Aporte sugerido:</span>
                <span className="text-[13px] font-[500] text-[#5C7A52] font-mono">${fmt(suggestedAmount)}/mes</span>
              </div>
              {m.targetDate && (
                <span className="text-[10px] text-noria-muted uppercase tracking-wider font-[500]">
                  Meta: {(() => {
                    const isYearMonthOnly = m.targetDate.includes('-') && m.targetDate.split('-').length === 2;
                    const dateObj = new Date(isYearMonthOnly ? m.targetDate + '-15' : m.targetDate);
                    return dateObj.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }).toUpperCase();
                  })()} ({monthsRemaining} {monthsRemaining === 1 ? 'mes' : 'meses'})
                </span>
              )}
            </div>

            {/* Botones de acción inferior */}
            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => onDistribute(m)}
                className="flex-1 py-2 text-[10px] font-[600] uppercase tracking-wider border border-[rgba(26,26,26,0.15)] rounded hover:bg-noria-text/5 active:scale-[0.98] transition-all focus:outline-none text-noria-text"
              >
                Distribuir Fondos
              </button>
              {suggestedAmount > 0 && (
                <button
                  onClick={() => onProgramSavings(m, suggestedAmount)}
                  className="flex-1 py-2 text-[10px] font-[600] uppercase tracking-wider rounded bg-noria-text text-noria-bg hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none"
                >
                  Programar Ahorro
                </button>
              )}
            </div>

          </div>
        );
      })}
    </div>
  );
}
