import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import Header from '../components/Header.jsx';
import BottomNav from '../components/BottomNav.jsx';
import FAB from '../components/FAB.jsx';
import CurrencyAmount from '../components/CurrencyAmount.jsx';
import { Coins, ChevronDown, ChevronUp } from 'lucide-react';
import { createCurrencyLot, LOT_EPSILON } from '../db/currencyLots.js';

const formatRate = (value, lotCurrency, baseCurrency) => (
  `${Number(value || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${lotCurrency}/${baseCurrency}`
);

const LOT_SOURCE_LABELS = {
  OPENING_BALANCE: 'Saldo inicial',
  LOT_ACTIVATION: 'Activación de lotes',
  TRANSFER: 'Transferencia',
  SAVINGS_TRANSFER: 'Transferencia de ahorro',
  LOAN: 'Préstamo recibido',
  DEBT_PAYMENT: 'Pago o cobro de deuda',
  INCOME: 'Ingreso',
  BALANCE_ADJUSTMENT: 'Conciliación',
};

const getLotSourceLabel = (lot) => LOT_SOURCE_LABELS[lot.sourceType] || 'Movimiento';

const formatLotDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleDateString('es-ES');
};

export default function DivisasScreen() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activationCurrency, setActivationCurrency] = useState('');
  const [openingCosts, setOpeningCosts] = useState({});
  const [activationError, setActivationError] = useState('');
  const [saving, setSaving] = useState(false);

  const lots = useLiveQuery(() => db.lots.toArray()) || [];
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const currencies = useLiveQuery(() => db.currencies.orderBy('code').toArray()) || [];
  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const lotCurrencyObj = useLiveQuery(() => db.app_config.get('lotCurrency'));
  const baseCurrency = baseCurrencyObj?.value || '';
  const lotCurrency = lotCurrencyObj?.value || '';
  const activationOptions = currencies.filter(currency => currency.isActive && currency.code !== baseCurrency);

  useEffect(() => {
    if (!activationCurrency && activationOptions.length > 0) setActivationCurrency(activationOptions[0].code);
  }, [activationCurrency, activationOptions]);

  const activationAccounts = accounts.filter(account => !account.isArchived && account.currency === activationCurrency);

  const activateLots = async (event) => {
    event.preventDefault();
    setActivationError('');
    if (!activationCurrency) return setActivationError('Selecciona una divisa.');
    if (activationAccounts.some(account => account.balance < -LOT_EPSILON)) {
      return setActivationError('No se pueden activar lotes mientras exista una cuenta con saldo negativo.');
    }
    const positiveAccounts = activationAccounts.filter(account => account.balance > LOT_EPSILON);
    const entries = positiveAccounts.map(account => ({ account, cost: Number(openingCosts[account.id]) }));
    if (entries.some(entry => !Number.isFinite(entry.cost) || entry.cost <= 0)) {
      return setActivationError(`Indica el costo en ${baseCurrency} de cada saldo actual.`);
    }

    setSaving(true);
    try {
      await db.transaction('rw', [db.app_config, db.lots, db.currencies], async () => {
        for (const { account, cost } of entries) {
          await createCurrencyLot(db, {
            accountId: account.id,
            currency: activationCurrency,
            amount: account.balance,
            costCurrency: baseCurrency,
            costAmount: cost,
            date: new Date(),
            sourceType: 'LOT_ACTIVATION',
          });
        }
        await db.app_config.put({ key: 'lotCurrency', value: activationCurrency });
        await db.app_config.put({ key: 'lotTrackingActivatedAt', value: new Date().toISOString() });
        const currency = await db.currencies.where('code').equals(activationCurrency).first();
        if (currency) await db.currencies.update(currency.id, { baseRelation: 'LOTS', unitsPerBase: undefined });
      });
    } catch (error) {
      setActivationError(error.message || 'No se pudo activar el seguimiento.');
    } finally {
      setSaving(false);
    }
  };

  if (!lotCurrency) {
    return (
      <div className="min-h-screen pb-24 pt-16" style={{ background: '#F5F2ED' }}>
        <Header title="Divisas" />
        <main className="mx-auto max-w-md px-6 pt-6 space-y-5">
          <section className="border-2 border-[#1A1A1A] p-5 space-y-3">
            <Coins size={24} className="text-noria-muted" />
            <h2 className="text-[18px] font-[600] text-noria-text">Seguimiento por lotes desactivado</h2>
            <p className="text-[12px] leading-relaxed text-noria-muted">
              Tus cuentas siguen funcionando. Las divisas con paridad declarada frente a {baseCurrency} sí forman parte de los totales; solo se separan las que no tienen conversión.
            </p>
            <p className="text-[11px] leading-relaxed text-noria-muted">
              Puedes activar lotes una sola vez. La divisa elegida quedará fija para esta base de datos.
            </p>
          </section>

          <form onSubmit={activateLots} className="border border-[#1A1A1A]/20 p-4 space-y-4">
            <div>
              <label className="muji-header block mb-1">Divisa para lotes</label>
              <select value={activationCurrency} onChange={event => { setActivationCurrency(event.target.value); setOpeningCosts({}); }} className="muji-input" disabled={saving}>
                {activationOptions.map(currency => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}
              </select>
              {activationOptions.length === 0 && <p className="mt-2 text-[10px] text-noria-amber">Añade en Configuración una divisa activa distinta de {baseCurrency}.</p>}
            </div>

            {activationAccounts.filter(account => account.balance > LOT_EPSILON).map(account => (
              <div key={account.id} className="border-t border-[#1A1A1A]/10 pt-3">
                <p className="text-[12px] font-[600]">{account.name}</p>
                <p className="text-[10px] text-noria-muted mb-2">Saldo: <CurrencyAmount amount={account.balance} currencyCode={activationCurrency} /></p>
                <label className="muji-header block">Costo total en {baseCurrency}</label>
                <input type="number" min="0" step="any" value={openingCosts[account.id] || ''} onChange={event => setOpeningCosts(previous => ({ ...previous, [account.id]: event.target.value }))} className="muji-input" placeholder="0.00" required />
              </div>
            ))}

            {activationError && <p className="text-[11px] text-[#9F2F2D]">{activationError}</p>}
            <button type="submit" disabled={saving || activationOptions.length === 0} className="w-full border border-[#1A1A1A] py-3 font-mono text-[10px] font-bold uppercase tracking-wider disabled:opacity-30">
              {saving ? 'Activando...' : 'Activar seguimiento'}
            </button>
          </form>
        </main>
        <FAB />
        <BottomNav />
      </div>
    );
  }

  const currencyLots = lots.filter(lot => lot.currency === lotCurrency);
  const activeLots = currencyLots.filter(lot => lot.remainingAmount > LOT_EPSILON);
  const exhaustedLots = currencyLots.filter(lot => lot.remainingAmount <= LOT_EPSILON);
  const totalRemaining = activeLots.reduce((sum, lot) => sum + lot.remainingAmount, 0);
  const totalBaseCost = activeLots.reduce((sum, lot) => sum + (lot.remainingCostAmount || 0), 0);
  const averageRate = totalBaseCost > 0 ? totalRemaining / totalBaseCost : 0;
  const trackedAccounts = accounts.filter(account => !account.isArchived && account.currency === lotCurrency);
  const reconciliation = trackedAccounts.map(account => {
    const lotBalance = activeLots.filter(lot => lot.accountId === account.id).reduce((sum, lot) => sum + lot.remainingAmount, 0);
    return { account, lotBalance, difference: lotBalance - account.balance };
  });
  const reconciled = reconciliation.every(item => Math.abs(item.difference) <= LOT_EPSILON);
  const getLotAccountName = (lot) => accounts.find(account => account.id === lot.accountId)?.name || 'Cuenta no disponible';

  return (
    <div className="min-h-screen pb-24 pt-16" style={{ background: '#F5F2ED' }}>
      <Header title="Divisas" />
      <main className="mx-auto max-w-md px-6 space-y-6 pt-4">
        <section>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-noria-muted mb-2">Resumen global {lotCurrency}</p>
          <div className="border-2 border-[#1A1A1A] p-5">
            <span className="font-mono text-[9px] uppercase text-noria-muted">Saldo disponible en lotes</span>
            <CurrencyAmount amount={totalRemaining} currencyCode={lotCurrency} className="block text-[28px] font-[600]" />
            <div className="flex justify-between border-t border-[#1A1A1A]/15 mt-3 pt-3 text-[11px]">
              <span>Costo restante</span>
              <CurrencyAmount amount={totalBaseCost} currencyCode={baseCurrency} />
            </div>
            <div className="flex justify-between mt-2 text-[11px]">
              <span>Tasa promedio</span><span>{averageRate ? formatRate(averageRate, lotCurrency, baseCurrency) : '—'}</span>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex justify-between border-b border-[#1A1A1A] pb-2">
            <h3 className="text-[17px] font-[600]">Conciliación</h3>
            <span className={`font-mono text-[9px] font-bold uppercase ${reconciled ? 'text-[#4F8F58]' : 'text-[#9F2F2D]'}`}>{reconciled ? 'Conciliado' : 'Diferencia'}</span>
          </div>
          {reconciliation.map(({ account, lotBalance, difference }) => (
            <div key={account.id} className="border border-[#1A1A1A]/15 p-3 text-[10px] font-mono">
              <div className="flex justify-between"><strong>{account.name}</strong><CurrencyAmount amount={difference} currencyCode={lotCurrency} /></div>
              <div className="flex justify-between text-noria-muted mt-2"><span>Cuenta: <CurrencyAmount amount={account.balance} currencyCode={lotCurrency} /></span><span>Lotes: <CurrencyAmount amount={lotBalance} currencyCode={lotCurrency} /></span></div>
            </div>
          ))}
          {!reconciled && <p className="border border-[#9F2F2D] p-3 text-[10px] text-[#9F2F2D]">No registres salidas en {lotCurrency} hasta conciliar la diferencia.</p>}
        </section>

        <section className="space-y-3">
          <h3 className="border-b border-[#1A1A1A] pb-2 text-[17px] font-[600]">Lotes activos</h3>
          {activeLots.length === 0 && <p className="border border-dashed border-[#1A1A1A]/15 py-8 text-center text-[11px] text-noria-muted">No hay lotes activos.</p>}
          {activeLots.map(lot => (
            <div key={lot.id} className="border border-[#1A1A1A]/15 p-4 text-[11px]">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <strong>{getLotSourceLabel(lot)}</strong>
                  <p className="mt-0.5 truncate text-[10px] text-noria-muted">{getLotAccountName(lot)}</p>
                </div>
                <span className="shrink-0">{formatLotDate(lot.date)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 font-mono">
                <span>Disponible<br /><CurrencyAmount amount={lot.remainingAmount} currencyCode={lotCurrency} /></span>
                <span className="text-right">Costo restante<br /><CurrencyAmount amount={lot.remainingCostAmount} currencyCode={lot.costCurrency} /></span>
              </div>
              <p className="mt-2 text-noria-muted">{formatRate(lot.effectiveRate, lotCurrency, lot.costCurrency)}</p>
            </div>
          ))}
        </section>

        <section>
          <button type="button" onClick={() => setHistoryOpen(open => !open)} className="flex w-full justify-between border-b border-[#1A1A1A] pb-2 text-left">
            <span className="text-[15px] font-[600]">Historial agotado ({exhaustedLots.length})</span>
            {historyOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {historyOpen && exhaustedLots.map(lot => (
            <div key={lot.id} className="border-b border-[#1A1A1A]/10 py-3 text-[10px]">
              <div className="flex justify-between gap-3">
                <strong>{getLotSourceLabel(lot)}</strong>
                <span>{formatLotDate(lot.date)}</span>
              </div>
              <div className="mt-1 flex justify-between gap-3 font-mono text-noria-muted">
                <span className="truncate">{getLotAccountName(lot)}</span>
                <CurrencyAmount amount={lot.costAmount} currencyCode={lot.costCurrency} />
              </div>
            </div>
          ))}
        </section>
      </main>
      <FAB />
      <BottomNav />
    </div>
  );
}
