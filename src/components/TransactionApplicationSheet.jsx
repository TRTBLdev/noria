import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  APPLICATION_KINDS,
  APPLICATION_TARGETS,
  applyExistingTransaction,
  applyTransactionToMultipleDebts,
} from '../db/transactionApplications.js';
import { buildMultiDebtDestination } from '../utils/debtAllocation.js';
import CurrencyAmount from './CurrencyAmount.jsx';
import MultiDebtAllocationPanel, { createEmptyMultiDebtState } from './MultiDebtAllocationPanel.jsx';
import {
  FormActions,
  FormField,
  FormSheet,
  NumberInput,
  SelectInput,
} from './FormSystem.jsx';

export default function TransactionApplicationSheet({
  isOpen,
  onClose,
  onSaved,
  transaction: fixedTransaction = null,
  presetTargetType = null,
  presetTargetId = null,
  editMode = false,
}) {
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const applications = useLiveQuery(() => db.transaction_applications.toArray()) || [];
  const debts = useLiveQuery(() => db.debts.toArray()) || [];
  const goals = useLiveQuery(() => db.spending_goals.toArray()) || [];
  const currencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const anchors = useLiveQuery(() => db.anchors.toArray()) || [];
  const thirdParties = useLiveQuery(() => db.third_parties.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const baseCurrencyConfig = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const baseCurrency = baseCurrencyConfig?.value || '';

  const [transactionId, setTransactionId] = useState('');
  const [targetType, setTargetType] = useState('DEBT');
  const [targetId, setTargetId] = useState('');
  const [selectedThirdPartyId, setSelectedThirdPartyId] = useState('');
  const [multiDebtState, setMultiDebtState] = useState(createEmptyMultiDebtState);
  const [manualTargetAmount, setManualTargetAmount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedTransaction = fixedTransaction || transactions.find(transaction => String(transaction.id) === transactionId);
  const isOutgoingDebtMode = targetType === 'DEBT' && selectedTransaction?.type === 'OUT';

  useEffect(() => {
    if (!isOpen) return;
    setTransactionId(fixedTransaction?.id != null ? String(fixedTransaction.id) : '');
    setTargetType(presetTargetType || 'DEBT');
    setTargetId(presetTargetId != null ? String(presetTargetId) : '');
    setManualTargetAmount('');
    setError('');

    if (fixedTransaction && (presetTargetType || 'DEBT') === 'DEBT' && fixedTransaction.type === 'OUT') {
      const txApps = applications.filter(app => app.transactionId === fixedTransaction.id);
      const paymentApps = txApps.filter(app => app.kind === APPLICATION_KINDS.DEBT_PAYMENT);
      const originApp = txApps.find(app => app.kind === APPLICATION_KINDS.DEBT_ORIGIN);
      const firstDebt = paymentApps[0] ? debts.find(d => d.id === paymentApps[0].targetId) : (presetTargetId ? debts.find(d => d.id === Number(presetTargetId)) : null);
      const resolvedTp = fixedTransaction.beneficiaryThirdPartyId
        || firstDebt?.thirdPartyId
        || fixedTransaction.thirdPartyId
        || '';
      setSelectedThirdPartyId(resolvedTp ? String(resolvedTp) : '');

      if (editMode && paymentApps.length > 0) {
        const manualRows = {};
        const selectedDebtIds = [];
        for (const app of paymentApps) {
          selectedDebtIds.push(app.targetId);
          manualRows[app.targetId] = {
            sourceAmount: String(app.sourceAmount),
            targetAmount: String(app.targetAmount),
            appliedRate: app.appliedRate ? String(app.appliedRate) : '',
            isManual: true,
          };
        }
        setMultiDebtState(createEmptyMultiDebtState({
          selectedDebtIds,
          manualRows,
          remainderAction: originApp ? 'CREATE_RECEIVABLE' : '',
        }));
      } else if (presetTargetId) {
        setMultiDebtState(createEmptyMultiDebtState({ selectedDebtIds: [Number(presetTargetId)] }));
      } else {
        setMultiDebtState(createEmptyMultiDebtState());
      }
    } else {
      const presetDebt = presetTargetId ? debts.find(d => d.id === Number(presetTargetId)) : null;
      setSelectedThirdPartyId(presetDebt?.thirdPartyId ? String(presetDebt.thirdPartyId) : '');
      setMultiDebtState(presetTargetId ? createEmptyMultiDebtState({ selectedDebtIds: [Number(presetTargetId)] }) : createEmptyMultiDebtState());
    }
  }, [isOpen, fixedTransaction?.id, presetTargetType, presetTargetId, editMode]);

  const appliedTransactionIds = useMemo(
    () => new Set(applications.map(application => String(application.transactionId))),
    [applications]
  );

  const selectedDebt = debts.find(debt => debt.id === Number(presetTargetType === 'DEBT' ? presetTargetId : targetId));
  const selectedGoal = goals.find(goal => goal.id === Number(presetTargetType === 'SPENDING_GOAL' ? presetTargetId : targetId));
  const selectedTarget = targetType === 'DEBT' ? selectedDebt : selectedGoal;

  const pendingAnchor = useMemo(() => {
    if (!selectedDebt?.isRecurring) return null;
    return anchors
      .filter(a => a.debtId === selectedDebt.id && a.status === 'PENDING')
      .sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0))[0] ?? null;
  }, [anchors, selectedDebt]);

  const debtRemaining = useMemo(() => {
    if (!selectedDebt) return null;
    const paid = applications
      .filter(a => a.targetType === 'DEBT' && a.targetId === selectedDebt.id && a.kind === 'DEBT_PAYMENT')
      .reduce((sum, a) => sum + (Number(a.targetAmount) || 0), 0);
    return Math.max(0, Number(selectedDebt.totalAmount || selectedDebt.amount || 0) - paid);
  }, [applications, selectedDebt]);

  const compatibleTransactions = transactions.filter(transaction => {
    if (appliedTransactionIds.has(String(transaction.id))) return false;
    if (transaction.type?.startsWith('TRANSFER_') || ['BALANCE_ADJUSTMENT', 'OPENING_BALANCE'].includes(transaction.type)) return false;
    if (targetType === 'SPENDING_GOAL') return transaction.type === 'OUT';
    if (!selectedDebt) return transaction.type === 'OUT' || transaction.type === 'IN';
    return (selectedDebt.type === 'PAGAR' && transaction.type === 'OUT')
      || (selectedDebt.type === 'COBRAR' && transaction.type === 'IN');
  });

  // Virtual credit when editing an already-linked transaction so its paid amounts reappear as available
  const virtualCreditByDebtId = useMemo(() => {
    if (!editMode || !selectedTransaction) return {};
    const map = {};
    for (const app of applications) {
      if (app.transactionId === selectedTransaction.id && app.targetType === 'DEBT' && app.kind === 'DEBT_PAYMENT') {
        map[app.targetId] = (map[app.targetId] || 0) + (Number(app.targetAmount) || 0);
      }
    }
    return map;
  }, [editMode, selectedTransaction, applications]);

  const effectiveThirdPartyDebts = useMemo(() => {
    const tpId = Number(selectedThirdPartyId);
    if (!tpId) return [];
    return debts
      .filter(debt => debt.type === 'PAGAR' && debt.thirdPartyId === tpId && !['WRITTEN_OFF', 'CANCELLED'].includes(debt.status))
      .map(debt => {
        const credit = virtualCreditByDebtId[debt.id] || 0;
        const total = Number(debt.totalAmount || debt.amount || 0);
        const adjustedPaid = Math.max(0, (Number(debt.paidAmount) || 0) - credit);
        const remaining = Math.max(0, total - adjustedPaid);
        return {
          ...debt,
          paidAmount: adjustedPaid,
          remaining,
          status: remaining > 0.001 ? 'ACTIVE' : debt.status,
        };
      })
      .filter(debt => debt.remaining > 0.001);
  }, [debts, selectedThirdPartyId, virtualCreditByDebtId]);

  const thirdPartiesWithOpenPayables = useMemo(() => {
    const ids = new Set(
      debts
        .filter(d => d.type === 'PAGAR' && !['WRITTEN_OFF', 'CANCELLED'].includes(d.status) && ((d.status !== 'SETTLED') || virtualCreditByDebtId[d.id] > 0))
        .map(d => d.thirdPartyId)
    );
    return thirdParties.filter(tp => ids.has(tp.id));
  }, [debts, thirdParties, virtualCreditByDebtId]);

  const sourceDefinition = currencies.find(currency => currency.code === selectedTransaction?.currency);
  const targetDefinition = currencies.find(currency => currency.code === selectedTarget?.currency);
  const sourceHasBaseEquivalent = (selectedTransaction?.baseCurrency === baseCurrency && Number.isFinite(Number(selectedTransaction?.baseAmount)))
    || selectedTransaction?.currency === baseCurrency
    || sourceDefinition?.baseRelation === 'PARITY';
  const targetUsesBaseEquivalent = selectedTarget?.currency === baseCurrency
    || targetDefinition?.baseRelation === 'PARITY';
  const needsManual = !isOutgoingDebtMode && selectedTransaction && selectedTarget
    && selectedTransaction.currency !== selectedTarget.currency
    && selectedTransaction.invoiceCurrency !== selectedTarget.currency
    && (targetType === 'DEBT' || !(sourceHasBaseEquivalent && targetUsesBaseEquivalent));

  useEffect(() => {
    if (!isOpen || !needsManual || manualTargetAmount) return;
    if (targetType === 'DEBT' && selectedDebt) {
      const suggestedAmount = pendingAnchor ? pendingAnchor.amount : (debtRemaining > 0 ? debtRemaining : null);
      if (suggestedAmount != null && suggestedAmount > 0) {
        setManualTargetAmount(suggestedAmount.toFixed(2));
      }
    }
  }, [isOpen, needsManual, targetType, selectedDebt, pendingAnchor, debtRemaining, manualTargetAmount]);

  if (!isOpen) return null;

  const principalAvailable = selectedTransaction
    ? (Number(selectedTransaction.paymentPrincipalAmount) > 0 ? Number(selectedTransaction.paymentPrincipalAmount) : Number(selectedTransaction.amount))
    : 0;

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');
    if (!selectedTransaction) { setError('Selecciona una transacción.'); return; }
    setSaving(true);
    try {
      if (isOutgoingDebtMode) {
        if (!selectedThirdPartyId) throw new Error('Selecciona la persona titular de las deudas.');
        const destination = buildMultiDebtDestination({
          panelState: multiDebtState,
          availableAmount: principalAvailable,
          sourceCurrency: selectedTransaction.currency,
          openDebts: effectiveThirdPartyDebts,
          currencies,
        });
        await applyTransactionToMultipleDebts(db, {
          transactionId: selectedTransaction.id,
          thirdPartyId: Number(selectedThirdPartyId),
          allocations: destination.allocations,
          remainderAction: destination.remainder?.type || '',
          remainderTagId: destination.remainder?.tagId || null,
          remainderDescription: destination.remainder?.description || '',
          baseCurrency,
          currencies,
        });
      } else {
        if (!targetId) { setError('Selecciona un destino.'); setSaving(false); return; }
        await applyExistingTransaction(db, {
          transactionId: selectedTransaction.id,
          targetType,
          targetId: Number(targetId),
          kind: targetType === APPLICATION_TARGETS.DEBT
            ? APPLICATION_KINDS.DEBT_PAYMENT
            : APPLICATION_KINDS.GOAL_PROGRESS,
          manualTargetAmount: manualTargetAmount ? Number(manualTargetAmount) : null,
          baseCurrency,
          currencies,
        });
      }
      onSaved?.();
      onClose();
    } catch (applyError) {
      setError(applyError.message || 'No se pudo vincular la transacción.');
    } finally {
      setSaving(false);
    }
  };

  const transactionLabel = transaction => `${new Date(transaction.date).toLocaleDateString('es-VE')} · ${transaction.description || 'Sin descripción'} · ${transaction.amount.toFixed?.(2) || transaction.amount} ${transaction.currency}`;

  const debtLabel = debt => {
    const person = thirdParties.find(item => item.id === debt.thirdPartyId)?.name;
    const remaining = Math.max(0, Number(debt.totalAmount || debt.amount || 0) - (Number(debt.paidAmount) || 0));
    return `${person ? `${person} · ` : ''}${debt.description} · ${remaining.toFixed(2)} ${debt.currency}`;
  };

  return (
    <FormSheet title={editMode ? 'Editar reparto en deudas' : 'Vincular transacción'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {fixedTransaction ? (
          <div className="border border-[#1A1A1A]/30 p-3">
            <p className="text-[13px] font-[600]">{fixedTransaction.description || 'Sin descripción'}</p>
            <CurrencyAmount amount={principalAvailable} currencyCode={fixedTransaction.currency} className="font-mono text-[12px]" />
          </div>
        ) : (
          <FormField label="Transacción" htmlFor="application-transaction">
            <SelectInput
              id="application-transaction"
              value={transactionId}
              onChange={event => {
                setTransactionId(event.target.value);
                if (presetTargetId) {
                  setMultiDebtState(createEmptyMultiDebtState({ selectedDebtIds: [Number(presetTargetId)] }));
                }
              }}
              required
            >
              <option value="" disabled>Selecciona...</option>
              {compatibleTransactions.map(transaction => <option key={transaction.id} value={transaction.id}>{transactionLabel(transaction)}</option>)}
            </SelectInput>
          </FormField>
        )}

        {!presetTargetType && !editMode && (
          <FormField label="Tipo de destino" htmlFor="application-target-type">
            <SelectInput id="application-target-type" value={targetType} onChange={event => { setTargetType(event.target.value); setTargetId(''); }}>
              <option value="DEBT">Deuda</option>
              <option value="SPENDING_GOAL">Objetivo de gasto</option>
            </SelectInput>
          </FormField>
        )}

        {isOutgoingDebtMode ? (
          <div className="space-y-3">
            <FormField label="Persona con deudas abiertas" htmlFor="application-third-party">
              <SelectInput
                id="application-third-party"
                value={selectedThirdPartyId}
                onChange={event => {
                  setSelectedThirdPartyId(event.target.value);
                  setMultiDebtState(createEmptyMultiDebtState());
                }}
                required
              >
                <option value="" disabled>Selecciona…</option>
                {thirdPartiesWithOpenPayables.map(tp => (
                  <option key={tp.id} value={tp.id}>{tp.name}</option>
                ))}
              </SelectInput>
            </FormField>
            {selectedThirdPartyId && (
              <MultiDebtAllocationPanel
                idPrefix="sheet-multi"
                availableAmount={principalAvailable}
                sourceCurrency={selectedTransaction.currency}
                openDebts={effectiveThirdPartyDebts}
                value={multiDebtState}
                onChange={setMultiDebtState}
                tags={tags}
                currencies={currencies}
              />
            )}
          </div>
        ) : (
          <>
            {!presetTargetId && targetType === 'DEBT' && (
              <FormField label="Deuda" htmlFor="application-debt">
                <SelectInput id="application-debt" value={targetId} onChange={event => { setTargetId(event.target.value); setManualTargetAmount(''); }} required>
                  <option value="" disabled>Selecciona...</option>
                  {debts.filter(debt => debt.status !== 'SETTLED' && (!selectedTransaction
                    || (debt.type === 'PAGAR' && selectedTransaction.type === 'OUT')
                    || (debt.type === 'COBRAR' && selectedTransaction.type === 'IN')))
                    .map(debt => <option key={debt.id} value={debt.id}>{debtLabel(debt)}</option>)}
                </SelectInput>
              </FormField>
            )}

            {!presetTargetId && targetType === 'SPENDING_GOAL' && (
              <FormField label="Objetivo" htmlFor="application-goal">
                <SelectInput id="application-goal" value={targetId} onChange={event => { setTargetId(event.target.value); setManualTargetAmount(''); }} required>
                  <option value="" disabled>Selecciona...</option>
                  {goals.filter(goal => goal.status !== 'ARCHIVED').map(goal => <option key={goal.id} value={goal.id}>{goal.name} · {goal.currency}</option>)}
                </SelectInput>
              </FormField>
            )}

            {needsManual && (
              <FormField
                label={`Equivalente (${selectedTarget?.currency || ''})`}
                htmlFor="application-equivalent"
                hint={
                  targetType === 'DEBT' && pendingAnchor
                    ? `Sugerido: ${pendingAnchor.installmentNumber === 0 ? 'Inicial' : `Cuota ${pendingAnchor.installmentNumber}`} (${pendingAnchor.amount.toFixed(2)} ${selectedTarget?.currency || ''})`
                    : (targetType === 'DEBT' && debtRemaining != null
                      ? `Sugerido: saldo restante (${debtRemaining.toFixed(2)} ${selectedTarget?.currency || ''})`
                      : 'La tasa implícita se guardará con ambos montos')
                }
              >
                <NumberInput id="application-equivalent" value={manualTargetAmount} onChange={event => setManualTargetAmount(event.target.value)} step="0.01" required />
              </FormField>
            )}
            {manualTargetAmount && selectedTransaction && (
              <p className="font-mono text-[10px] text-noria-muted">
                Tasa implícita: {(Number(selectedTransaction.amount) / Number(manualTargetAmount)).toFixed(6)} {selectedTransaction.currency}/{selectedTarget?.currency}
              </p>
            )}
          </>
        )}

        {error && <p className="text-[12px] text-[#9F2F2D]">{error}</p>}
        <FormActions primaryLabel={saving ? 'Guardando...' : (editMode ? 'Guardar reparto' : 'Vincular')} />
      </form>
    </FormSheet>
  );
}
