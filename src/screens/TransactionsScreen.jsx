import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import TransactionsSection from '../components/TransactionsSection.jsx';
import FAB from '../components/FAB.jsx';
import { deleteTransactionSafely, updateTransactionSafely } from '../db/transactionSafety.js';

export default function TransactionsScreen() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const incomeSources = useLiveQuery(() => db.income_sources.toArray()) || [];
  const incomeTypes = useLiveQuery(() => db.income_types.toArray()) || [];

  const handleDeleteTransaction = async (tx) => {
    if (!confirm('Seguro que deseas eliminar esta transaccion permanentemente? Se revertira su impacto en los balances.')) return;
    try {
      await deleteTransactionSafely(db, tx);
    } catch (err) {
      alert(err.message || 'Error al revertir la transaccion');
    }
  };

  const handleUpdateTransaction = async (txId, updatedFields) => {
    try {
      await updateTransactionSafely(db, txId, updatedFields);
    } catch (err) {
      alert(err.message || 'Error al actualizar la transaccion');
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
