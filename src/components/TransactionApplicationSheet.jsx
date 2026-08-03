import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  APPLICATION_KINDS,
  APPLICATION_TARGETS,
  applyExistingTransaction,
  resolveApplicationEquivalent,
} from '../db/transactionApplications.js';
import { splitExistingTransaction } from '../db/receipts.js';
import { getCurrencyDecimals, roundMoney } from '../utils/moneyAllocation.js';
import CurrencyAmount from './CurrencyAmount.jsx';
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
}) {
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const applications = useLiveQuery(() => db.transaction_applications.toArray()) || [];
  const debts = useLiveQuery(() => db.debts.toArray()) || [];
  const goals = useLiveQuery(() => db.spending_goals.toArray()) || [];
  const currencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const thirdParties = useLiveQuery(() => db.third_parties.toArray()) || [];
  const baseCurrencyConfig = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const baseCurrency = baseCurrencyConfig?.value || '';
  const [transactionId, setTransactionId] = useState('');
  const [targetType, setTargetType] = useState('DEBT');
  const [targetId, setTargetId] = useState('');
  const [manualTargetAmount, setManualTargetAmount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [overpayment, setOverpayment] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setTransactionId(fixedTransaction?.id != null ? String(fixedTransaction.id) : '');
    setTargetType(presetTargetType || 'DEBT');
    setTargetId(presetTargetId != null ? String(presetTargetId) : '');
    setManualTargetAmount('');
    setError('');
    setOverpayment(null);
  }, [isOpen, fixedTransaction?.id, presetTargetType, presetTargetId]);

  const appliedTransactionIds = useMemo(() => new Set(applications.map(application => String(application.transactionId))), [applications]);
  const selectedDebt = debts.find(debt => debt.id === Number(presetTargetType === 'DEBT' ? presetTargetId : targetId));
  const selectedGoal = goals.find(goal => goal.id === Number(presetTargetType === 'SPENDING_GOAL' ? presetTargetId : targetId));
  const selectedTarget = targetType === 'DEBT' ? selectedDebt : selectedGoal;
  const compatibleTransactions = transactions.filter(transaction => {
    if (appliedTransactionIds.has(String(transaction.id))) return false;
    if (transaction.type?.startsWith('TRANSFER_') || ['BALANCE_ADJUSTMENT', 'OPENING_BALANCE'].includes(transaction.type)) return false;
    if (targetType === 'SPENDING_GOAL') return transaction.type === 'OUT';
    if (!selectedDebt) return transaction.type === 'OUT' || transaction.type === 'IN';
    return (selectedDebt.type === 'PAGAR' && transaction.type === 'OUT')
      || (selectedDebt.type === 'COBRAR' && transaction.type === 'IN');
  });
  const selectedTransaction = fixedTransaction || transactions.find(transaction => String(transaction.id) === transactionId);
  const sourceDefinition = currencies.find(currency => currency.code === selectedTransaction?.currency);
  const targetDefinition = currencies.find(currency => currency.code === selectedTarget?.currency);
  const sourceHasBaseEquivalent = (selectedTransaction?.baseCurrency === baseCurrency && Number.isFinite(Number(selectedTransaction?.baseAmount)))
    || selectedTransaction?.currency === baseCurrency
    || sourceDefinition?.baseRelation === 'PARITY';
  const targetUsesBaseEquivalent = selectedTarget?.currency === baseCurrency
    || targetDefinition?.baseRelation === 'PARITY';
  const needsManual = selectedTransaction && selectedTarget
    && selectedTransaction.currency !== selectedTarget.currency
    && selectedTransaction.invoiceCurrency !== selectedTarget.currency
    && !(sourceHasBaseEquivalent && targetUsesBaseEquivalent);

  if (!isOpen) return null;

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');
    if (!selectedTransaction) { setError('Selecciona una transacción.'); return; }
    if (!targetId) { setError('Selecciona un destino.'); return; }
    setSaving(true);
    setOverpayment(null);
    try {
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
      onSaved?.();
      onClose();
    } catch (applyError) {
      if (applyError.code === 'DEBT_OVERPAYMENT' && selectedTransaction.type === 'OUT' && !selectedTransaction.receiptId) {
        try {
          const equivalent = resolveApplicationEquivalent({
            transaction: selectedTransaction,
            targetCurrency: selectedTarget.currency,
            baseCurrency,
            currencies,
            manualTargetAmount: manualTargetAmount ? Number(manualTargetAmount) : null,
          });
          const decimals = getCurrencyDecimals(selectedTransaction.currency, currencies);
          const sourceAmount = roundMoney(
            Number(selectedTransaction.amount) * Number(applyError.remainingAmount) / equivalent.targetAmount,
            decimals
          );
          const excessAmount = roundMoney(Number(selectedTransaction.amount) - sourceAmount, decimals);
          if (sourceAmount > 0 && excessAmount > 0) {
            setOverpayment({ sourceAmount, excessAmount, targetAmount: Number(applyError.remainingAmount) });
          }
        } catch {
          setOverpayment(null);
        }
      }
      setError(applyError.message || 'No se pudo vincular la transacción.');
    } finally {
      setSaving(false);
    }
  };

  const transactionLabel = transaction => `${new Date(transaction.date).toLocaleDateString('es-VE')} · ${transaction.description || 'Sin descripción'} · ${transaction.amount.toFixed?.(2) || transaction.amount} ${transaction.currency}`;
  const handleAssistedSplit = async () => {
    if (!overpayment || !selectedTransaction || !selectedTarget) return;
    setSaving(true);
    setError('');
    try {
      const result = await splitExistingTransaction(db, selectedTransaction.id, [
        {
          amount: overpayment.sourceAmount,
          tagId: selectedTransaction.tagId,
          pillar: selectedTransaction.pillar,
          description: `${selectedTransaction.description || 'Transacción'} (parte para saldar)`,
        },
        {
          amount: overpayment.excessAmount,
          tagId: selectedTransaction.tagId,
          pillar: selectedTransaction.pillar,
          description: `${selectedTransaction.description || 'Transacción'} (excedente)`,
        },
      ]);
      await applyExistingTransaction(db, {
        transactionId: result.transactions[0].id,
        targetType: APPLICATION_TARGETS.DEBT,
        targetId: Number(targetId),
        kind: APPLICATION_KINDS.DEBT_PAYMENT,
        targetAmountOverride: overpayment.targetAmount,
        baseCurrency,
        currencies,
      });
      onSaved?.();
      onClose();
    } catch (splitError) {
      setError(splitError.message || 'No se pudo separar el excedente.');
    } finally {
      setSaving(false);
    }
  };

  const debtLabel = debt => {
    const person = thirdParties.find(item => item.id === debt.thirdPartyId)?.name;
    const remaining = Math.max(0, Number(debt.totalAmount || debt.amount || 0) - (Number(debt.paidAmount) || 0));
    return `${person ? `${person} · ` : ''}${debt.description} · ${remaining.toFixed(2)} ${debt.currency}`;
  };

  return (
    <FormSheet title="Vincular transacción" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {fixedTransaction ? (
          <div className="border border-[#1A1A1A]/30 p-3">
            <p className="text-[13px] font-[600]">{fixedTransaction.description || 'Sin descripción'}</p>
            <CurrencyAmount amount={fixedTransaction.amount} currencyCode={fixedTransaction.currency} className="font-mono text-[12px]" />
          </div>
        ) : (
          <FormField label="Transacción" htmlFor="application-transaction">
            <SelectInput id="application-transaction" value={transactionId} onChange={event => setTransactionId(event.target.value)} required>
              <option value="" disabled>Selecciona...</option>
              {compatibleTransactions.map(transaction => <option key={transaction.id} value={transaction.id}>{transactionLabel(transaction)}</option>)}
            </SelectInput>
          </FormField>
        )}

        {!presetTargetType && (
          <FormField label="Tipo de destino" htmlFor="application-target-type">
            <SelectInput id="application-target-type" value={targetType} onChange={event => { setTargetType(event.target.value); setTargetId(''); }}>
              <option value="DEBT">Deuda</option>
              <option value="SPENDING_GOAL">Objetivo de gasto</option>
            </SelectInput>
          </FormField>
        )}

        {!presetTargetId && targetType === 'DEBT' && (
          <FormField label="Deuda" htmlFor="application-debt">
            <SelectInput id="application-debt" value={targetId} onChange={event => setTargetId(event.target.value)} required>
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
            <SelectInput id="application-goal" value={targetId} onChange={event => setTargetId(event.target.value)} required>
              <option value="" disabled>Selecciona...</option>
              {goals.filter(goal => goal.status !== 'ARCHIVED').map(goal => <option key={goal.id} value={goal.id}>{goal.name} · {goal.currency}</option>)}
            </SelectInput>
          </FormField>
        )}

        {needsManual && (
          <FormField label={`Equivalente (${selectedTarget.currency})`} htmlFor="application-equivalent" hint="La tasa implícita se guardará con ambos montos">
            <NumberInput id="application-equivalent" value={manualTargetAmount} onChange={event => setManualTargetAmount(event.target.value)} step="0.01" required />
          </FormField>
        )}
        {manualTargetAmount && selectedTransaction && (
          <p className="font-mono text-[10px] text-noria-muted">
            Tasa implícita: {(Number(selectedTransaction.amount) / Number(manualTargetAmount)).toFixed(6)} {selectedTransaction.currency}/{selectedTarget?.currency}
          </p>
        )}
        {error && <p className="text-[12px] text-[#9F2F2D]">{error}</p>}
        {overpayment && (
          <div className="border border-[#B8860B] p-3 space-y-2 text-[11px] text-[#8A6508]">
            <p>
              Se puede separar {overpayment.sourceAmount.toFixed(2)} {selectedTransaction.currency} para saldar
              y dejar {overpayment.excessAmount.toFixed(2)} {selectedTransaction.currency} sin destino.
            </p>
            <button type="button" onClick={handleAssistedSplit} className="border border-[#B8860B] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em]">
              Separar y saldar
            </button>
          </div>
        )}
        <FormActions primaryLabel={saving ? 'Vinculando...' : 'Vincular'} />
      </form>
    </FormSheet>
  );
}
