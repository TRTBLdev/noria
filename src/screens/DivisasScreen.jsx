import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import { ChevronUp, ChevronDown, Calculator, Coins, X } from 'lucide-react';

const fmtVES = (n) => {
  if (typeof n !== 'number') return '0,00';
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs';
};

const fmtUSD = (n) => {
  if (typeof n !== 'number') return '0.00';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtRate = (n) => {
  if (typeof n !== 'number') return '0,00';
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' Bs/$';
};

export default function DivisasScreen() {
  const navigate = useNavigate();
  const [historyOpen, setHistoryOpen] = useState(false);

  // Queries
  const activeLots = useLiveQuery(() => db.lots.filter(l => l.remainingAmount > 0).toArray()) || [];
  const exhaustedLots = useLiveQuery(() => db.lots.filter(l => l.remainingAmount === 0).toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const dbCurrencies = useLiveQuery(() => db.currencies.toArray()) || [];

  // Filter for VES lots (which is our main operational currency)
  const activeVESLots = activeLots.filter(l => l.currency === 'VES');
  const exhaustedVESLots = exhaustedLots.filter(l => l.currency === 'VES');

  // Compute metrics
  const totalVESRemaining = activeVESLots.reduce((sum, l) => sum + l.remainingAmount, 0);
  const totalUSDValue = activeVESLots.reduce((sum, l) => sum + (l.remainingAmount / l.effectiveRate), 0);
  const averageWeightedRate = totalUSDValue > 0 ? (totalVESRemaining / totalUSDValue) : 0;



  return (
    <div className="min-h-screen pb-24 pt-16" style={{ background: '#F5F2ED' }}>
      <Header title="Divisas" />

      <main className="mx-auto max-w-md px-6 space-y-6">
        {/* -- RESUMEN TÉCNICO DE LOTES -- */}
        <section className="pt-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-noria-muted mb-2">Resumen Global VES</p>
          <div className="grid grid-cols-1 gap-3">
            {/* Card Principal: Saldo en VES */}
            <div className="border-2 border-[#1A1A1A] p-5 bg-transparent flex flex-col justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-noria-muted">Saldo Disponible en Lotes</span>
              <span className="text-[28px] font-[700] text-[#1A1A1A] tracking-tight mt-1">
                {fmtVES(totalVESRemaining)}
              </span>
              <div className="flex justify-between items-baseline border-t border-[rgba(26,26,26,0.12)] pt-3 mt-3">
                <span className="font-mono text-[9px] uppercase text-noria-muted">Equivalente USD</span>
                <span className="text-[15px] font-mono font-[700] text-[#647C78]">
                  {fmtUSD(totalUSDValue)}
                </span>
              </div>
            </div>

            {/* Card Secundario: Tasa Promedio Ponderada */}
            <div className="border border-[#1A1A1A]/16 p-4 bg-transparent flex justify-between items-center">
              <div>
                <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-noria-muted">Tasa Promedio</span>
                <span className="text-[16px] font-[600] text-[#1A1A1A] mt-0.5 block">
                  {averageWeightedRate > 0 ? fmtRate(averageWeightedRate) : '---'}
                </span>
              </div>
              <div className="text-right">
                <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-noria-muted">Lotes Activos</span>
                <span className="text-[16px] font-mono font-[700] text-[#1A1A1A] mt-0.5 block">
                  {activeVESLots.length}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* -- LOTES ACTIVOS -- */}
        <section className="space-y-4">
          <div className="border-b border-[#1A1A1A] pb-2 flex justify-between items-baseline">
            <h3 className="text-[17px] font-[600] text-noria-text">Lotes Activos</h3>
            <span className="font-mono text-[10px] uppercase text-noria-muted">
              FIFO (Más antiguos primero)
            </span>
          </div>

          {activeVESLots.length === 0 ? (
            <div className="border border-dashed border-[#1A1A1A]/16 py-10 text-center">
              <Coins size={24} className="mx-auto text-noria-muted opacity-40 mb-2" />
              <p className="text-[12px] text-noria-muted">No hay lotes de bolívares activos.</p>
              <p className="text-[10px] font-mono uppercase text-noria-muted mt-1">Registra una transferencia multimoneda para generar uno.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeVESLots.map((lot, idx) => {
                const dateStr = lot.date 
                  ? new Date(lot.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
                  : 'N/A';
                const originalCostUSD = lot.amount / lot.effectiveRate;
                const remainingCostUSD = lot.remainingAmount / lot.effectiveRate;

                // Find associated transaction/account description if possible
                const sourceTx = transactions.find(t => t.id === lot.transactionId);
                const sourceAcc = accounts.find(a => a.id === lot.accountId);

                return (
                  <div key={lot.id} className="border border-[#1A1A1A]/16 p-3 space-y-2.5 bg-transparent">
                    {/* Header del lote */}
                    <div className="flex justify-between items-baseline">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[9px] font-[700] bg-[#1A1A1A] text-[#F5F2ED] px-1 py-0.5">
                          LOTE #{idx + 1}
                        </span>
                        <span className="font-mono text-[10px] text-noria-muted">
                          {dateStr}
                        </span>
                      </div>
                      <span className="text-[12px] font-mono font-[700] text-[#647C78]">
                        {fmtRate(lot.effectiveRate)}
                      </span>
                    </div>

                    {/* Contenido / Balance */}
                    <div className="grid grid-cols-2 gap-3 border-t border-[rgba(26,26,26,0.06)] pt-2.5">
                      <div>
                        <span className="block font-mono text-[8px] uppercase text-noria-muted">Remanente</span>
                        <span className="text-[14px] font-[600] text-noria-text">
                          {fmtVES(lot.remainingAmount)}
                        </span>
                        <span className="block font-mono text-[9px] text-noria-muted">
                          de {fmtVES(lot.amount)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block font-mono text-[8px] uppercase text-noria-muted">Valor USD</span>
                        <span className="text-[14px] font-mono font-[700] text-[#1A1A1A]">
                          {fmtUSD(remainingCostUSD)}
                        </span>
                        <span className="block font-mono text-[9px] text-noria-muted">
                          de {fmtUSD(originalCostUSD)}
                        </span>
                      </div>
                    </div>

                    {/* Origen del Lote */}
                    {sourceAcc && (
                      <div className="bg-[rgba(26,26,26,0.02)] p-2 text-[10px] text-noria-muted border-t border-[rgba(26,26,26,0.04)] font-mono uppercase">
                        Destino: {sourceAcc.name} {sourceTx?.description ? `· ${sourceTx.description}` : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* -- HISTORIAL DE LOTES CONSUMIDOS -- */}
        <section className="pt-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex w-full items-center justify-between border-b border-[#1A1A1A] py-3 text-left focus:outline-none"
          >
            <h3 className="text-[17px] font-[600] text-noria-text">Historial de Lotes</h3>
            <span className="h-8 w-8 border border-[#1A1A1A] flex items-center justify-center">
              {historyOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          </button>

          {historyOpen && (
            <div className="pt-3 space-y-2 animate-fade-in">
              {exhaustedVESLots.length === 0 ? (
                <p className="text-[11px] text-noria-muted text-center py-6">
                  No hay lotes agotados en el historial.
                </p>
              ) : (
                <div className="divide-y divide-[rgba(26,26,26,0.12)]">
                  {exhaustedVESLots.map((lot) => {
                    const dateStr = lot.date 
                      ? new Date(lot.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).toUpperCase()
                      : 'N/A';
                    return (
                      <div key={lot.id} className="py-2.5 flex justify-between items-center text-[13px]">
                        <div>
                          <p className="font-[600] text-noria-text">
                            Lote Agotado ({fmtVES(lot.amount)})
                          </p>
                          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-noria-muted mt-0.5">
                            Adquirido el {dateStr}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-[700] text-noria-text">
                            {fmtRate(lot.effectiveRate)}
                          </p>
                          <p className="font-mono text-[9px] uppercase text-noria-muted mt-0.5">
                            {fmtUSD(lot.amount / lot.effectiveRate)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
