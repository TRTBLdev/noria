import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import TransactionsSection from '../components/TransactionsSection.jsx';
import FAB from '../components/FAB.jsx';

export default function TransactionsScreen() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const incomeSources = useLiveQuery(() => db.income_sources.toArray()) || [];
  const incomeTypes = useLiveQuery(() => db.income_types.toArray()) || [];

  const handleDeleteTransaction = async (tx) => {
    if (!confirm('Seguro que deseas eliminar esta transaccion permanentemente? Se revertira su impacto en los balances.')) return;
    try {
      await db.transaction('rw', [db.accounts, db.transactions, db.anchors], async () => {
        if (tx.type === 'IN') {
          const acc = await db.accounts.get(tx.accountId);
          if (acc) await db.accounts.update(tx.accountId, { balance: acc.balance - tx.amount });
        } else if (tx.type === 'OUT') {
          const acc = await db.accounts.get(tx.accountId);
          if (acc) await db.accounts.update(tx.accountId, { balance: acc.balance + tx.amount });
        } else if (tx.type === 'TRANSFER_OUT' || tx.type === 'TRANSFER_IN') {
          const linkedTxs = await db.transactions.where('transferId').equals(tx.transferId).toArray();
          for (const ltx of linkedTxs) {
            const acc = await db.accounts.get(ltx.accountId);
            if (acc) {
              const delta = ltx.type === 'TRANSFER_OUT' ? ltx.amount : -ltx.amount;
              await db.accounts.update(ltx.accountId, { balance: acc.balance + delta });
            }
            await db.transactions.delete(ltx.id);
          }
          return;
        }

        if (tx.anchorId) {
          await db.anchors.update(tx.anchorId, { status: 'PENDING' });
        } else if (tx.description && tx.description.startsWith('Ancla: ')) {
          const anchorName = tx.description.replace('Ancla: ', '');
          const matchingAnchor = await db.anchors.where('name').equals(anchorName).first();
          if (matchingAnchor) await db.anchors.update(matchingAnchor.id, { status: 'PENDING' });
        }

        await db.transactions.delete(tx.id);
      });
    } catch {
      alert('Error al revertir la transaccion');
    }
  };

  const handleUpdateTransaction = async (txId, updatedFields) => {
    try {
      await db.transaction('rw', [db.accounts, db.transactions], async () => {
        const originalTx = await db.transactions.get(txId);
        if (!originalTx) return;

        if (updatedFields.amount !== undefined && updatedFields.amount !== originalTx.amount) {
          const acc = await db.accounts.get(originalTx.accountId);
          if (acc) {
            const diff = updatedFields.amount - originalTx.amount;
            const delta = originalTx.type === 'OUT' ? -diff : diff;
            await db.accounts.update(originalTx.accountId, { balance: acc.balance + delta });
          }
        }

        await db.transactions.update(txId, updatedFields);
      });
    } catch {
      alert('Error al actualizar la transaccion');
    }
  };

  return (
    <div className="min-h-screen pb-32 pt-16" style={{ background: '#F5F2ED' }}>
      <div className="w-full max-w-md mx-auto px-6">
        <Header title="Transacciones" showBack={true} backRoute="/budget" />
        <section className="py-5">
          <TransactionsSection
            transactions={transactions}
            accounts={accounts}
            tags={tags}
            incomeSources={incomeSources}
            incomeTypes={incomeTypes}
            onDeleteTransaction={handleDeleteTransaction}
            onUpdateTransaction={handleUpdateTransaction}
          />
        </section>
      </div>
      <BottomNav />
      <FAB />
    </div>
  );
}
