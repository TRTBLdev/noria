import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import FAB from '../components/FAB';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search, TrendingUp, TrendingDown, Layers, Grid, Pencil } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { convertAmountToBase } from '../utils/currency.js';
import { isPersonalExpenseTransaction } from '../db/transactionApplications.js';

const MONTH_NAMES_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MONTH_NAMES_FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Componente Sparkline SVG de alta precisión:
 * - Curva suave Bézier cúbica (monotone spline) sin picos artificiales
 * - Área sombreada con gradiente vertical translúcido
 * - Retícula técnica con línea de presupuesto punteada
 * - Telemetría interactiva al contacto/cursor con hairline vertical y badge flotante
 */
function Sparkline({ id, values, budget = null, color = '#1A1A1A', fmt, height = 50, width = 300 }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!values || values.length === 0) return null;

  const pad = 6;
  const maxVal = Math.max(...values, budget || 0, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;
  const n = values.length;

  const points = values.map((val, idx) => {
    const x = pad + (idx / (n - 1)) * (width - 2 * pad);
    const y = height - pad - ((val - minVal) / range) * (height - 2 * pad);
    return { x, y, val, month: MONTH_NAMES_SHORT[idx] };
  });

  // Cálculo de spline cúbico suave (Bézier)
  let pathD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const pPrev = points[Math.max(0, i - 1)];
    const pCur = points[i];
    const pNext = points[i + 1];
    const pAfter = points[Math.min(n - 1, i + 2)];

    let cp1x = pCur.x + (pNext.x - pPrev.x) / 6;
    let cp1y = pCur.y + (pNext.y - pPrev.y) / 6;
    let cp2x = pNext.x - (pAfter.x - pCur.x) / 6;
    let cp2y = pNext.y - (pAfter.y - pCur.y) / 6;

    // Aplanamiento en extremos locales para evitar sobretiros
    if ((pCur.y - pPrev.y) * (pNext.y - pCur.y) <= 0) cp1y = pCur.y;
    if ((pNext.y - pCur.y) * (pAfter.y - pNext.y) <= 0) cp2y = pNext.y;

    cp1y = Math.max(pad, Math.min(height - pad, cp1y));
    cp2y = Math.max(pad, Math.min(height - pad, cp2y));

    pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${pNext.x.toFixed(1)} ${pNext.y.toFixed(1)}`;
  }

  const areaD = `${pathD} L ${points[n - 1].x.toFixed(1)} ${height - pad} L ${points[0].x.toFixed(1)} ${height - pad} Z`;

  const budgetY = budget && budget > 0
    ? height - pad - ((budget - minVal) / range) * (height - 2 * pad)
    : null;

  // Punto pico anual
  const peakIndex = points.reduce((maxIdx, p, idx) => p.val > points[maxIdx].val ? idx : maxIdx, 0);
  const peakPoint = points[peakIndex];
  const activeIdx = hoverIndex !== null ? hoverIndex : null;
  const activePoint = activeIdx !== null ? points[activeIdx] : null;

  const gradId = `spark-grad-${id || color.replace('#', '')}`;

  const handlePointer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const idx = Math.round(ratio * (n - 1));
    setHoverIndex(idx);
  };

  return (
    <div className="w-full space-y-1 select-none">
      {/* Telemetría contextual superior del sparkline */}
      <div className="flex justify-between items-center text-[8px] font-mono h-4">
        {activePoint ? (
          <div className="flex items-center space-x-1.5 text-noria-text font-bold">
            <span className="bg-[#1A1A1A] text-[#F5F2ED] px-1 py-0.2">
              {MONTH_NAMES_FULL[activeIdx].toUpperCase()}
            </span>
            <span>{fmt(activePoint.val)}</span>
            {budget && budget > 0 && activePoint.val > budget && (
              <span className="text-[#9F2F2D]">(+{fmt(activePoint.val - budget)})</span>
            )}
          </div>
        ) : (
          <div className="flex justify-between w-full text-noria-muted">
            <span>ENE: {fmt(points[0].val)}</span>
            <span>PICO: {fmt(peakPoint.val)} ({MONTH_NAMES_SHORT[peakIndex]})</span>
            <span>DIC: {fmt(points[11].val)}</span>
          </div>
        )}
      </div>

      {/* SVG Canvas interactivo */}
      <div
        className="w-full relative cursor-crosshair touch-none"
        onPointerMove={handlePointer}
        onPointerLeave={() => setHoverIndex(null)}
        onTouchMove={handlePointer}
        onTouchEnd={() => setHoverIndex(null)}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-12 overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Línea base inferior */}
          <line
            x1={pad}
            y1={height - pad}
            x2={width - pad}
            y2={height - pad}
            stroke="#1A1A1A"
            strokeWidth="0.5"
            opacity="0.15"
          />

          {/* Línea de presupuesto de referencia si existe */}
          {budgetY !== null && budgetY >= pad && budgetY <= height - pad && (
            <line
              x1={pad}
              y1={budgetY.toFixed(1)}
              x2={width - pad}
              y2={budgetY.toFixed(1)}
              stroke="#647C78"
              strokeWidth="1"
              strokeDasharray="3 2"
              opacity="0.6"
            />
          )}

          {/* Área sombreada bajo la curva */}
          <path d={areaD} fill={`url(#${gradId})`} />

          {/* Curva Bézier continua */}
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Punto pico destacado si no hay hover */}
          {activeIdx === null && peakPoint.val > 0 && (
            <g>
              <circle cx={peakPoint.x.toFixed(1)} cy={peakPoint.y.toFixed(1)} r="3" fill="#9F2F2D" />
              <circle cx={peakPoint.x.toFixed(1)} cy={peakPoint.y.toFixed(1)} r="5" fill="none" stroke="#9F2F2D" strokeWidth="0.8" opacity="0.5" />
            </g>
          )}

          {/* Hairline y punto activo al interactuar */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x.toFixed(1)}
                y1={pad}
                x2={activePoint.x.toFixed(1)}
                y2={height - pad}
                stroke="#1A1A1A"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.45"
              />
              <circle
                cx={activePoint.x.toFixed(1)}
                cy={activePoint.y.toFixed(1)}
                r="3.5"
                fill={color}
                stroke="#F5F2ED"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

export default function BudgetFull() {
  const navigate = useNavigate();

  // 1. Consultas reactivas Dexie
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const dbCurrencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const lots = useLiveQuery(() => db.lots.toArray()) || [];
  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const baseCurrency = baseCurrencyObj?.value || '';

  // 2. Estados locales de navegación y filtros
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [activeTab, setActiveTab] = useState('CASHFLOW'); // 'CASHFLOW' | 'TRENDS' | 'HEATMAP'
  const [pillarFilter, setPillarFilter] = useState('ALL'); // 'ALL' | 'NEED' | 'WANT'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHeatCell, setSelectedHeatCell] = useState(null);
  const [editingBudgetId, setEditingBudgetId] = useState(null);
  const [expandedSubcatParentIds, setExpandedSubcatParentIds] = useState(new Set());

  const toggleSubcats = (parentId) => {
    setExpandedSubcatParentIds(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const handleUpdateBudget = async (tagId, value) => {
    const parsed = parseFloat(value);
    const budget = isNaN(parsed) || parsed <= 0 ? null : parsed;
    await db.tags.update(tagId, { monthlyBudget: budget });
    setEditingBudgetId(null);
  };

  // 3. Conversión de montos a moneda base
  const fmt = (n) => formatCurrency(n, baseCurrency, dbCurrencies);

  const transactionAmountInBase = (t) => {
    if (t.baseCurrency === baseCurrency && Number.isFinite(t.baseAmount)) return t.baseAmount;
    return convertAmountToBase(t.amount, t.currency, baseCurrency, lots, dbCurrencies) ?? 0;
  };

  // 4. Años disponibles basados en transacciones
  const availableYears = useMemo(() => {
    const yearsSet = new Set([new Date().getFullYear()]);
    transactions.forEach(t => {
      if (t.date) {
        const y = new Date(t.date).getFullYear();
        if (y >= 2000 && y <= 2100) yearsSet.add(y);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [transactions]);

  // 5. Cálculos de Flujo de Caja Mensual y Anual (12 Meses)
  const annualCashflow = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, m) => {
      const start = new Date(selectedYear, m, 1, 0, 0, 0);
      const end = new Date(selectedYear, m + 1, 0, 23, 59, 59, 999);

      const mIncomes = transactions.filter(t => {
        const d = new Date(t.date);
        return d >= start && d <= end && t.type === 'IN' && t.cashflowKind !== 'LOAN_PROCEEDS';
      });
      const mExpenses = transactions.filter(t => {
        const d = new Date(t.date);
        return d >= start && d <= end && t.type === 'OUT' && isPersonalExpenseTransaction(t);
      });

      const income = mIncomes.reduce((sum, t) => sum + transactionAmountInBase(t), 0);
      const expense = mExpenses.reduce((sum, t) => sum + transactionAmountInBase(t), 0);
      const net = income - expense;
      const savingsRate = income > 0 ? (net / income) * 100 : (expense > 0 ? -100 : 0);

      return {
        monthIndex: m,
        shortName: MONTH_NAMES_SHORT[m],
        fullName: MONTH_NAMES_FULL[m],
        income,
        expense,
        net,
        savingsRate,
      };
    });

    const totalIncome = months.reduce((sum, m) => sum + m.income, 0);
    const totalExpense = months.reduce((sum, m) => sum + m.expense, 0);
    const totalNet = totalIncome - totalExpense;
    const overallSavingsRate = totalIncome > 0 ? (totalNet / totalIncome) * 100 : 0;
    const avgMonthlyIncome = totalIncome / 12;
    const avgMonthlyExpense = totalExpense / 12;

    const maxMonthlyVolume = Math.max(...months.map(m => Math.max(m.income, m.expense)), 1);

    return {
      months,
      totalIncome,
      totalExpense,
      totalNet,
      overallSavingsRate,
      avgMonthlyIncome,
      avgMonthlyExpense,
      maxMonthlyVolume,
    };
  }, [transactions, selectedYear, baseCurrency, lots, dbCurrencies]);

  // 6. Cálculos y desarrollo de Categorías a lo largo del año
  const categoryAnalytics = useMemo(() => {
    const expenseTags = tags.filter(t => t.kind === 'EXPENSE');

    const categories = expenseTags.map(tag => {
      // Identificar si es categoría padre con subcategorías
      const childTags = expenseTags.filter(c => c.parentId === tag.id);
      const isParentWithChildren = childTags.length > 0;
      // Para categorías padre, consolidar transacciones directas + las de todas sus subcategorías
      const targetTagIds = isParentWithChildren ? [tag.id, ...childTags.map(c => c.id)] : [tag.id];

      const monthlySpent = Array.from({ length: 12 }, (_, m) => {
        const start = new Date(selectedYear, m, 1, 0, 0, 0);
        const end = new Date(selectedYear, m + 1, 0, 23, 59, 59, 999);

        const mTx = transactions.filter(t => {
          const d = new Date(t.date);
          return d >= start && d <= end && targetTagIds.includes(t.tagId) && t.type === 'OUT' && isPersonalExpenseTransaction(t);
        });

        return mTx.reduce((sum, t) => sum + transactionAmountInBase(t), 0);
      });

      const totalAnnual = monthlySpent.reduce((sum, v) => sum + v, 0);
      const avgMonthly = totalAnnual / 12;
      const maxMonthly = Math.max(...monthlySpent);
      const minMonthly = Math.min(...monthlySpent);
      const budget = tag.monthlyBudget || 0;
      const exceededMonths = budget > 0 ? monthlySpent.filter(v => v > budget).length : 0;

      return {
        id: tag.id,
        name: tag.name,
        color: tag.color || '#1A1A1A',
        pillar: tag.pillar || 'WANT',
        parentId: tag.parentId || null,
        isParentWithChildren,
        budget,
        monthlySpent,
        totalAnnual,
        avgMonthly,
        maxMonthly,
        minMonthly,
        exceededMonths,
      };
    });

    categories.sort((a, b) => b.totalAnnual - a.totalAnnual);

    const maxAnyCategoryMonth = Math.max(...categories.map(c => c.maxMonthly), 1);

    return {
      categories,
      maxAnyCategoryMonth,
    };
  }, [tags, transactions, selectedYear, baseCurrency, lots, dbCurrencies]);

  // Estructura jerárquica de árbol de categorías (Padre -> Subcategorías) por pilar
  const hierarchicalCategories = useMemo(() => {
    const buildTreeForPillar = (pillar) => {
      const pillarCats = categoryAnalytics.categories.filter(c => c.pillar === pillar);
      const parentCats = pillarCats.filter(c => !c.parentId);
      const childCats = pillarCats.filter(c => c.parentId);

      const tree = [];
      parentCats.forEach(parent => {
        tree.push({ ...parent, isChild: false });
        const children = childCats.filter(c => c.parentId === parent.id);
        children.forEach(child => {
          tree.push({ ...child, isChild: true, parentName: parent.name });
        });
      });

      // Subcategorías huérfanas
      const orphanChildren = childCats.filter(c => !parentCats.some(p => p.id === c.parentId));
      orphanChildren.forEach(orphan => {
        tree.push({ ...orphan, isChild: true, parentName: 'Otros' });
      });

      return tree;
    };

    return {
      needs: buildTreeForPillar('NEED'),
      wants: buildTreeForPillar('WANT'),
    };
  }, [categoryAnalytics.categories]);

  // Filtrado y agrupación jerárquica para Tendencias (Padres -> Hijas)
  const trendsData = useMemo(() => {
    const parentList = categoryAnalytics.categories.filter(c => !c.parentId);
    const childList = categoryAnalytics.categories.filter(c => c.parentId);

    const matchesFilter = (cat) => {
      const matchesPillar = pillarFilter === 'ALL' || cat.pillar === pillarFilter;
      const matchesSearch = !searchQuery || cat.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesPillar && matchesSearch;
    };

    const groups = [];
    parentList.forEach(parent => {
      const children = childList.filter(c => c.parentId === parent.id);
      const parentMatches = matchesFilter(parent);
      const matchingChildren = children.filter(matchesFilter);

      if (parentMatches || matchingChildren.length > 0) {
        groups.push({
          parent,
          children,
        });
      }
    });

    // Subcategorías huérfanas
    const orphans = childList.filter(c => !parentList.some(p => p.id === c.parentId) && matchesFilter(c));

    return { groups, orphans };
  }, [categoryAnalytics.categories, pillarFilter, searchQuery]);

  const renderHeatmapRow = (cat) => {
    return (
      <tr key={cat.id} className="hover:bg-black/5 transition-colors">
        {/* Columna fija de nombre */}
        <td className="py-1.5 pl-2 truncate max-w-[130px] sticky left-0 bg-[#F5F2ED] z-10">
          {cat.isChild ? (
            <span className="pl-3 font-mono text-[8px] text-noria-muted truncate block">
              └ {cat.name}
            </span>
          ) : (
            <span className="font-mono text-[9px] font-bold text-noria-text truncate block uppercase">
              {cat.name}
            </span>
          )}
        </td>

        {/* Columna de Presupuesto Editable */}
        <td className="py-1 pr-1.5 text-right font-mono text-[8px]">
          {editingBudgetId === cat.id ? (
            <input
              type="number"
              step="any"
              defaultValue={cat.budget || ''}
              autoFocus
              className="w-14 bg-white border border-[#1A1A1A] px-1 py-0.2 font-mono text-[8px] text-noria-text text-right focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdateBudget(cat.id, e.target.value);
                else if (e.key === 'Escape') setEditingBudgetId(null);
              }}
              onBlur={(e) => handleUpdateBudget(cat.id, e.target.value)}
            />
          ) : (
            <span
              onClick={() => setEditingBudgetId(cat.id)}
              className="cursor-pointer hover:underline text-noria-text"
              title="Clic para editar presupuesto"
            >
              {cat.budget > 0 ? fmt(cat.budget) : <span className="text-noria-muted/40 hover:text-noria-text">+</span>}
            </span>
          )}
        </td>

        {/* 12 Celdas de calor por mes */}
        {cat.monthlySpent.map((val, idx) => {
          const isOver = cat.budget > 0 && val > cat.budget;
          const ratio = cat.maxMonthly > 0 ? val / cat.maxMonthly : 0;

          let cellBg = 'transparent';
          let cellText = 'text-noria-muted/40';

          if (val > 0) {
            if (isOver) {
              cellBg = 'rgba(159,47,45,0.2)';
              cellText = 'text-[#9F2F2D] font-bold';
            } else {
              const opacity = Math.min(0.5, 0.08 + ratio * 0.35);
              cellBg = `rgba(26,26,26,${opacity.toFixed(2)})`;
              cellText = ratio > 0.4 ? 'text-noria-text font-bold' : 'text-noria-text';
            }
          }

          return (
            <td
              key={idx}
              onClick={() => setSelectedHeatCell({
                categoryId: cat.id,
                categoryName: cat.name,
                monthName: MONTH_NAMES_FULL[idx],
                amount: val,
                budget: cat.budget,
                avg: cat.avgMonthly,
              })}
              className={`py-1 text-center cursor-pointer transition-colors hover:ring-1 hover:ring-[#1A1A1A] ${cellText}`}
              style={{ backgroundColor: cellBg }}
              title={`${cat.name} · ${MONTH_NAMES_SHORT[idx]}: ${fmt(val)}`}
            >
              {val > 0 ? (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : Math.round(val)) : '—'}
            </td>
          );
        })}

        {/* Total anual de la categoría */}
        <td className="py-1.5 pr-2 text-right font-bold text-noria-text">
          {fmt(cat.totalAnnual)}
        </td>
      </tr>
    );
  };

  return (
    <div className="min-h-screen pb-32 pt-14" style={{ background: '#F5F2ED' }}>
      <div className="w-full max-w-md mx-auto px-4 sm:px-6">

        {/* Header superior con botón Volver y Selector de Año */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A1A]">
          <button
            type="button"
            onClick={() => navigate('/budget')}
            className="flex items-center space-x-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-noria-text hover:opacity-70 focus:outline-none transition-opacity"
          >
            <ArrowLeft size={14} strokeWidth={2} />
            <span>Volver</span>
          </button>

          <h2 className="font-mono text-[11px] font-[800] uppercase tracking-[0.14em] text-noria-text">
            Análisis Anual & Cashflow
          </h2>

          {/* Selector de Año */}
          <div className="flex items-center space-x-1 border border-[#1A1A1A] px-1.5 py-0.5 bg-transparent">
            <button
              type="button"
              onClick={() => {
                const idx = availableYears.indexOf(selectedYear);
                if (idx < availableYears.length - 1) setSelectedYear(availableYears[idx + 1]);
              }}
              disabled={availableYears.indexOf(selectedYear) >= availableYears.length - 1}
              className="disabled:opacity-20 text-noria-text focus:outline-none"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="font-mono text-[11px] font-[700] text-noria-text px-1">
              {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => {
                const idx = availableYears.indexOf(selectedYear);
                if (idx > 0) setSelectedYear(availableYears[idx - 1]);
              }}
              disabled={availableYears.indexOf(selectedYear) <= 0}
              className="disabled:opacity-20 text-noria-text focus:outline-none"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Resumen Consolidado Anual */}
        <div className="mt-4 border-2 border-[#1A1A1A] p-3.5 space-y-3 bg-transparent">
          <div className="flex justify-between items-center border-b border-[#1A1A1A]/20 pb-2">
            <span className="font-mono text-[9px] font-[800] uppercase tracking-[0.14em] text-[#647C78]">
              CONSOLIDADO EJECUTIVO · AÑO {selectedYear}
            </span>
            <span className="font-mono text-[9px] font-bold text-noria-muted">
              {baseCurrency}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-noria-muted block leading-none">
                INGRESOS TOTALES
              </span>
              <p className="font-sans text-[17px] font-bold leading-tight mt-0.5 text-[#4F8F58]">
                {fmt(annualCashflow.totalIncome)}
              </p>
              <p className="font-mono text-[8px] text-noria-muted mt-0.5">
                PROM. {fmt(annualCashflow.avgMonthlyIncome)}/MES
              </p>
            </div>

            <div>
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-noria-muted block leading-none">
                GASTOS TOTALES
              </span>
              <p className="font-sans text-[17px] font-bold leading-tight mt-0.5 text-[#9F2F2D]">
                {fmt(annualCashflow.totalExpense)}
              </p>
              <p className="font-mono text-[8px] text-noria-muted mt-0.5">
                PROM. {fmt(annualCashflow.avgMonthlyExpense)}/MES
              </p>
            </div>

            <div className="border-t border-[#1A1A1A]/15 pt-2">
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-noria-muted block leading-none">
                FLUJO NETO (AHORRO)
              </span>
              <p className={`font-sans text-[17px] font-bold leading-tight mt-0.5 ${annualCashflow.totalNet >= 0 ? 'text-[#4F8F58]' : 'text-[#9F2F2D]'}`}>
                {annualCashflow.totalNet >= 0 ? '+' : ''}{fmt(annualCashflow.totalNet)}
              </p>
              <p className="font-mono text-[8px] text-noria-muted mt-0.5">
                {annualCashflow.totalNet >= 0 ? 'SUPERÁVIT ANUAL' : 'DÉFICIT ANUAL'}
              </p>
            </div>

            <div className="border-t border-[#1A1A1A]/15 pt-2">
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-noria-muted block leading-none">
                TASA DE AHORRO ANUAL
              </span>
              <p className={`font-sans text-[17px] font-bold leading-tight mt-0.5 ${annualCashflow.overallSavingsRate >= 0 ? 'text-noria-text' : 'text-[#9F2F2D]'}`}>
                {annualCashflow.overallSavingsRate.toFixed(1)}%
              </p>
              <p className="font-mono text-[8px] text-noria-muted mt-0.5">
                DEL INGRESO COBRADO
              </p>
            </div>
          </div>
        </div>

        {/* Barra de Pestañas Brutalista: FLUJO MENSUAL | TENDENCIAS | MATRIZ DE CALOR */}
        <div className="flex border-b-2 border-[#1A1A1A] mt-5 font-mono text-[10px] uppercase tracking-[0.12em]">
          <button
            type="button"
            onClick={() => setActiveTab('CASHFLOW')}
            className={`flex-1 py-2 text-center transition-colors focus:outline-none ${
              activeTab === 'CASHFLOW'
                ? 'border-b-2 border-[#1A1A1A] -mb-[2px] font-[800] text-noria-text bg-black/5'
                : 'text-noria-muted hover:text-noria-text'
            }`}
          >
            Flujo Mensual
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('TRENDS')}
            className={`flex-1 py-2 text-center transition-colors focus:outline-none ${
              activeTab === 'TRENDS'
                ? 'border-b-2 border-[#1A1A1A] -mb-[2px] font-[800] text-noria-text bg-black/5'
                : 'text-noria-muted hover:text-noria-text'
            }`}
          >
            Tendencias
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('HEATMAP')}
            className={`flex-1 py-2 text-center transition-colors focus:outline-none ${
              activeTab === 'HEATMAP'
                ? 'border-b-2 border-[#1A1A1A] -mb-[2px] font-[800] text-noria-text bg-black/5'
                : 'text-noria-muted hover:text-noria-text'
            }`}
          >
            Matriz de Calor
          </button>
        </div>

        {/* ─── PESTAÑA 1: FLUJO MENSUAL (Ingresos vs Gastos mes a mes) ─── */}
        {activeTab === 'CASHFLOW' && (
          <div className="mt-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#647C78]">
                REGISTRO MENSUAL ENE - DIC ({selectedYear})
              </span>
              <span className="font-mono text-[8px] text-noria-muted uppercase">
                12 PERÍODOS
              </span>
            </div>

            <div className="border-2 border-[#1A1A1A] bg-transparent overflow-hidden">
              <table className="w-full border-collapse font-mono text-[10px]">
                <thead>
                  <tr className="bg-[#1A1A1A] text-[#F5F2ED] text-[8px] font-bold uppercase tracking-[0.14em]">
                    <th className="py-2 pl-2 text-left w-[14%]">MES</th>
                    <th className="py-2 text-right w-[24%]">INGRESOS</th>
                    <th className="py-2 text-right w-[24%]">GASTOS</th>
                    <th className="py-2 text-right w-[24%]">NETO</th>
                    <th className="py-2 pr-2 text-right w-[14%]">AHORRO</th>
                  </tr>
                </thead>
                <tbody>
                  {annualCashflow.months.map((m) => {
                    const isNetPositive = m.net >= 0;
                    const hasActivity = m.income > 0 || m.expense > 0;
                    const incBarPct = (m.income / annualCashflow.maxMonthlyVolume) * 100;
                    const expBarPct = (m.expense / annualCashflow.maxMonthlyVolume) * 100;

                    return (
                      <tr
                        key={m.monthIndex}
                        className={`border-b border-[#1A1A1A]/10 hover:bg-black/5 transition-colors ${
                          !hasActivity ? 'opacity-40' : ''
                        }`}
                      >
                        <td className="py-2.5 pl-2 font-bold uppercase text-noria-text">
                          {m.shortName}
                        </td>
                        <td className="py-2.5 text-right text-[#4F8F58]">
                          {m.income > 0 ? fmt(m.income) : '—'}
                        </td>
                        <td className="py-2.5 text-right text-[#9F2F2D]">
                          {m.expense > 0 ? fmt(m.expense) : '—'}
                        </td>
                        <td className={`py-2.5 text-right font-bold ${isNetPositive ? 'text-[#4F8F58]' : 'text-[#9F2F2D]'}`}>
                          {hasActivity ? `${isNetPositive ? '+' : ''}${fmt(m.net)}` : '—'}
                        </td>
                        <td className={`py-2.5 pr-2 text-right font-bold ${m.savingsRate >= 0 ? 'text-noria-text' : 'text-[#9F2F2D]'}`}>
                          {m.income > 0 ? `${Math.round(m.savingsRate)}%` : (m.expense > 0 ? '-100%' : '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#1A1A1A]/10 border-t-2 border-[#1A1A1A] font-bold text-[9px]">
                    <td className="py-2.5 pl-2 uppercase">TOTAL</td>
                    <td className="py-2.5 text-right text-[#4F8F58]">{fmt(annualCashflow.totalIncome)}</td>
                    <td className="py-2.5 text-right text-[#9F2F2D]">{fmt(annualCashflow.totalExpense)}</td>
                    <td className={`py-2.5 text-right ${annualCashflow.totalNet >= 0 ? 'text-[#4F8F58]' : 'text-[#9F2F2D]'}`}>
                      {annualCashflow.totalNet >= 0 ? '+' : ''}{fmt(annualCashflow.totalNet)}
                    </td>
                    <td className="py-2.5 pr-2 text-right text-noria-text">
                      {Math.round(annualCashflow.overallSavingsRate)}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ─── PESTAÑA 2: TENDENCIAS (Sparklines por categoría) ─── */}
        {activeTab === 'TRENDS' && (
          <div className="mt-4 space-y-4">
            {/* Controles de filtro: Pilar y Búsqueda */}
            <div className="space-y-2">
              <div className="flex border border-[#1A1A1A] p-0.5 font-mono text-[9px] uppercase tracking-[0.12em]">
                {['ALL', 'NEED', 'WANT'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPillarFilter(p)}
                    className={`flex-1 py-1 text-center transition-colors focus:outline-none ${
                      pillarFilter === p ? 'bg-[#1A1A1A] text-[#F5F2ED] font-bold' : 'text-noria-muted hover:text-noria-text'
                    }`}
                  >
                    {p === 'ALL' ? 'Todos' : p === 'NEED' ? 'Necesidades' : 'Deseos'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 border border-[#1A1A1A] px-2.5 py-1.5 bg-transparent">
                <Search size={13} className="text-noria-muted shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="FILTRAR CATEGORÍA..."
                  className="bg-transparent font-mono text-[10px] uppercase placeholder-noria-muted/60 focus:outline-none w-full p-0"
                />
              </div>
            </div>

            {/* Lista Jerárquica de Categorías Padre con Subcategorías Colapsables */}
            <div className="space-y-3">
              {trendsData.groups.length === 0 && trendsData.orphans.length === 0 ? (
                <div className="border border-[#1A1A1A] p-6 text-center font-mono text-[10px] text-noria-muted uppercase">
                  No se encontraron categorías de gasto con actividad en {selectedYear}
                </div>
              ) : (
                <>
                  {trendsData.groups.map(({ parent, children }) => {
                    const isOverBudget = parent.budget > 0 && parent.avgMonthly > parent.budget;
                    const hasChildren = children.length > 0;
                    const isExpanded = expandedSubcatParentIds.has(parent.id);

                    return (
                      <div
                        key={parent.id}
                        className="border border-[#1A1A1A]/30 p-3 bg-transparent space-y-2.5 transition-all"
                      >
                        {/* Fila superior de categoría padre */}
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="font-mono text-[12px] font-bold uppercase tracking-wider text-noria-text">
                                {parent.name}
                              </h4>
                              <span className="font-mono text-[8px] border border-[#1A1A1A]/30 px-1 py-0.2 text-noria-muted">
                                {parent.pillar === 'NEED' ? 'NECESIDAD' : 'DESEO'}
                              </span>
                            </div>
                            {editingBudgetId === parent.id ? (
                              <div className="flex items-center space-x-1.5 mt-1">
                                <span className="font-mono text-[8px] text-noria-muted uppercase">PRESUP:</span>
                                <input
                                  type="number"
                                  step="any"
                                  defaultValue={parent.budget || ''}
                                  placeholder="0.00"
                                  autoFocus
                                  className="w-20 bg-white border border-[#1A1A1A] px-1.5 py-0.5 font-mono text-[9px] text-noria-text focus:outline-none"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUpdateBudget(parent.id, e.target.value);
                                    else if (e.key === 'Escape') setEditingBudgetId(null);
                                  }}
                                  onBlur={(e) => handleUpdateBudget(parent.id, e.target.value)}
                                />
                                <span className="font-mono text-[7px] text-noria-muted">/MES [ENTER]</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingBudgetId(parent.id)}
                                className={`font-mono text-[8px] mt-0.5 text-left focus:outline-none hover:underline flex items-center space-x-1 ${
                                  isOverBudget ? 'text-[#9F2F2D]' : 'text-noria-muted'
                                }`}
                              >
                                <span className="flex items-center">
                                  {parent.budget > 0
                                    ? `PRESUPUESTO: ${fmt(parent.budget)}/MES · ${parent.exceededMonths} MESES EXCEDIDO`
                                    : '+ ASIGNAR PRESUPUESTO MENSUAL'}
                                  <Pencil size={9} strokeWidth={1.5} className="ml-1 text-noria-muted opacity-70" />
                                </span>
                              </button>
                            )}
                          </div>

                          <div className="text-right font-mono">
                            <p className="font-sans text-[14px] font-bold leading-tight text-noria-text">
                              {fmt(parent.totalAnnual)}
                            </p>
                            <p className="text-[8px] text-noria-muted">
                              PROM. {fmt(parent.avgMonthly)}/M
                            </p>
                          </div>
                        </div>

                        {/* Sparkline Bézier interactivo de la categoría padre */}
                        <div className="border-t border-[#1A1A1A]/15 pt-2">
                          <Sparkline
                            id={parent.id}
                            values={parent.monthlySpent}
                            budget={parent.budget}
                            color={parent.pillar === 'NEED' ? '#4F8F58' : '#3F7F9C'}
                            fmt={fmt}
                          />
                        </div>

                        {/* Bloque desplegable de subcategorías */}
                        {hasChildren && (
                          <div className="border-t border-[#1A1A1A]/15 pt-2">
                            <button
                              type="button"
                              onClick={() => toggleSubcats(parent.id)}
                              className="w-full flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.12em] text-noria-muted hover:text-noria-text focus:outline-none py-0.5"
                            >
                              <span>
                                {isExpanded
                                  ? `Ocultar subcategorías (${children.length})`
                                  : `+ ${children.length} subcategoría${children.length > 1 ? 's' : ''}`}
                              </span>
                              {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            </button>

                            {isExpanded && (
                              <div className="mt-2 space-y-2 border-t border-[#1A1A1A]/10 pt-2">
                                {children.map(sub => {
                                  const isSubOver = sub.budget > 0 && sub.avgMonthly > sub.budget;
                                  return (
                                    <div
                                      key={sub.id}
                                      className="border border-[#1A1A1A]/15 p-2 bg-black/[0.015] space-y-1.5"
                                    >
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <h5 className="font-mono text-[10px] font-bold uppercase tracking-wider text-noria-text">
                                            └ {sub.name}
                                          </h5>
                                          {editingBudgetId === sub.id ? (
                                            <div className="flex items-center space-x-1 mt-0.5">
                                              <span className="font-mono text-[7px] text-noria-muted uppercase">PRESUP:</span>
                                              <input
                                                type="number"
                                                step="any"
                                                defaultValue={sub.budget || ''}
                                                placeholder="0.00"
                                                autoFocus
                                                className="w-16 bg-white border border-[#1A1A1A] px-1 py-0.2 font-mono text-[8px] text-noria-text focus:outline-none"
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') handleUpdateBudget(sub.id, e.target.value);
                                                  else if (e.key === 'Escape') setEditingBudgetId(null);
                                                }}
                                                onBlur={(e) => handleUpdateBudget(sub.id, e.target.value)}
                                              />
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => setEditingBudgetId(sub.id)}
                                              className={`font-mono text-[7px] mt-0.5 text-left focus:outline-none hover:underline flex items-center space-x-1 ${
                                                isSubOver ? 'text-[#9F2F2D]' : 'text-noria-muted'
                                              }`}
                                            >
                                              <span>
                                                {sub.budget > 0
                                                  ? `PRESUP: ${fmt(sub.budget)}/M`
                                                  : '+ ASIGNAR PRESUP.'}
                                              </span>
                                              <Pencil size={8} strokeWidth={1.5} className="ml-0.5 text-noria-muted opacity-70" />
                                            </button>
                                          )}
                                        </div>

                                        <div className="text-right font-mono">
                                          <p className="font-sans text-[12px] font-bold leading-tight text-noria-text">
                                            {fmt(sub.totalAnnual)}
                                          </p>
                                          <p className="text-[7px] text-noria-muted">
                                            PROM. {fmt(sub.avgMonthly)}/M
                                          </p>
                                        </div>
                                      </div>

                                      <Sparkline
                                        id={sub.id}
                                        values={sub.monthlySpent}
                                        budget={sub.budget}
                                        color={sub.pillar === 'NEED' ? '#4F8F58' : '#3F7F9C'}
                                        fmt={fmt}
                                        height={36}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Subcategorías huérfanas si las hubiera */}
                  {trendsData.orphans.map((orphan) => {
                    const isOverBudget = orphan.budget > 0 && orphan.avgMonthly > orphan.budget;

                    return (
                      <div
                        key={orphan.id}
                        className="border border-[#1A1A1A]/30 p-3 bg-transparent space-y-2.5 transition-all"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="font-mono text-[12px] font-bold uppercase tracking-wider text-noria-text">
                                {orphan.name}
                              </h4>
                              <span className="font-mono text-[8px] border border-[#1A1A1A]/30 px-1 py-0.2 text-noria-muted">
                                {orphan.pillar === 'NEED' ? 'NECESIDAD' : 'DESEO'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingBudgetId(orphan.id)}
                              className={`font-mono text-[8px] mt-0.5 text-left focus:outline-none hover:underline flex items-center space-x-1 ${
                                isOverBudget ? 'text-[#9F2F2D]' : 'text-noria-muted'
                              }`}
                            >
                              <span className="flex items-center">
                                {orphan.budget > 0
                                  ? `PRESUPUESTO: ${fmt(orphan.budget)}/MES`
                                  : '+ ASIGNAR PRESUPUESTO MENSUAL'}
                                <Pencil size={9} strokeWidth={1.5} className="ml-1 text-noria-muted opacity-70" />
                              </span>
                            </button>
                          </div>

                          <div className="text-right font-mono">
                            <p className="font-sans text-[14px] font-bold leading-tight text-noria-text">
                              {fmt(orphan.totalAnnual)}
                            </p>
                            <p className="text-[8px] text-noria-muted">
                              PROM. {fmt(orphan.avgMonthly)}/M
                            </p>
                          </div>
                        </div>

                        <div className="border-t border-[#1A1A1A]/15 pt-2">
                          <Sparkline
                            id={orphan.id}
                            values={orphan.monthlySpent}
                            budget={orphan.budget}
                            color={orphan.pillar === 'NEED' ? '#4F8F58' : '#3F7F9C'}
                            fmt={fmt}
                          />
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── PESTAÑA 3: MATRIZ DE CALOR (Jerarquía Padre/Subcategoría x Meses) ─── */}
        {activeTab === 'HEATMAP' && (
          <div className="mt-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#647C78]">
                MATRIZ ANUAL DE GASTOS · JERARQUÍA X MESES
              </span>
              <span className="font-mono text-[8px] text-noria-muted uppercase">
                TOCA CELDA O PRESUP. PARA EDITAR
              </span>
            </div>

            {/* Banner de inspección si hay una celda seleccionada */}
            {selectedHeatCell && (
              <div className="border-2 border-[#1A1A1A] p-2.5 bg-black/5 font-mono text-[9px] flex justify-between items-center">
                <div>
                  <p className="font-bold uppercase tracking-wider text-noria-text">
                    {selectedHeatCell.monthName} · {selectedHeatCell.categoryName}
                  </p>
                  <div className="flex items-center space-x-2 text-[8px] text-noria-muted mt-0.5">
                    <span>GASTO: <strong className="text-noria-text">{fmt(selectedHeatCell.amount)}</strong></span>
                    <span>·</span>
                    {editingBudgetId === selectedHeatCell.categoryId ? (
                      <div className="inline-flex items-center space-x-1">
                        <span>PRESUP:</span>
                        <input
                          type="number"
                          step="any"
                          defaultValue={selectedHeatCell.budget || ''}
                          autoFocus
                          className="w-16 bg-white border border-[#1A1A1A] px-1 py-0.2 font-mono text-[8px] text-noria-text"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateBudget(selectedHeatCell.categoryId, e.target.value);
                              setSelectedHeatCell(prev => ({ ...prev, budget: parseFloat(e.target.value) || 0 }));
                            } else if (e.key === 'Escape') setEditingBudgetId(null);
                          }}
                          onBlur={(e) => {
                            handleUpdateBudget(selectedHeatCell.categoryId, e.target.value);
                            setSelectedHeatCell(prev => ({ ...prev, budget: parseFloat(e.target.value) || 0 }));
                          }}
                        />
                      </div>
                    ) : (
                      <span
                        onClick={() => setEditingBudgetId(selectedHeatCell.categoryId)}
                        className="cursor-pointer hover:underline inline-flex items-center"
                        title="Clic para editar presupuesto"
                      >
                        PRESUP: <strong className="text-noria-text ml-1">{selectedHeatCell.budget > 0 ? fmt(selectedHeatCell.budget) : 'Sin asignar'}</strong>
                        <Pencil size={9} strokeWidth={1.5} className="ml-1 text-noria-muted opacity-70" />
                      </span>
                    )}
                    <span>·</span>
                    <span>PROM: {fmt(selectedHeatCell.avg)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHeatCell(null)}
                  className="font-bold border border-[#1A1A1A] px-2 py-0.5 text-noria-text uppercase text-[8px] hover:bg-black/10 focus:outline-none"
                >
                  Cerrar
                </button>
              </div>
            )}

            {/* Tabla Matricial Abierta sin separadores internos */}
            <div className="overflow-x-auto border-t border-b border-[#1A1A1A] py-1 bg-transparent">
              <table className="w-full border-collapse font-mono text-[9px] min-w-[580px]">
                <thead>
                  <tr className="border-b border-[#1A1A1A] text-noria-muted text-[8px] font-bold uppercase tracking-[0.14em]">
                    <th className="py-2 pl-2 text-left sticky left-0 bg-[#F5F2ED] z-10 w-32">
                      CATEGORÍA
                    </th>
                    <th className="py-2 pr-1.5 text-right w-16 text-[7px]">
                      PRESUP.
                    </th>
                    {MONTH_NAMES_SHORT.map((m) => (
                      <th key={m} className="py-2 text-center w-7">
                        {m.slice(0, 1)}
                      </th>
                    ))}
                    <th className="py-2 pr-2 text-right w-16">
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* --- SECCIÓN NECESIDADES --- */}
                  <tr className="border-b border-[#1A1A1A]/20">
                    <td colSpan={15} className="pt-3 pb-1 pl-2 font-mono text-[8px] font-[900] uppercase tracking-wider text-[#4F8F58]">
                      // NECESIDADES
                    </td>
                  </tr>
                  {hierarchicalCategories.needs.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="py-2 text-center text-noria-muted text-[8px]">
                        SIN CATEGORÍAS EN NECESIDADES
                      </td>
                    </tr>
                  ) : (
                    hierarchicalCategories.needs.map((cat) => renderHeatmapRow(cat))
                  )}

                  {/* --- SECCIÓN DESEOS --- */}
                  <tr className="border-b border-[#1A1A1A]/20">
                    <td colSpan={15} className="pt-4 pb-1 pl-2 font-mono text-[8px] font-[900] uppercase tracking-wider text-[#3F7F9C]">
                      // DESEOS
                    </td>
                  </tr>
                  {hierarchicalCategories.wants.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="py-2 text-center text-noria-muted text-[8px]">
                        SIN CATEGORÍAS EN DESEOS
                      </td>
                    </tr>
                  ) : (
                    hierarchicalCategories.wants.map((cat) => renderHeatmapRow(cat))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#1A1A1A] font-bold text-[8px]">
                    <td className="py-2.5 pl-2 uppercase sticky left-0 bg-[#F5F2ED] z-10">
                      TOTAL MES
                    </td>
                    <td className="py-2.5 pr-1.5 text-right text-noria-muted text-[7px]">
                      —
                    </td>
                    {annualCashflow.months.map((m) => (
                      <td key={m.monthIndex} className="py-2.5 text-center text-[#9F2F2D]">
                        {m.expense > 0 ? (m.expense >= 1000 ? `${(m.expense / 1000).toFixed(1)}k` : Math.round(m.expense)) : '—'}
                      </td>
                    ))}
                    <td className="py-2.5 pr-2 text-right text-[#9F2F2D]">
                      {fmt(annualCashflow.totalExpense)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Leyenda de la matriz de calor */}
            <div className="flex items-center justify-between font-mono text-[8px] text-noria-muted uppercase pt-1">
              <span>Escala: [ — Vacío ] → [ Suave ] → [ Intenso ]</span>
              <span className="text-[#9F2F2D] font-bold">[ Rojo: Exceso sobre presupuesto ]</span>
            </div>
          </div>
        )}

      </div>

      <FAB />
      <BottomNav />
    </div>
  );
}
