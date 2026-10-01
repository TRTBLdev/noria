import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const FULL_MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

const SHORT_MONTH_NAMES = [
  'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
  'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'
];

export function formatMonthYearLabel(yearMonth, { short = false } = {}) {
  if (!yearMonth) return '';
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month)) return yearMonth;
  const names = short ? SHORT_MONTH_NAMES : FULL_MONTH_NAMES;
  const name = names[month - 1];
  return name ? `${name} ${year}` : yearMonth;
}

export function getYearMonthKey(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function MonthFilterBar({
  availableMonths = [],
  selectedMonth = '',
  onSelectMonth,
  showAll = false,
  onToggleShowAll,
  countForMonth,
  totalCount = 0,
  className = '',
}) {
  if (availableMonths.length === 0) return null;

  const currentIndex = availableMonths.indexOf(selectedMonth);
  // availableMonths está ordenado descendente (mes más reciente en índice 0).
  // La flecha izquierda (<) retrocede al mes anterior/más antiguo (índice + 1).
  // La flecha derecha (>) avanza al mes siguiente/más reciente (índice - 1).
  const canGoOlder = !showAll && currentIndex >= 0 && currentIndex < availableMonths.length - 1;
  const canGoNewer = !showAll && currentIndex > 0;

  const handleOlder = (e) => {
    e.stopPropagation();
    if (canGoOlder) onSelectMonth(availableMonths[currentIndex + 1]);
  };

  const handleNewer = (e) => {
    e.stopPropagation();
    if (canGoNewer) onSelectMonth(availableMonths[currentIndex - 1]);
  };

  const currentCount = showAll
    ? totalCount
    : (countForMonth ? countForMonth(selectedMonth) : null);

  return (
    <div
      className={`inline-flex items-center gap-1 font-mono text-[10px] select-none shrink-0 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Flecha mes anterior (más antiguo) */}
      <button
        type="button"
        onClick={handleOlder}
        disabled={!canGoOlder}
        className="w-5 h-5 flex items-center justify-center text-noria-text hover:text-black disabled:opacity-20 disabled:cursor-not-allowed focus:outline-none transition-opacity"
        title="Mes anterior con registros"
        aria-label="Mes anterior con registros"
      >
        <ChevronLeft size={13} strokeWidth={2.5} />
      </button>

      {/* Mes actual o TODOS */}
      <span className="font-[700] uppercase tracking-[0.06em] text-noria-text whitespace-nowrap">
        {showAll ? (
          `TODOS (${totalCount})`
        ) : (
          <>
            {formatMonthYearLabel(selectedMonth, { short: true })}
            {currentCount != null && (
              <span className="text-noria-muted font-normal ml-0.5">({currentCount})</span>
            )}
          </>
        )}
      </span>

      {/* Flecha mes siguiente (más reciente) */}
      <button
        type="button"
        onClick={handleNewer}
        disabled={!canGoNewer}
        className="w-5 h-5 flex items-center justify-center text-noria-text hover:text-black disabled:opacity-20 disabled:cursor-not-allowed focus:outline-none transition-opacity"
        title="Mes siguiente con registros"
        aria-label="Mes siguiente con registros"
      >
        <ChevronRight size={13} strokeWidth={2.5} />
      </button>

      {/* Botón discreto estilo brutalista [TODO] / [MES] */}
      {onToggleShowAll && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleShowAll();
          }}
          className="font-mono text-[9px] font-[700] tracking-[0.08em] text-noria-muted hover:text-noria-text focus:outline-none ml-1 transition-colors"
          title={showAll ? 'Filtrar por mes' : 'Ver todos los registros'}
        >
          {showAll ? '[MES]' : '[TODO]'}
        </button>
      )}
    </div>
  );
}
