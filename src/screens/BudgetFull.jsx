import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import FAB from '../components/FAB';
import { ChevronDown, ChevronRight, Search, AlertCircle, ArrowLeft } from 'lucide-react';
import { formatCurrency } from '../utils/format';

export default function BudgetFull() {
  const navigate = useNavigate();

  // 1. Dexie Queries
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const anchors = useLiveQuery(() => db.anchors.toArray()) || [];
  const macetas = useLiveQuery(() => db.macetas.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const dbCurrencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const lots = useLiveQuery(() => db.lots.toArray()) || [];

  // 2. States
  const [period, setPeriod] = useState('MES'); // SEMANA, MES, TRIMESTRE, AÑO
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedParentIds, setExpandedParentIds] = useState({});

  // 3. Helper conversion & formatting functions
  const convertAmountToUSD = (amt, currency) => {
    if (currency === 'USD' || currency === 'USDT' || currency === 'USDC' || !currency) {
      return amt;
    }
    const currencyLots = lots.filter(l => l.currency === currency && l.remainingAmount > 0);
    const totalRemaining = currencyLots.reduce((sum, l) => sum + l.remainingAmount, 0);
    const totalUSD = currencyLots.reduce((sum, l) => sum + (l.remainingAmount / l.effectiveRate), 0);
    if (totalUSD > 0) {
      const avgRate = totalRemaining / totalUSD;
      return amt / avgRate;
    }
    if (currency === 'VES') return amt / 40.0;
    if (currency === 'EUR') return amt * 1.08;
    return amt;
  };

  const fmt = (n) => {
    return formatCurrency(n, 'USD', dbCurrencies);
  };

  // 4. Period scaling calculation
  const getPeriodScalingFactor = (p) => {
    switch (p) {
      case 'SEMANA':
        return 7 / 30.4375;
      case 'MES':
        return 1;
      case 'TRIMESTRE':
        return 3;
      case 'AÑO':
        return 12;
      default:
        return 1;
    }
  };

  // 5. Date Ranges
  // Active/Current period range
  const currentPeriodRange = useMemo(() => {
    const today = new Date();
    let start, end;
    if (period === 'SEMANA') {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      start = new Date(today.setDate(diff));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'MES') {
      start = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === 'TRIMESTRE') {
      const quarter = Math.floor(today.getMonth() / 3);
      start = new Date(today.getFullYear(), quarter * 3, 1, 0, 0, 0);
      end = new Date(today.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59, 999);
    } else { // AÑO
      start = new Date(today.getFullYear(), 0, 1, 0, 0, 0);
      end = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
    }
    return { start, end };
  }, [period]);

  // Last 3 complete months range
  const prev3MonthsRange = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() - 3, 1, 0, 0, 0);
    const end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
    return { start, end };
  }, []);

  // 6. DB calculations grouping by category/saving
  const inlineTargetUpdate = async (tagId, value) => {
    const parsed = parseFloat(value);
    const budget = isNaN(parsed) || parsed <= 0 ? null : parsed;
    await db.tags.update(tagId, { monthlyBudget: budget });
  };

  const processedData = useMemo(() => {
    if (!tags.length || !transactions.length) return { needs: [], wants: [], savings: [] };

    const scaling = getPeriodScalingFactor(period);
    const { start: currStart, end: currEnd } = currentPeriodRange;
    const { start: histStart, end: histEnd } = prev3MonthsRange;

    // Filter transactions
    const currTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= currStart && d <= currEnd && t.type === 'OUT';
    });

    const histTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= histStart && d <= histEnd && t.type === 'OUT';
    });

    // Helper to calculate statistics for a tag (including subtags if parent)
    const getTagStats = (tag, childTags = []) => {
      const tagIds = [tag.id, ...childTags.map(c => c.id)];

      // 1. Current spent
      const currentSpent = currTx
        .filter(t => t.tagId && tagIds.includes(t.tagId))
        .reduce((sum, t) => sum + (t.amountUSD ?? t.amount), 0);

      // 2. 3-month average
      const totalHist = histTx
        .filter(t => t.tagId && tagIds.includes(t.tagId))
        .reduce((sum, t) => sum + (t.amountUSD ?? t.amount), 0);
      const averageHist = (totalHist / 3) * scaling;

      // 3. Target (Fixed anchors + Variable manual budget)
      // Fixed anchors associated to this tag/children (templates only, active)
      const fixedAnchors = anchors.filter(a => 
        a.isTemplate === true && 
        !a.isArchived && 
        a.tagId && 
        tagIds.includes(a.tagId) && 
        a.pillar !== 'SAVE'
      );
      const fixedMonthly = fixedAnchors.reduce((sum, a) => sum + convertAmountToUSD(a.amount, a.currency), 0);

      // Manual budgets (variables)
      const variableMonthly = (tag.monthlyBudget || 0) + childTags.reduce((sum, c) => sum + (c.monthlyBudget || 0), 0);

      const totalMonthlyTarget = fixedMonthly + variableMonthly;
      const scaledTarget = totalMonthlyTarget * scaling;

      return {
        currentSpent,
        averageHist,
        scaledTarget,
        fixedMonthlyScaled: fixedMonthly * scaling,
        variableMonthlyScaled: variableMonthly * scaling
      };
    };

    // Group tags
    const parentTags = tags.filter(t => !t.parentId && t.kind === 'EXPENSE');
    const childTags = tags.filter(t => t.parentId && t.kind === 'EXPENSE');

    const categorised = parentTags.map(parent => {
      const children = childTags.filter(c => c.parentId === parent.id);
      
      // Parent stats (aggregates parent + children)
      const parentStats = getTagStats(parent, children);

      // Children stats
      const childrenData = children.map(child => {
        const stats = getTagStats(child);
        return {
          id: child.id,
          name: child.name,
          pillar: child.pillar || 'NEED',
          monthlyBudget: child.monthlyBudget || 0,
          ...stats
        };
      });

      return {
        id: parent.id,
        name: parent.name,
        pillar: parent.pillar || 'NEED',
        monthlyBudget: parent.monthlyBudget || 0,
        hasChildren: childrenData.length > 0,
        children: childrenData,
        ...parentStats
      };
    });

    // Separate Needs and Wants
    const filterAndSearch = (list) => {
      return list.filter(item => {
        const matchesName = item.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesChild = item.children && item.children.some(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesName || matchesChild;
      });
    };

    const needs = filterAndSearch(categorised.filter(t => t.pillar === 'NEED'));
    const wants = filterAndSearch(categorised.filter(t => t.pillar === 'WANT'));

    // Process Savings templates
    const savingTemplates = anchors.filter(a => a.isTemplate === true && !a.isArchived && a.pillar === 'SAVE');
    const savings = savingTemplates.map(template => {
      const relatedAnchorIds = [template.id, ...anchors.filter(a => a.parentAnchorId === template.id).map(a => a.id)];

      // Gastado Real: paid saving instances in active period
      const currentSpent = anchors
        .filter(a => a.isTemplate === false && a.parentAnchorId === template.id && a.status === 'PAID')
        .filter(a => {
          const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate + 'T12:00:00');
          return d >= currStart && d <= currEnd;
        })
        .reduce((sum, a) => sum + convertAmountToUSD(a.amount, a.currency), 0);

      // Promedio Real: paid saving instances in 3 months
      const histSpent = anchors
        .filter(a => a.isTemplate === false && a.parentAnchorId === template.id && a.status === 'PAID')
        .filter(a => {
          const d = a.nextDueDate instanceof Date ? a.nextDueDate : new Date(a.nextDueDate + 'T12:00:00');
          return d >= histStart && d <= histEnd;
        })
        .reduce((sum, a) => sum + convertAmountToUSD(a.amount, a.currency), 0);

      const averageHist = (histSpent / 3) * scaling;
      const scaledTarget = convertAmountToUSD(template.amount, template.currency) * scaling;

      return {
        id: template.id,
        name: template.name,
        averageHist,
        scaledTarget,
        currentSpent
      };
    }).filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return { needs, wants, savings };
  }, [tags, transactions, anchors, period, searchQuery, currentPeriodRange, prev3MonthsRange]);

  // Executive Totals
  const totals = useMemo(() => {
    const sum = (list, key) => list.reduce((total, item) => total + item[key], 0);

    const targetNeeds = sum(processedData.needs, 'scaledTarget');
    const targetWants = sum(processedData.wants, 'scaledTarget');
    const targetSavings = sum(processedData.savings, 'scaledTarget');

    const spentNeeds = sum(processedData.needs, 'currentSpent');
    const spentWants = sum(processedData.wants, 'currentSpent');
    const spentSavings = sum(processedData.savings, 'currentSpent');

    const avgNeeds = sum(processedData.needs, 'averageHist');
    const avgWants = sum(processedData.wants, 'averageHist');
    const avgSavings = sum(processedData.savings, 'averageHist');

    return {
      target: targetNeeds + targetWants + targetSavings,
      spent: spentNeeds + spentWants + spentSavings,
      avg: avgNeeds + avgWants + avgSavings
    };
  }, [processedData]);

  const toggleParentExpansion = (id) => {
    setExpandedParentIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderCategoryRow = (cat, isChild = false) => {
    const isExpanded = !!expandedParentIds[cat.id];
    const isOverSpent = cat.currentSpent > cat.scaledTarget && cat.scaledTarget > 0;
    
    // Parent target display: if parent has children, target is the sum of children
    const showInput = period === 'MES' && !isChild && !cat.hasChildren;
    const showChildInput = period === 'MES' && isChild;

    return (
      <React.Fragment key={`${isChild ? 'c' : 'p'}-${cat.id}`}>
        <tr className={`border-b border-[#1A1A1A]/10 text-[11px] hover:bg-black/5 transition-colors ${isChild ? 'bg-noria-bg/5' : ''}`}>
          <td className="py-2.5 pl-2 font-mono w-[42%] min-w-0">
            <div className="flex items-center">
              {!isChild && cat.hasChildren && (
                <button
                   type="button"
                   onClick={() => toggleParentExpansion(cat.id)}
                   className="mr-1 text-noria-muted hover:text-noria-text focus:outline-none flex items-center justify-center"
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              )}
              {!isChild && !cat.hasChildren && <span className="w-4" />}
              {isChild && <span className="font-sans text-[10px] text-noria-muted mr-1 font-bold">|-</span>}
              <span className={`${!isChild ? 'font-bold uppercase tracking-wider' : 'text-noria-muted'} truncate`}>
                {cat.name}
              </span>
            </div>
          </td>
          <td className="py-2.5 text-right font-mono text-noria-muted w-[18%]">
            ${cat.averageHist.toFixed(2)}
          </td>
          <td className="py-2.5 text-right font-mono w-[22%]">
            {showInput || showChildInput ? (
              <div className="inline-flex items-center justify-end w-full">
                <span className="text-[10px] text-noria-muted mr-0.5">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cat.monthlyBudget || ''}
                  onChange={(e) => inlineTargetUpdate(cat.id, e.target.value)}
                  placeholder="0"
                  className="bg-transparent font-mono text-[11px] w-12 text-right border-b border-[#1A1A1A]/20 focus:border-[#1A1A1A] focus:outline-none p-0"
                />
              </div>
            ) : (
              <span>${cat.scaledTarget.toFixed(2)}</span>
            )}
          </td>
          <td className={`py-2.5 pr-2 text-right font-mono font-[600] w-[18%] ${isOverSpent ? 'text-[#9F2F2D]' : 'text-noria-text'}`}>
            ${cat.currentSpent.toFixed(2)}
          </td>
        </tr>

        {!isChild && isExpanded && cat.children.map(child => renderCategoryRow(child, true))}
      </React.Fragment>
    );
  };

  return (
    <div className="min-h-screen pb-32 pt-16 bg-[#F5F2ED]">
      <div className="w-full max-w-md mx-auto px-6">
        
        <Header title="PRESUPUESTO" showBack={true} backRoute="/budget" />

        {/* Tab Selector Period */}
        <div className="grid grid-cols-4 gap-1.5 border-2 border-[#1A1A1A] p-1 bg-transparent mt-4 font-mono text-[10px] font-bold">
          {['SEMANA', 'MES', 'TRIMESTRE', 'AÑO'].map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`py-1.5 uppercase transition-colors focus:outline-none text-center ${period === p ? 'bg-[#1A1A1A] text-[#F5F2ED]' : 'bg-transparent text-noria-text hover:bg-black/5'}`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Executive Totals Cards */}
        <div className="grid grid-cols-3 gap-2 border border-[#1A1A1A] p-3 mt-4 text-[11px] font-mono">
          <div>
            <p className="text-noria-muted uppercase text-[9px] font-bold">PROMEDIO</p>
            <p className="font-sans text-[15px] font-bold mt-0.5">${totals.avg.toFixed(2)}</p>
          </div>
          <div className="border-l border-r border-[#1A1A1A]/20 px-2.5">
            <p className="text-noria-muted uppercase text-[9px] font-bold">OBJETIVO</p>
            <p className="font-sans text-[15px] font-bold mt-0.5">${totals.target.toFixed(2)}</p>
          </div>
          <div className="pl-1">
            <p className="text-noria-muted uppercase text-[9px] font-bold">REAL</p>
            <p className={`font-sans text-[15px] font-bold mt-0.5 ${totals.spent > totals.target ? 'text-[#9F2F2D]' : 'text-noria-text'}`}>
              ${totals.spent.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Search Filter */}
        <div className="flex items-center gap-2 border border-[#1A1A1A] px-2.5 py-1.5 mt-4 bg-transparent">
          <Search size={14} className="text-noria-muted shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="BUSCAR CATEGORÍA..."
            className="bg-transparent font-mono text-[11px] uppercase placeholder-noria-muted/60 focus:outline-none w-full p-0"
          />
        </div>

        {/* Main Budget Table */}
        <div className="mt-5 border-2 border-[#1A1A1A] overflow-hidden bg-transparent">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="bg-[#1A1A1A] text-[#F5F2ED] text-[9px] font-mono font-[700] uppercase tracking-wider">
                <th className="py-2 pl-2 text-left w-[42%]">CATEGORÍA</th>
                <th className="py-2 text-right w-[18%]">PROM.</th>
                <th className="py-2 text-right w-[22%]">OBJETIVO</th>
                <th className="py-2 pr-2 text-right w-[18%]">REAL</th>
              </tr>
            </thead>
            <tbody>
              {/* --- NECESIDADES SECTION --- */}
              <tr className="bg-[#1A1A1A]/5 border-b border-[#1A1A1A]">
                <td colSpan={4} className="py-1.5 pl-2 font-mono text-[9px] font-[900] uppercase tracking-wider text-noria-muted">
                  [ NECESIDADES ]
                </td>
              </tr>
              {processedData.needs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center font-mono text-[11px] text-noria-muted">
                    SIN CATEGORÍAS ENCONTRADAS
                  </td>
                </tr>
              ) : (
                processedData.needs.map(cat => renderCategoryRow(cat))
              )}

              {/* --- DESEOS SECTION --- */}
              <tr className="bg-[#1A1A1A]/5 border-b border-[#1A1A1A] border-t border-[#1A1A1A]">
                <td colSpan={4} className="py-1.5 pl-2 font-mono text-[9px] font-[900] uppercase tracking-wider text-noria-muted">
                  [ DESEOS ]
                </td>
              </tr>
              {processedData.wants.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center font-mono text-[11px] text-noria-muted">
                    SIN CATEGORÍAS ENCONTRADAS
                  </td>
                </tr>
              ) : (
                processedData.wants.map(cat => renderCategoryRow(cat))
              )}

              {/* --- AHORROS SECTION --- */}
              <tr className="bg-[#1A1A1A]/5 border-b border-[#1A1A1A] border-t border-[#1A1A1A]">
                <td colSpan={4} className="py-1.5 pl-2 font-mono text-[9px] font-[900] uppercase tracking-wider text-noria-muted">
                  [ AHORROS ]
                </td>
              </tr>
              {processedData.savings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center font-mono text-[11px] text-noria-muted">
                    SIN PLANES DE AHORRO
                  </td>
                </tr>
              ) : (
                processedData.savings.map(sav => {
                  const isOverTarget = sav.currentSpent > sav.scaledTarget && sav.scaledTarget > 0;
                  return (
                    <tr key={`s-${sav.id}`} className="border-b border-[#1A1A1A]/10 text-[11px] hover:bg-black/5 transition-colors">
                      <td className="py-2.5 pl-2 font-mono w-[42%] min-w-0">
                        <div className="flex items-center">
                          <span className="w-4" />
                          <span className="font-bold uppercase tracking-wider truncate">
                            {sav.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono text-noria-muted w-[18%]">
                        ${sav.averageHist.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right font-mono w-[22%]">
                        <span>${sav.scaledTarget.toFixed(2)}</span>
                      </td>
                      <td className={`py-2.5 pr-2 text-right font-mono font-[600] w-[18%] ${isOverTarget ? 'text-[#4F8F58]' : 'text-noria-text'}`}>
                        ${sav.currentSpent.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Warning Indicator */}
        {totals.spent > totals.target && (
          <div className="mt-4 flex items-center gap-2 border border-[#9F2F2D] p-3 text-[#9F2F2D] bg-[#9F2F2D]/5 font-mono text-[10px]">
            <AlertCircle size={14} className="shrink-0" />
            <span className="uppercase font-[700] tracking-wider">
              ¡Cuidado! Has sobrepasado el límite de presupuesto total para este período.
            </span>
          </div>
        )}

      </div>

      <FAB />
      <BottomNav />
    </div>
  );
}
