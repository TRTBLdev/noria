import React from 'react';
import { Pencil, Trash2, TrendingUp } from 'lucide-react';
import IncomeTypeIcon, { getIncomeType } from './IncomeTypeIcon.jsx';

const INCOME_COLOR = '#4F8F58';

function sourceTypeLabel(type) {
  switch (type) {
    case 'SALARY': return 'Salario / Empleo';
    case 'FREELANCE': return 'Freelance / Servicios';
    case 'INVESTMENT': return 'Inversiones / Dividendos';
    case 'GIFT': return 'Regalos / Bonos';
    case 'BUSINESS': return 'Ventas / Negocio';
    default: return 'Otro';
  }
}

export default function FuentesIngresoSection({
  incomeSources,
  incomeTypes = [],
  onEditSource,
  onDeleteSource
}) {
  return (
    <div className="pb-8">
      {incomeSources.length === 0 ? (
        <div className="flex flex-col items-center py-8 space-y-3 border border-[rgba(26,26,26,0.18)]">
          <div className="w-10 h-10 flex items-center justify-center">
            <TrendingUp size={18} strokeWidth={1.5} style={{ color: 'rgba(26,26,26,0.24)' }} />
          </div>
          <p className="text-[12px]" style={{ color: 'rgba(26,26,26,0.35)' }}>Sin fuentes de ingreso definidas</p>
        </div>
      ) : (
        <div className="divide-y divide-[rgba(26,26,26,0.14)] animate-fade-in">
          {incomeSources.map(src => {
            const incomeType = getIncomeType(incomeTypes, src.incomeTypeId, src.type);
            return (
            <div key={src.id} className="noria-row py-4" id={`source-row-${src.id}`}>
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 flex items-center justify-center shrink-0" style={{ color: 'rgba(26,26,26,0.48)' }}>
                  <IncomeTypeIcon incomeTypes={incomeTypes} incomeTypeId={src.incomeTypeId} legacyType={src.type} size={17} />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-[700] text-noria-text truncate">{src.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-noria-muted uppercase tracking-[0.12em] font-[500]">
                    {incomeType?.name || sourceTypeLabel(src.type)}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-1 shrink-0">
                <span className="hidden min-[380px]:inline font-mono text-[11px] font-[700]" style={{ color: INCOME_COLOR }}>ACTIVA</span>
                <button onClick={() => onEditSource(src)} className="p-2 focus:outline-none hover:bg-noria-text/5 transition-colors text-noria-muted hover:text-noria-text" title="Editar Fuente">
                  <Pencil size={13} strokeWidth={1.5} />
                </button>
                <button onClick={() => onDeleteSource(src.id, src.name)} className="p-2 focus:outline-none hover:bg-noria-text/5 transition-colors text-noria-muted hover:text-[#9F2F2D]" title="Eliminar Fuente">
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}
