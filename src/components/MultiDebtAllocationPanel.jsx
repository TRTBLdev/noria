import React, { useMemo } from 'react';
import CurrencyAmount from './CurrencyAmount.jsx';
import CategorySelect from './CategorySelect.jsx';
import { FormField, NumberInput, SegmentedChoice, TextInput } from './FormSystem.jsx';
import {
  computeFifoAllocation,
  getDebtRemainingAmount,
  sortDebtsFifo,
  suggestFifoSelection,
  syncCrossCurrencyRow,
} from '../utils/debtAllocation.js';
import { getCurrencyDecimals } from '../utils/moneyAllocation.js';

export const createEmptyMultiDebtState = (fields = {}) => ({
  selectedDebtIds: [],
  manualRows: {},
  remainderAction: '',
  remainderTagId: '',
  remainderDescription: '',
  ...fields,
});

const formatDebtDate = value => {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Sin fecha'
    : date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function MultiDebtAllocationPanel({
  idPrefix = 'multi-debt',
  availableAmount = 0,
  sourceCurrency = '',
  openDebts = [],
  value,
  onChange,
  tags = [],
  currencies = [],
  allowRemainderExpense = true,
  allowRemainderReceivable = true,
  onReduceAmount = null,
}) {
  const state = value || createEmptyMultiDebtState();
  const sortedDebts = useMemo(() => sortDebtsFifo(openDebts), [openDebts]);
  const sourceDecimals = getCurrencyDecimals(sourceCurrency, currencies);
  const tolerance = 0.5 / (10 ** sourceDecimals);

  const computed = useMemo(() => computeFifoAllocation({
    availableAmount,
    sourceCurrency,
    debts: sortedDebts,
    selectedDebtIds: state.selectedDebtIds,
    manualRows: state.manualRows,
    currencies,
  }), [availableAmount, sourceCurrency, sortedDebts, state.selectedDebtIds, state.manualRows, currencies]);

  const rowsByDebtId = useMemo(() => {
    const map = new Map();
    computed.rows.forEach(row => map.set(row.debtId, row));
    return map;
  }, [computed.rows]);

  const updateState = patch => {
    onChange?.({ ...state, ...patch });
  };

  const handleSuggestFifo = () => {
    const suggestion = suggestFifoSelection({
      availableAmount,
      sourceCurrency,
      debts: sortedDebts,
      existingManualRows: state.manualRows,
      currencies,
    });
    updateState({
      selectedDebtIds: suggestion.selectedDebtIds,
      manualRows: suggestion.manualRows,
    });
  };

  const handleToggleDebt = debtId => {
    const isSelected = state.selectedDebtIds.includes(debtId);
    if (isSelected) {
      const nextManual = { ...state.manualRows };
      delete nextManual[debtId];
      updateState({
        selectedDebtIds: state.selectedDebtIds.filter(id => id !== debtId),
        manualRows: nextManual,
      });
    } else {
      updateState({
        selectedDebtIds: [...state.selectedDebtIds, debtId],
      });
    }
  };

  const handleSameCurrencySourceChange = (debtId, rawValue) => {
    updateState({
      manualRows: {
        ...state.manualRows,
        [debtId]: {
          sourceAmount: rawValue,
          isManual: rawValue !== '',
        },
      },
    });
  };

  const handleCrossCurrencyFieldChange = (debt, field, rawValue) => {
    const currentRow = rowsByDebtId.get(debt.id) || {};
    const targetDecimals = getCurrencyDecimals(debt.currency, currencies);
    const synced = syncCrossCurrencyRow({
      field,
      value: rawValue,
      currentRow: state.manualRows[debt.id] || currentRow,
      sourceDecimals,
      targetDecimals,
    });
    updateState({
      manualRows: {
        ...state.manualRows,
        [debt.id]: synced,
      },
    });
  };

  const remainderOptions = [
    ...(allowRemainderReceivable ? [{ value: 'CREATE_RECEIVABLE', label: 'Deuda por cobrar' }] : []),
    ...(allowRemainderExpense ? [{ value: 'PERSONAL_EXPENSE', label: 'Gasto personal' }] : []),
  ];

  return (
    <div className="space-y-3 border-t border-[rgba(26,26,26,0.16)] pt-3">
      <div className="flex items-center justify-between gap-2 border-b border-[#1A1A1A] pb-2">
        <div className="font-mono text-[10px]">
          <span className="uppercase tracking-[0.08em] text-noria-muted">Disponible: </span>
          <CurrencyAmount amount={availableAmount} currencyCode={sourceCurrency} className="font-[700] text-noria-text" />
        </div>
        {sortedDebts.length > 0 && (
          <button
            type="button"
            onClick={handleSuggestFifo}
            className="border border-[#647C78] px-2.5 py-1 font-mono text-[9px] font-[700] uppercase tracking-[0.1em] text-[#647C78] hover:bg-noria-text/5 focus:outline-none"
          >
            Sugerir FIFO
          </button>
        )}
      </div>

      {sortedDebts.length === 0 ? (
        <p className="py-2 text-[11px] text-[#9F2F2D]">Esta persona no tiene deudas por pagar abiertas.</p>
      ) : (
        <div className="divide-y divide-[rgba(26,26,26,0.12)]">
          {sortedDebts.map(debt => {
            const isSelected = state.selectedDebtIds.includes(debt.id);
            const row = rowsByDebtId.get(debt.id);
            const manual = state.manualRows[debt.id];
            const remaining = getDebtRemainingAmount(debt);
            const sameCurrency = debt.currency === sourceCurrency;
            const targetDecimals = getCurrencyDecimals(debt.currency, currencies);

            const sourceInputVal = manual?.sourceAmount !== undefined
              ? manual.sourceAmount
              : (row ? String(row.sourceAmount || '') : '');
            const rateInputVal = manual?.appliedRate !== undefined
              ? manual.appliedRate
              : (row?.appliedRate ? String(row.appliedRate) : '');
            const targetInputVal = manual?.targetAmount !== undefined
              ? manual.targetAmount
              : (row ? String(row.targetAmount || '') : '');

            return (
              <div key={debt.id} className="py-2.5">
                <div className="flex items-start justify-between gap-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Seleccionar ${debt.description || 'deuda'}`}
                    onClick={() => handleToggleDebt(debt.id)}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border font-mono text-[10px] font-[700] transition-colors focus:outline-none"
                    style={{
                      borderColor: isSelected ? '#647C78' : 'rgba(26,26,26,0.35)',
                      color: isSelected ? '#647C78' : 'transparent',
                      background: 'transparent',
                    }}
                  >
                    {isSelected ? 'X' : ''}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleDebt(debt.id)}
                    className="min-w-0 flex-1 text-left focus:outline-none"
                  >
                    <p className="truncate text-[13px] font-[500] text-noria-text">{debt.description || 'Deuda'}</p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-noria-muted">
                      {formatDebtDate(debt.createdAt)} · Saldo: {remaining.toFixed(targetDecimals)} {debt.currency}
                    </p>
                  </button>

                  <span className="shrink-0 border border-[#1A1A1A]/30 px-1.5 py-0.5 font-mono text-[8px] font-[700] uppercase tracking-[0.08em] text-noria-muted">
                    {sameCurrency ? '1:1' : debt.currency}
                  </span>
                </div>

                {isSelected && row && (
                  <div className="mt-2.5 space-y-2 border-l-2 border-[#647C78] pl-3">
                    {sameCurrency ? (
                      <FormField label={`Abono (${sourceCurrency})`} htmlFor={`${idPrefix}-src-${debt.id}`}>
                        <NumberInput
                          id={`${idPrefix}-src-${debt.id}`}
                          value={sourceInputVal}
                          onChange={event => handleSameCurrencySourceChange(debt.id, event.target.value)}
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                        />
                      </FormField>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        <FormField label={`Aplicado (${sourceCurrency})`} htmlFor={`${idPrefix}-src-${debt.id}`}>
                          <NumberInput
                            id={`${idPrefix}-src-${debt.id}`}
                            value={sourceInputVal}
                            onChange={event => handleCrossCurrencyFieldChange(debt, 'sourceAmount', event.target.value)}
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </FormField>
                        <FormField label={`Tasa (${sourceCurrency}/${debt.currency})`} htmlFor={`${idPrefix}-rate-${debt.id}`}>
                          <NumberInput
                            id={`${idPrefix}-rate-${debt.id}`}
                            value={rateInputVal}
                            onChange={event => handleCrossCurrencyFieldChange(debt, 'appliedRate', event.target.value)}
                            min="0"
                            step="any"
                            placeholder="Tasa"
                          />
                        </FormField>
                        <FormField label={`Abono (${debt.currency})`} htmlFor={`${idPrefix}-tgt-${debt.id}`}>
                          <NumberInput
                            id={`${idPrefix}-tgt-${debt.id}`}
                            value={targetInputVal}
                            onChange={event => handleCrossCurrencyFieldChange(debt, 'targetAmount', event.target.value)}
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </FormField>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[9px]">
                      {row.needsRate ? (
                        <span className="text-[#C58A14]">Ingresa tasa negociada o monto reconocido en {debt.currency}</span>
                      ) : row.exceedsDebt ? (
                        <span className="font-[700] text-[#9F2F2D]">
                          Excede el saldo ({remaining.toFixed(targetDecimals)} {debt.currency})
                        </span>
                      ) : (
                        <span
                          className="border px-1.5 py-0.5 text-[8px] font-[700] uppercase tracking-[0.08em]"
                          style={{
                            borderColor: row.willSettle ? '#4F8F58' : '#647C78',
                            color: row.willSettle ? '#4F8F58' : '#647C78',
                          }}
                        >
                          {row.willSettle
                            ? 'SALDADA'
                            : `PARCIAL · RESTA ${row.projectedRemaining.toFixed(targetDecimals)} ${debt.currency}`}
                        </span>
                      )}
                      {sameCurrency && (
                        <span className="uppercase tracking-[0.08em] text-noria-muted">1:1 nominal</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Control de suma y remanente */}
      <div className="space-y-2.5 border-y border-[rgba(26,26,26,0.16)] py-2.5">
        <div className="flex justify-between font-mono text-[10px]">
          <span className="uppercase tracking-[0.08em] text-noria-muted">Asignado a deudas</span>
          <CurrencyAmount amount={computed.totalAllocatedSource} currencyCode={sourceCurrency} className="font-[700]" />
        </div>
        {computed.overageSource > tolerance ? (
          <p className="border-l-2 border-[#9F2F2D] pl-2.5 font-mono text-[10px] font-[700] text-[#9F2F2D]">
            Excede el disponible por <CurrencyAmount amount={computed.overageSource} currencyCode={sourceCurrency} />
          </p>
        ) : (
          <div className="flex justify-between font-mono text-[10px]">
            <span className="uppercase tracking-[0.08em] text-noria-muted">Remanente</span>
            <CurrencyAmount amount={computed.remainderSource} currencyCode={sourceCurrency} />
          </div>
        )}

        {computed.remainderSource > tolerance && remainderOptions.length > 0 && (
          <div className="space-y-3 border-l-2 border-[#647C78] pl-3 pt-1">
            <p className="font-mono text-[9px] font-[700] uppercase tracking-[0.1em] text-[#647C78]">
              Destino del remanente ({computed.remainderSource.toFixed(sourceDecimals)} {sourceCurrency})
            </p>
            <SegmentedChoice
              value={state.remainderAction}
              onChange={action => updateState({ remainderAction: action })}
              options={remainderOptions}
            />
            {onReduceAmount && (
              <button
                type="button"
                onClick={() => onReduceAmount(computed.totalAllocatedSource)}
                className="w-full border border-[#1A1A1A] px-2.5 py-2 font-mono text-[9px] font-[700] uppercase tracking-[0.1em] text-noria-text hover:bg-noria-text/5"
              >
                Reducir el envío al monto asignado
              </button>
            )}
            {state.remainderAction && (
              <FormField label="Concepto del remanente" htmlFor={`${idPrefix}-rem-desc`}>
                <TextInput
                  id={`${idPrefix}-rem-desc`}
                  value={state.remainderDescription}
                  onChange={event => updateState({ remainderDescription: event.target.value })}
                  placeholder={state.remainderAction === 'CREATE_RECEIVABLE' ? 'Ej. Saldo a favor' : 'Ej. Diferencia asumida'}
                />
              </FormField>
            )}
            {state.remainderAction === 'PERSONAL_EXPENSE' && (
              <CategorySelect
                id={`${idPrefix}-rem-tag`}
                label="Categoría del gasto personal"
                value={state.remainderTagId}
                onChange={tagId => updateState({ remainderTagId: tagId })}
                tags={tags}
                kind="EXPENSE"
                required
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
