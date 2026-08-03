import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { Plus, X, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Calculator, Coins, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CategorySelect from './CategorySelect.jsx';
import IncomeTypeSelect from './IncomeTypeSelect.jsx';
import { getIncomeType } from './IncomeTypeIcon.jsx';
import { consumeCurrencyLots, createCurrencyLot, stringifyLotConsumption } from '../db/currencyLots.js';
import { formatAmountWithSymbol } from '../utils/format.js';
import { convertAmountToBase } from '../utils/currency.js';

const fmt = (n, d = 2) => {
  if (typeof n !== 'number') return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};

const getAccountLabel = (acc, inst) => {
  const typeLabel = {
    CHECKING: 'Corriente',
    SAVINGS: 'Ahorro',
    CREDIT: 'Crédito',
    CASH: 'Efectivo'
  }[acc.type] || acc.type;

  let baseName = '';
  if (inst) {
    if (inst.name.toLowerCase() === acc.name.toLowerCase()) {
      baseName = inst.name;
    } else {
      baseName = `${inst.name} · ${acc.name}`;
    }
  } else {
    baseName = acc.name;
  }

  if (acc.type !== 'CASH') {
    return `${baseName} (${typeLabel})`;
  }
  return baseName;
};

export default function FAB() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [activeForm, setActiveForm] = useState(null); // 'GASTO' | 'INGRESO' | 'TRANSFERENCIA'
  const sheetRef = useRef(null);

  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const institutions = useLiveQuery(() => db.institutions.toArray()) || [];
  const activeAccounts = accounts.filter(a => !a.isArchived);
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const incomeSources = useLiveQuery(() => db.income_sources.toArray()) || [];
  const incomeTypes = useLiveQuery(() => db.income_types.orderBy('name').toArray()) || [];
  const baseCurrencyObj = useLiveQuery(() => db.app_config.get('baseCurrency'));
  const lotCurrencyObj = useLiveQuery(() => db.app_config.get('lotCurrency'));
  const baseCurrency = baseCurrencyObj?.value || '';
  const lotCurrency = lotCurrencyObj?.value || '';
  const thirdParties = useLiveQuery(() => db.third_parties.toArray()) || [];

  const instruments = useLiveQuery(() => db.instruments.toArray()) || [];

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [amount, setAmount] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [tagId, setTagId] = useState('');
  const [description, setDescription] = useState('');
  const [incomeSourceId, setIncomeSourceId] = useState('');
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceIncomeTypeId, setNewSourceIncomeTypeId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [thirdPartyInput, setThirdPartyInput] = useState('');
  const [selectedThirdPartyId, setSelectedThirdPartyId] = useState('');
  const [showThirdPartySuggestions, setShowThirdPartySuggestions] = useState(false);

  const [isSplit, setIsSplit] = useState(false);
  const [splits, setSplits] = useState([{ amount: '', tagId: '', pillar: 'NEED', description: '' }]);

  const [isPersonSplit, setIsPersonSplit] = useState(false);
  const [personSplitMode, setPersonSplitMode] = useState('EQUITATIVO'); // 'EQUITATIVO' | 'MANUAL'
  const [personSplits, setPersonSplits] = useState([{ thirdPartyInput: '', selectedThirdPartyId: '', amount: '' }]);
  const [focusedParticipantIndex, setFocusedParticipantIndex] = useState(null);

  // Calculator states
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const dbCurrencies = useLiveQuery(() => db.currencies.toArray()) || [];
  const activeCurrencies = dbCurrencies.filter(c => c.isActive);

  const [calcCurrencyA, setCalcCurrencyA] = useState('');
  const [calcCurrencyB, setCalcCurrencyB] = useState('');
  const [rate, setRate] = useState('');
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');

  useEffect(() => {
    if (!activeCurrencies.length) return;
    if (!activeCurrencies.some(currency => currency.code === calcCurrencyA)) setCalcCurrencyA(baseCurrency || activeCurrencies[0].code);
    if (!activeCurrencies.some(currency => currency.code === calcCurrencyB)) {
      setCalcCurrencyB(lotCurrency || activeCurrencies.find(currency => currency.code !== baseCurrency)?.code || baseCurrency);
    }
  }, [activeCurrencies, baseCurrency, lotCurrency, calcCurrencyA, calcCurrencyB]);

  // Calculator logic
  const handleAmountAChange = (val, currentRate = rate) => {
    setAmountA(val);
    const parsedAmount = parseFloat(val);
    const parsedRate = parseFloat(currentRate);
    if (!isNaN(parsedAmount) && !isNaN(parsedRate) && parsedRate > 0) {
      setAmountB((parsedAmount * parsedRate).toFixed(2));
    } else {
      setAmountB('');
    }
  };

  const handleAmountBChange = (val, currentRate = rate) => {
    setAmountB(val);
    const parsedAmount = parseFloat(val);
    const parsedRate = parseFloat(currentRate);
    if (!isNaN(parsedAmount) && !isNaN(parsedRate) && parsedRate > 0) {
      setAmountA((parsedAmount / parsedRate).toFixed(2));
    } else {
      setAmountA('');
    }
  };

  const handleRateChangeLocal = (val) => {
    setRate(val);
    if (amountA !== '') {
      handleAmountAChange(amountA, val);
    } else if (amountB !== '') {
      handleAmountBChange(amountB, val);
    }
  };

  const handleSwap = () => {
    const tempCurr = calcCurrencyA;
    setCalcCurrencyA(calcCurrencyB);
    setCalcCurrencyB(tempCurr);

    const tempAmt = amountA;
    setAmountA(amountB);
    setAmountB(tempAmt);

    const parsedRate = parseFloat(rate);
    if (!isNaN(parsedRate) && parsedRate > 0) {
      setRate((1 / parsedRate).toFixed(4));
    } else {
      setRate('');
    }
  };

  const handleClear = () => {
    setAmountA('');
    setAmountB('');
    setRate('');
  };

  const selectedAccount = accounts.find(a => a.id.toString() === accountId);
  const selectedAccountCurrency = selectedAccount?.currency || baseCurrency;

  const INSTRUMENT_TYPES = [
    { value: 'DEBIT_CARD', label: 'Tarjeta de Débito' },
    { value: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
    { value: 'CREDIT_CARD', label: 'Tarjeta de Crédito' },
    { value: 'WIRE_TRANSFER', label: 'Transferencia Bancaria' },
    { value: 'CASH', label: 'Efectivo / Físico' }
  ];

  const getAccountIdFromPaymentMethod = (val) => {
    if (val.startsWith('inst-')) {
      const instId = parseInt(val.replace('inst-', ''));
      const inst = instruments.find(i => i.id === instId);
      return inst ? inst.accountId.toString() : '';
    } else if (val.startsWith('acc-')) {
      return val.replace('acc-', '');
    }
    return '';
  };

  const getDefaultPaymentMethodForAccount = (accId, instList) => {
    if (!accId) return '';
    const accInsts = instList.filter(i => i.accountId.toString() === accId.toString());
    if (accInsts.length > 0) {
      return `inst-${accInsts[0].id}`;
    }
    return `acc-${accId}`;
  };

  // Seed defaults when data loads
  useEffect(() => {
    if (activeAccounts.length > 0) {
      const currentIdStr = accountId || activeAccounts[0].id.toString();
      if (!accountId) {
        setAccountId(currentIdStr);
      }
      if (!selectedPaymentMethod) {
        setSelectedPaymentMethod(getDefaultPaymentMethodForAccount(currentIdStr, instruments));
      }
      // Ensure target account is different
      const otherAcc = activeAccounts.find(a => a.id.toString() !== currentIdStr);
      if (otherAcc && (!toAccountId || toAccountId === currentIdStr)) {
        setToAccountId(otherAcc.id.toString());
      }
    }
    if (incomeSources.length > 0 && !incomeSourceId) setIncomeSourceId(incomeSources[0].id.toString());
    if (incomeTypes.length > 0 && !newSourceIncomeTypeId) setNewSourceIncomeTypeId(incomeTypes[0].id.toString());
  }, [activeAccounts, incomeSources, incomeTypes, accountId, toAccountId, newSourceIncomeTypeId, instruments, selectedPaymentMethod]);

  // Close bottom sheet on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) {
        const fab = document.getElementById('fab-main-btn');
        if (fab && fab.contains(e.target)) return;
        closeSheet();
      }
    };
    if (activeForm) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [activeForm]);

  const resetForm = () => {
    setAmount('');
    setAmountReceived('');
    setExchangeRate('');
    setDescription('');
    setNewSourceName('');
    setNewSourceIncomeTypeId('');
    setTagId('');
    setError('');
    setSuccess(false);
    setThirdPartyInput('');
    setSelectedThirdPartyId('');
    setIsSplit(false);
    setSplits([{ amount: '', tagId: '', pillar: 'NEED', description: '' }]);
    setIsPersonSplit(false);
    setPersonSplitMode('EQUITATIVO');
    setPersonSplits([{ thirdPartyInput: '', selectedThirdPartyId: '', amount: '' }]);
    setFocusedParticipantIndex(null);
    if (activeAccounts.length > 0) {
      const defaultAccId = activeAccounts[0].id.toString();
      setAccountId(defaultAccId);
      setSelectedPaymentMethod(getDefaultPaymentMethodForAccount(defaultAccId, instruments));
      const otherAcc = activeAccounts.find(a => a.id.toString() !== defaultAccId);
      if (otherAcc) {
        setToAccountId(otherAcc.id.toString());
      }
    }
    if (incomeSources.length > 0) setIncomeSourceId(incomeSources[0].id.toString());
    if (incomeTypes.length > 0) setNewSourceIncomeTypeId(incomeTypes[0].id.toString());
    setDate(new Date().toISOString().slice(0, 10));
  };

  const handleSourceAccountChange = (id) => {
    setAccountId(id);
    const sourceAcc = accounts.find(a => a.id.toString() === id);
    const targetAcc = accounts.find(a => a.id.toString() === toAccountId);
    if (sourceAcc && targetAcc) {
      if (sourceAcc.currency === targetAcc.currency) {
        setExchangeRate('1');
        setAmountReceived(amount);
      } else {
        setExchangeRate('');
        setAmountReceived('');
      }
    }
  };

  const handleTargetAccountChange = (id) => {
    setToAccountId(id);
    const sourceAcc = accounts.find(a => a.id.toString() === accountId);
    const targetAcc = accounts.find(a => a.id.toString() === id);
    if (sourceAcc && targetAcc) {
      if (sourceAcc.currency === targetAcc.currency) {
        setExchangeRate('1');
        setAmountReceived(amount);
      } else {
        setExchangeRate('');
        setAmountReceived('');
      }
    }
  };

  const handleAmountChange = (val) => {
    setAmount(val);
    const sourceAcc = accounts.find(a => a.id.toString() === accountId);
    const targetAcc = accounts.find(a => a.id.toString() === toAccountId);
    if (sourceAcc && targetAcc) {
      if (sourceAcc.currency === targetAcc.currency) {
        setAmountReceived(val);
      } else {
        const rate = parseFloat(exchangeRate);
        if (!isNaN(rate) && rate > 0) {
          setAmountReceived((parseFloat(val) * rate).toFixed(2));
        }
      }
    }
  };

  const handleRateChange = (val) => {
    setExchangeRate(val);
    const rate = parseFloat(val);
    const amt = parseFloat(amount);
    if (!isNaN(rate) && !isNaN(amt) && rate > 0) {
      setAmountReceived((amt * rate).toFixed(2));
    }
  };

  const handleAmountReceivedChange = (val) => {
    setAmountReceived(val);
    const sourceAcc = accounts.find(a => a.id.toString() === accountId);
    const targetAcc = accounts.find(a => a.id.toString() === toAccountId);
    if (sourceAcc && targetAcc && sourceAcc.currency !== targetAcc.currency) {
      const amt = parseFloat(amount);
      const rec = parseFloat(val);
      if (!isNaN(amt) && !isNaN(rec) && amt > 0) {
        setExchangeRate((rec / amt).toFixed(4));
      }
    }
  };

  const handleFabClick = () => {
    if (activeForm) { closeSheet(); return; }
    setIsOpen(prev => !prev);
  };

  const openForm = (type) => {
    setIsOpen(false);
    if (type === 'CALCULADORA') {
      setIsCalcOpen(true);
      return;
    }
    if (type === 'SPLIT_CALC') {
      navigate('/transactions/receipt');
      return;
    }
    resetForm();
    setActiveForm(type);
  };

  const closeSheet = () => {
    setActiveForm(null);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('Monto inválido'); return; }
    if (!accountId) { setError('Selecciona una cuenta'); return; }

    try {
      if (activeForm === 'TRANSFERENCIA') {
        if (!toAccountId) { setError('Selecciona la cuenta de destino'); return; }
        if (accountId === toAccountId) { setError('Las cuentas de origen y destino deben ser distintas'); return; }

        const parsedReceived = parseFloat(amountReceived);
        if (isNaN(parsedReceived) || parsedReceived <= 0) { setError('Monto recibido inválido'); return; }

        const sourceAccount = accounts.find(a => a.id.toString() === accountId);
        const targetAccount = accounts.find(a => a.id.toString() === toAccountId);
        if (!sourceAccount || !targetAccount) { setError('Cuentas no encontradas'); return; }

        const transferId = 'TX-' + Date.now();
        const isMultiCurrency = sourceAccount.currency !== targetAccount.currency;

        let lotConsumptions = [];
        let transferBaseAmount = convertAmountToBase(parsedAmount, sourceAccount.currency, baseCurrency, [], dbCurrencies);
        let transferBaseCurrency = transferBaseAmount === null ? null : baseCurrency;

        if (!isMultiCurrency && sourceAccount.currency === lotCurrency && Math.abs(parsedAmount - parsedReceived) > 0.005) {
          setError(`Una transferencia entre cuentas ${lotCurrency} debe conservar el mismo monto.`);
          return;
        }

        await db.transaction('rw', [db.accounts, db.transactions, db.lots], async () => {
          if (sourceAccount.currency === lotCurrency) {
            const consumed = await consumeCurrencyLots(db, { accountId: sourceAccount.id, currency: lotCurrency, amount: parsedAmount });
            lotConsumptions = consumed.consumptions;
            transferBaseAmount = consumed.baseAmount;
            transferBaseCurrency = consumed.baseCurrency;
          }

          // 1. Registrar salida
          const targetBaseAmount = targetAccount.currency === lotCurrency
            ? transferBaseAmount
            : convertAmountToBase(parsedReceived, targetAccount.currency, baseCurrency, [], dbCurrencies);

          await db.transactions.add({
            date: new Date(date + 'T12:00:00'),
            type: 'TRANSFER_OUT',
            amount: parsedAmount,
            currency: sourceAccount.currency,
            accountId: sourceAccount.id,
            description: description.trim() || `Transferencia a ${targetAccount.name}`,
            transferId,
            baseAmount: transferBaseAmount,
            baseCurrency: transferBaseCurrency,
            lotConsumption: stringifyLotConsumption(lotConsumptions),
            targetAmount: parsedReceived,
            targetCurrency: targetAccount.currency,
            targetAccountId: targetAccount.id,
            exchangeRate: isMultiCurrency ? parsedReceived / parsedAmount : 1
          });

          // 2. Registrar entrada
          await db.transactions.add({
            date: new Date(date + 'T12:00:00'),
            type: 'TRANSFER_IN',
            amount: parsedReceived,
            currency: targetAccount.currency,
            accountId: targetAccount.id,
            description: description.trim() || `Transferencia desde ${sourceAccount.name}`,
            transferId,
            baseAmount: targetBaseAmount,
            baseCurrency: targetBaseAmount === null ? null : baseCurrency,
            targetAmount: parsedAmount,
            targetCurrency: sourceAccount.currency,
            targetAccountId: sourceAccount.id,
            exchangeRate: isMultiCurrency ? parsedReceived / parsedAmount : 1
          });

          if (targetAccount.currency === lotCurrency) {
            if (sourceAccount.currency === lotCurrency) {
              for (const consumption of lotConsumptions) {
                await createCurrencyLot(db, {
                  transactionId: transferId,
                  accountId: targetAccount.id,
                  currency: lotCurrency,
                  amount: consumption.amountConsumed,
                  costCurrency: consumption.costCurrency,
                  costAmount: consumption.costConsumed,
                  date: new Date(date + 'T12:00:00'),
                  sourceType: 'TRANSFER',
                });
              }
            } else {
              if (transferBaseAmount === null || transferBaseAmount <= 0) {
                throw new Error(`La divisa ${sourceAccount.currency} no tiene una conversión válida a ${baseCurrency}.`);
              }
              await createCurrencyLot(db, {
                transactionId: transferId,
                accountId: targetAccount.id,
                currency: lotCurrency,
                amount: parsedReceived,
                costCurrency: baseCurrency,
                costAmount: transferBaseAmount,
                date: new Date(date + 'T12:00:00'),
                sourceType: 'TRANSFER',
              });
            }
          }

          // 4. Actualizar balances
          await db.accounts.update(sourceAccount.id, { balance: sourceAccount.balance - parsedAmount });
          await db.accounts.update(targetAccount.id, { balance: targetAccount.balance + parsedReceived });
        });

      } else {
        const selectedAccount = accounts.find(a => a.id.toString() === accountId);
        if (!selectedAccount) { setError('Cuenta no encontrada'); return; }

        let feeAmountVal = 0;
        let selectedInstrumentId = null;
        if (activeForm === 'GASTO' && selectedPaymentMethod) {
          if (selectedPaymentMethod.startsWith('inst-')) {
            selectedInstrumentId = parseInt(selectedPaymentMethod.replace('inst-', ''));
            const inst = instruments.find(i => i.id === selectedInstrumentId);
            if (inst) {
              feeAmountVal = (parsedAmount * (inst.feePercentage || 0) / 100) + (inst.feeFixed || 0);
            }
          }
        }

        let resolvedSourceId = incomeSourceId ? parseInt(incomeSourceId) : null;
        if (activeForm === 'INGRESO' && (incomeSourceId === 'new' || newSourceName.trim())) {
          const nameToUse = newSourceName.trim();
          const existing = incomeSources.find(s => s.name.toLowerCase() === nameToUse.toLowerCase());
          const selectedIncomeType = incomeTypes.find(type => type.id.toString() === newSourceIncomeTypeId) || incomeTypes[0] || null;
          resolvedSourceId = existing
            ? existing.id
            : await db.income_sources.add({
              name: nameToUse,
              type: selectedIncomeType?.legacyKey || 'OTHER',
              incomeTypeId: selectedIncomeType?.id || null,
              tagId: null,
              isActive: true
            });
        }

        let lotConsumptions = [];
        const amountWithFee = activeForm === 'GASTO' ? parsedAmount + feeAmountVal : parsedAmount;
        let baseAmount = convertAmountToBase(amountWithFee, selectedAccount.currency, baseCurrency, [], dbCurrencies);
        let transactionBaseCurrency = baseAmount === null ? null : baseCurrency;
        const transactionId = 'TX-' + Date.now();

        let parsedRate = null;
        if (activeForm === 'INGRESO' && selectedAccount.currency === lotCurrency) {
          parsedRate = parseFloat(exchangeRate);
          if (isNaN(parsedRate) || parsedRate <= 0) {
            setError(`Ingresa una tasa ${lotCurrency}/${baseCurrency} válida.`);
            return;
          }
          baseAmount = parseFloat((parsedAmount / parsedRate).toFixed(6));
          transactionBaseCurrency = baseCurrency;
        }

        await db.transaction('rw', [db.accounts, db.transactions, db.lots, db.third_parties, db.debts, db.debt_payments], async () => {
          if (activeForm === 'GASTO' && selectedAccount.currency === lotCurrency) {
            const consumed = await consumeCurrencyLots(db, {
              accountId: selectedAccount.id,
              currency: lotCurrency,
              amount: parsedAmount + feeAmountVal,
            });
            lotConsumptions = consumed.consumptions;
            baseAmount = consumed.baseAmount;
            transactionBaseCurrency = consumed.baseCurrency;
          }

          // Resolviendo el Tercero (Comercio)
          let resolvedThirdPartyId = selectedThirdPartyId ? parseInt(selectedThirdPartyId) : null;
          if (thirdPartyInput.trim()) {
            const match = thirdParties.find(tp => tp.name.toLowerCase() === thirdPartyInput.trim().toLowerCase());
            if (match) {
              resolvedThirdPartyId = match.id;
            } else {
              resolvedThirdPartyId = await db.third_parties.add({ name: thirdPartyInput.trim() });
            }
          }

          // Los movimientos divididos se registran en el motor unificado.
          const totalAmountToSave = activeForm === 'GASTO' ? (parsedAmount + feeAmountVal) : parsedAmount;
          const selectedTag = tags.find(t => t.id === parseInt(tagId));
          const resolvedPillar = selectedTag?.pillar || 'NEED';
          await db.transactions.add({
            id: transactionId,
            date: new Date(date + 'T12:00:00'),
            type: activeForm === 'GASTO' ? 'OUT' : 'IN',
            amount: totalAmountToSave,
            fee: activeForm === 'GASTO' ? feeAmountVal : undefined,
            currency: selectedAccount.currency,
            accountId: parseInt(accountId),
            tagId: activeForm === 'GASTO' && tagId ? parseInt(tagId) : null,
            pillar: activeForm === 'GASTO' ? resolvedPillar : null,
            incomeSourceId: activeForm === 'INGRESO' ? resolvedSourceId : null,
            description: description.trim(),
            baseAmount,
            baseCurrency: transactionBaseCurrency,
            lotConsumption: lotConsumptions.length > 0 ? JSON.stringify(lotConsumptions) : null,
            thirdPartyId: resolvedThirdPartyId,
            instrumentId: selectedInstrumentId
          });

          if (activeForm === 'INGRESO' && selectedAccount.currency === lotCurrency && parsedRate) {
            await createCurrencyLot(db, {
              transactionId,
              accountId: selectedAccount.id,
              currency: lotCurrency,
              amount: parsedAmount,
              costCurrency: baseCurrency,
              costAmount: baseAmount,
              date: new Date(date + 'T12:00:00'),
              sourceType: 'INCOME',
            });
          }

          // 3. Actualizar balance de la cuenta
          const delta = activeForm === 'GASTO' ? -(parsedAmount + feeAmountVal) : parsedAmount;
          await db.accounts.update(parseInt(accountId), { balance: selectedAccount.balance + delta });
        });

      }

      setSuccess(true);
      setTimeout(() => closeSheet(), 900);
    } catch (err) {
      console.error('Error registering operation:', err);
      setError(err.message || 'Error al registrar la operación');
    }
  };

  const options = [
    {
      type: 'INGRESO',
      icon: <ArrowUpRight size={17} strokeWidth={1.6} />,
      label: 'Ingreso',
      color: '#4F8F58',
    },
    {
      type: 'TRANSFERENCIA',
      icon: <ArrowLeftRight size={17} strokeWidth={1.6} />,
      label: 'Transferencia',
      color: '#3F7F9C',
    },
    {
      type: 'GASTO',
      icon: <ArrowDownLeft size={17} strokeWidth={1.6} />,
      label: 'Gasto',
      color: '#C58A14',
    },
    {
      type: 'SPLIT_CALC',
      icon: <Users size={17} strokeWidth={1.6} />,
      label: 'Dividir movimiento',
      color: '#647C78',
    },
    {
      type: 'CALCULADORA',
      icon: <Calculator size={17} strokeWidth={1.6} />,
      label: 'Calculadora',
      color: '#1A1A1A',
    },
  ];

  return (
    <>
      {/* FAB + action panel */}
      <div className="fixed bottom-20 right-6 z-40" id="fab-container">

        {isOpen && (
          <div className="absolute bottom-[66px] right-0 w-48 border-2 border-[#1A1A1A] bg-[#F5F2ED]">
            {options.map((opt, index) => (
              <button
                key={opt.type}
                id={`fab-action-${opt.type.toLowerCase()}`}
                type="button"
                onClick={() => openForm(opt.type)}
                className={`flex h-12 w-full items-center gap-3 px-3 text-left text-noria-text focus:outline-none active:bg-[#E8E2D8] ${index > 0 ? 'border-t border-[#1A1A1A]' : ''}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center" style={{ color: opt.color }}>
                  {opt.icon}
                </span>
                <span className="font-mono text-[11px] font-[700] uppercase tracking-[0.08em]" style={{ color: opt.color }}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Main FAB */}
        <button
          id="fab-main-btn"
          onClick={handleFabClick}
          className="w-14 h-14 border-2 border-[#1A1A1A] bg-noria-bg flex items-center justify-center active:scale-95 transition-all focus:outline-none"
          aria-label="Nuevo registro"
          style={{ position: 'relative', zIndex: 1 }}
        >
          <Plus
            size={20}
            strokeWidth={1.5}
            className="text-noria-text transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
          />
        </button>
      </div>

      {/* -- Dim overlay when radial is open (not blur) -- */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* -- Bottom Sheet Form -- */}
      {activeForm && (
        <>
          <div
            className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40"
            onClick={closeSheet}
            aria-hidden="true"
          />
          <div
            ref={sheetRef}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[88vh] max-w-md mx-auto overflow-y-auto bg-[#F5F2ED] border-t-2 border-l-2 border-r-2 border-[#1A1A1A] animate-slide-up"
          >
            <form onSubmit={handleSubmit} id="fab-transaction-form">
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-8 h-[3px] rounded-full bg-[rgba(26,26,26,0.12)]" />
              </div>

              {success ? (
                <div className="flex flex-col items-center justify-center py-14 space-y-3" style={{ color: '#647C78' }}>
                  <div className="w-12 h-12 border border-[rgba(100,124,120,0.45)] flex items-center justify-center text-xl">✓</div>
                  <p className="label-section" style={{ color: '#647C78' }}>Guardado</p>
                </div>
              ) : (
                <div className="px-6 pb-8 space-y-5">
                  {/* Title */}
                  <div className="flex justify-between items-center">
                    <h4 className="text-[16px] font-[400] text-noria-text">
                      {activeForm === 'TRANSFERENCIA' ? 'Mover Fondos (Transf.)' : activeForm === 'GASTO' ? 'Registrar Gasto' : 'Registrar Ingreso'}
                    </h4>
                    <button type="button" onClick={closeSheet} id="close-fab-sheet-btn"
                      className="text-noria-muted hover:text-noria-text transition-colors focus:outline-none p-1">
                      <X size={16} strokeWidth={1.5} />
                    </button>
                  </div>

                  {activeForm === 'TRANSFERENCIA' ? (
                    /* TRANSFERENCIA - Dual Amount Inputs */
                    <div className="space-y-4 animate-fade-in">
                      {(() => {
                        const sourceAcc = accounts.find(a => a.id.toString() === accountId);
                        const targetAcc = accounts.find(a => a.id.toString() === toAccountId);
                        const isMultiCurrency = sourceAcc && targetAcc && sourceAcc.currency !== targetAcc.currency;

                        const amtNum = parseFloat(amount) || 0;
                        const recNum = parseFloat(amountReceived) || 0;
                        const feeAmt = Math.max(0, amtNum - recNum);

                        return (
                          <>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="py-2 border-b border-[rgba(0,0,0,0.07)]">
                                <p className="label-section mb-1">Monto a Enviar ({sourceAcc?.currency || ''})</p>
                                <input
                                  id="tx-amount-sent"
                                  type="number" step="0.01" inputMode="decimal"
                                  value={amount} onChange={e => handleAmountChange(e.target.value)}
                                  placeholder="0.00"
                                  className="w-full text-[22px] font-[300] text-noria-text bg-transparent outline-none placeholder:text-[rgba(26,26,26,0.15)]"
                                  autoFocus required
                                />
                              </div>

                              <div className="py-2 border-b border-[rgba(0,0,0,0.07)]">
                                <p className="label-section mb-1">Monto a Recibir ({targetAcc?.currency || ''})</p>
                                <input
                                  id="tx-amount-received"
                                  type="number" step="0.01" inputMode="decimal"
                                  value={amountReceived} onChange={e => handleAmountReceivedChange(e.target.value)}
                                  placeholder="0.00"
                                  className="w-full text-[22px] font-[300] text-noria-text bg-transparent outline-none placeholder:text-[rgba(26,26,26,0.15)]"
                                  required
                                />
                              </div>
                            </div>

                            {/* Mostrar Tasa de Cambio o Comisiones */}
                            {isMultiCurrency ? (
                              <div className="p-2.5 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.01)] flex justify-between items-center animate-fade-in">
                                <span className="label-section">Tasa de Cambio Implícita:</span>
                                <div className="flex items-center space-x-1">
                                  <input
                                    type="number" step="0.0001"
                                    value={exchangeRate} onChange={e => handleRateChange(e.target.value)}
                                    placeholder="Tasa"
                                    className="w-20 text-right bg-transparent border-b border-transparent focus:border-[#4F8F58] outline-none font-mono text-[13px] font-[500]"
                                  />
                                  <span className="text-[10px] text-noria-muted">{targetAcc?.currency}/{sourceAcc?.currency}</span>
                                </div>
                              </div>
                            ) : (
                              feeAmt > 0 && (
                                <div className="p-2.5 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.01)] flex justify-between items-center animate-fade-in text-[12px] font-mono text-noria-text/60">
                                  <span>Comisión cobrada:</span>
                                  <span className="text-noria-amber font-[500]">${fmt(feeAmt)}</span>
                                </div>
                              )
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    /* GASTO/INGRESO - Standard Hero Amount Input */
                    <div className="space-y-4">
                      <div className="py-3 border-b border-[rgba(0,0,0,0.07)]">
                        <p className="label-section mb-2">Monto ({selectedAccountCurrency})</p>
                        <input
                          id="tx-amount"
                          type="number" step="0.01" inputMode="decimal"
                          value={amount} onChange={e => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full text-[32px] font-[300] text-noria-text bg-transparent outline-none placeholder:text-[rgba(26,26,26,0.15)]"
                          autoFocus required
                        />
                      </div>

                      {activeForm === 'GASTO' && (
                        (() => {
                          if (!selectedPaymentMethod) return null;
                          const instId = selectedPaymentMethod.startsWith('inst-') ? parseInt(selectedPaymentMethod.replace('inst-', '')) : null;
                          const inst = instId ? instruments.find(i => i.id === instId) : null;
                          if (!inst || (!inst.feePercentage && !inst.feeFixed)) return null;

                          const baseAmt = parseFloat(amount) || 0;
                          const estimatedFee = (baseAmt * (inst.feePercentage || 0) / 100) + (inst.feeFixed || 0);
                          if (estimatedFee <= 0) return null;

                          return (
                            <div className="p-2.5 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.01)] text-[12px] font-mono text-noria-text/60 space-y-1 animate-fade-in">
                              <div className="flex justify-between">
                                <span>Comisión estimada:</span>
                                <span className="text-noria-amber font-[500]">{estimatedFee.toLocaleString('en-US', { minimumFractionDigits: 2 })} {selectedAccountCurrency}</span>
                              </div>
                              <div className="flex justify-between border-t border-[rgba(0,0,0,0.06)] pt-1 text-[11px]">
                                <span>Total a debitar:</span>
                                <span className="font-[600] text-[#1A1A1A]">{(baseAmt + estimatedFee).toLocaleString('en-US', { minimumFractionDigits: 2 })} {selectedAccountCurrency}</span>
                              </div>
                            </div>
                          );
                        })()
                      )}

                      {activeForm === 'INGRESO' && selectedAccountCurrency === lotCurrency && (
                        <div className="py-2 border-b border-[rgba(0,0,0,0.07)] animate-fade-in">
                          <p className="label-section mb-1">Tasa de cambio ({lotCurrency}/{baseCurrency})</p>
                          <input
                            id="tx-rate"
                            type="number" step="0.0001" inputMode="decimal"
                            value={exchangeRate} onChange={e => setExchangeRate(e.target.value)}
                            placeholder="0.00"
                            className="w-full text-[18px] font-mono text-noria-text bg-transparent outline-none placeholder:text-[rgba(26,26,26,0.15)]"
                            required
                          />
                        </div>
                      )}

                      {activeForm === 'GASTO' && (
                        <button
                          type="button"
                          onClick={() => { closeSheet(); navigate('/transactions/receipt'); }}
                          className="w-full border border-[#647C78] px-3 py-2 text-left font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#647C78]"
                        >
                          Dividir este movimiento →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Tercero / Comercio */}
                  {(activeForm === 'GASTO' || activeForm === 'INGRESO') && (
                    <div className="relative">
                      <label className="muji-header block mb-1">Tercero / Comercio</label>
                      <input
                        type="text"
                        value={thirdPartyInput}
                        onChange={e => {
                          setThirdPartyInput(e.target.value);
                          setSelectedThirdPartyId('');
                          setShowThirdPartySuggestions(true);
                        }}
                        onFocus={() => setShowThirdPartySuggestions(true)}
                        onBlur={() => setTimeout(() => setShowThirdPartySuggestions(false), 200)}
                        placeholder="Ej. Abasto San José"
                        className="muji-input"
                      />
                      {showThirdPartySuggestions && thirdPartyInput.trim() && (
                        (() => {
                          const filtered = thirdParties.filter(tp => tp.name.toLowerCase().includes(thirdPartyInput.toLowerCase()));
                          if (filtered.length === 0) return null;
                          return (
                            <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto border border-[#1A1A1A] bg-[#F5F2ED] py-1 shadow-md">
                              {filtered.map(tp => (
                                <button
                                  key={tp.id}
                                  type="button"
                                  onClick={() => {
                                    setThirdPartyInput(tp.name);
                                    setSelectedThirdPartyId(tp.id.toString());
                                    setShowThirdPartySuggestions(false);
                                  }}
                                  className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#1A1A1A]/10 text-noria-text"
                                >
                                  {tp.name}
                                </button>
                              ))}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <label className="muji-header block mb-1">Descripción</label>
                    <input id="tx-description" type="text" value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder={activeForm === 'TRANSFERENCIA' ? 'Ej. Recarga saldo Zinli' : activeForm === 'GASTO' ? 'Ej. Supermercado Central Madeirense' : 'Ej. Proyecto Casa Díaz'}
                      className="muji-input" />
                  </div>

                  {/* Income Source */}
                  {activeForm === 'INGRESO' && (
                    <div className="space-y-3">
                      <div>
                        <label className="muji-header block mb-1">Fuente de Ingreso</label>
                        <select id="tx-income-source" value={incomeSourceId}
                          onChange={e => { setIncomeSourceId(e.target.value); if (e.target.value === 'new') setNewSourceName(''); }}
                          className="muji-input">
                          {incomeSources.map(s => {
                            const incomeType = getIncomeType(incomeTypes, s.incomeTypeId, s.type);
                            return <option key={s.id} value={s.id}>{s.name}{incomeType?.name ? ` · ${incomeType.name}` : ''}</option>;
                          })}
                          <option value="new">+ Nueva fuente...</option>
                        </select>
                      </div>
                      {(incomeSourceId === 'new' || incomeSources.length === 0) && (
                        <div className="space-y-3 p-3 border border-[rgba(0,0,0,0.06)] rounded bg-[rgba(26,26,26,0.01)] animate-fade-in">
                          <div>
                            <label className="muji-header block mb-1">Nombre de la nueva fuente</label>
                            <input id="tx-new-source" type="text" value={newSourceName}
                              onChange={e => setNewSourceName(e.target.value)}
                              placeholder="Ej. Estudio CKM Visualización"
                              className="muji-input" required />
                          </div>
                          <IncomeTypeSelect
                            id="tx-new-source-type"
                            value={newSourceIncomeTypeId || incomeTypes[0]?.id?.toString() || ''}
                            onChange={setNewSourceIncomeTypeId}
                            incomeTypes={incomeTypes}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Category - Hide if isSplit */}
                  {activeForm === 'GASTO' && !isSplit && (
                    <CategorySelect
                      id="tx-category"
                      value={tagId}
                      onChange={setTagId}
                      tags={tags}
                      kind="EXPENSE"
                      className="max-w-[320px]"
                    />
                  )}

                  {/* Splits Breakdown */}
                  {activeForm === 'GASTO' && isSplit && (
                    <div className="space-y-4 p-3 border border-[#1A1A1A]/30 rounded bg-noria-bg/5 animate-fade-in">
                      <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Desglose del gasto</p>
                      {splits.map((split, index) => (
                        <div key={index} className="space-y-3 border-b border-[#1A1A1A]/10 pb-3 last:border-b-0 last:pb-0">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] font-mono font-[700] text-noria-muted uppercase font-semibold">Línea #{index + 1}</span>
                            {splits.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setSplits(splits.filter((_, i) => i !== index))}
                                className="text-[10px] font-mono uppercase text-[#9F2F2D] font-bold"
                              >
                                Eliminar
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            <div>
                              <label className="text-[10px] font-mono uppercase text-noria-muted block mb-0.5">Monto</label>
                              <input
                                type="number" step="0.01" placeholder="0.00"
                                value={split.amount}
                                onChange={e => {
                                  const val = e.target.value;
                                  setSplits(splits.map((s, i) => i === index ? { ...s, amount: val } : s));
                                }}
                                className="muji-input text-[12px]"
                                required
                              />
                            </div>
                          </div>

                          <div>
                            <CategorySelect
                              id={`split-cat-${index}`}
                              label="Categoría"
                              value={split.tagId}
                              onChange={val => {
                                const selectedCat = tags.find(t => t.id.toString() === val);
                                const defaultPillar = selectedCat?.pillar || 'NEED';
                                setSplits(splits.map((s, i) => i === index ? { ...s, tagId: val, pillar: defaultPillar } : s));
                              }}
                              tags={tags}
                              kind="EXPENSE"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-mono uppercase text-noria-muted block mb-0.5">Detalle (Opcional)</label>
                            <input
                              type="text" placeholder="Ej. Tomates"
                              value={split.description}
                              onChange={e => {
                                const val = e.target.value;
                                setSplits(splits.map((s, i) => i === index ? { ...s, description: val } : s));
                              }}
                              className="muji-input text-[12px]"
                            />
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSplits([...splits, { amount: '', tagId: '', pillar: 'NEED', description: '' }])}
                        className="w-full py-2 border border-dashed border-[#1A1A1A]/40 text-[11px] font-mono font-[700] uppercase tracking-wide text-[#647C78] hover:bg-[#1A1A1A]/5"
                      >
                        + Añadir línea
                      </button>
                    </div>
                  )}

                  {/* Person Splits Breakdown */}
                  {activeForm === 'GASTO' && isPersonSplit && (
                    <div className="space-y-4 p-3 border border-[#1A1A1A]/30 rounded bg-[#F5F2ED] animate-fade-in">
                      <div className="flex justify-between items-center">
                        <p className="font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-muted">Dividir con personas</p>
                        
                        {/* Mode Choice: EQUITATIVO / MANUAL */}
                        <div className="flex border border-[#1A1A1A] font-mono text-[9px] uppercase tracking-wider">
                          <button
                            type="button"
                            onClick={() => setPersonSplitMode('EQUITATIVO')}
                            className={`px-2 py-1 ${personSplitMode === 'EQUITATIVO' ? 'bg-[#1A1A1A] text-[#F5F2ED]' : 'bg-transparent text-noria-text'}`}
                          >
                            Equitativo
                          </button>
                          <button
                            type="button"
                            onClick={() => setPersonSplitMode('MANUAL')}
                            className={`px-2 py-1 border-l border-[#1A1A1A] ${personSplitMode === 'MANUAL' ? 'bg-[#1A1A1A] text-[#F5F2ED]' : 'bg-transparent text-noria-text'}`}
                          >
                            Manual
                          </button>
                        </div>
                      </div>

                      {/* Participants list */}
                      {personSplits.map((p, index) => {
                        const parsedTotal = parseFloat(amount) || 0;
                        const autoAmount = personSplitMode === 'EQUITATIVO' 
                          ? (parsedTotal / (personSplits.length + 1)) 
                          : null;
                        
                        const displayAmount = personSplitMode === 'EQUITATIVO'
                          ? autoAmount.toFixed(2)
                          : p.amount;

                        return (
                          <div key={index} className="space-y-3 border-b border-[#1A1A1A]/10 pb-3 last:border-b-0 last:pb-0">
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] font-mono font-[700] text-noria-muted uppercase">Participante #{index + 1}</span>
                              {personSplits.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setPersonSplits(personSplits.filter((_, i) => i !== index))}
                                  className="text-[10px] font-mono uppercase text-[#9F2F2D] font-bold"
                                >
                                  Eliminar
                                </button>
                              )}
                            </div>

                            {/* Autocomplete Name */}
                            <div className="relative">
                              <label className="text-[10px] font-mono uppercase text-noria-muted block mb-0.5">Nombre</label>
                              <input
                                type="text"
                                value={p.thirdPartyInput}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPersonSplits(personSplits.map((item, i) => 
                                    i === index ? { ...item, thirdPartyInput: val, selectedThirdPartyId: '' } : item
                                  ));
                                  setFocusedParticipantIndex(index);
                                }}
                                onFocus={() => setFocusedParticipantIndex(index)}
                                onBlur={() => setTimeout(() => setFocusedParticipantIndex(null), 200)}
                                placeholder="Ej. María, Carlos"
                                className="muji-input text-[12px]"
                                required
                              />
                              {focusedParticipantIndex === index && p.thirdPartyInput.trim() && (
                                (() => {
                                  const filtered = thirdParties.filter(tp => 
                                    tp.name.toLowerCase().includes(p.thirdPartyInput.toLowerCase())
                                  );
                                  if (filtered.length === 0) return null;
                                  return (
                                    <div className="absolute left-0 right-0 z-50 mt-1 max-h-30 overflow-y-auto border border-[#1A1A1A] bg-[#F5F2ED] py-1 shadow-md">
                                      {filtered.map(tp => (
                                        <button
                                          key={tp.id}
                                          type="button"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            setPersonSplits(personSplits.map((item, i) => 
                                              i === index ? { ...item, thirdPartyInput: tp.name, selectedThirdPartyId: tp.id.toString() } : item
                                            ));
                                            setFocusedParticipantIndex(null);
                                          }}
                                          className="block w-full px-3 py-1 text-left text-[11px] hover:bg-[#1A1A1A]/10 text-noria-text font-mono"
                                        >
                                          {tp.name}
                                        </button>
                                      ))}
                                    </div>
                                  );
                                })()
                              )}
                            </div>

                            {/* Amount input */}
                            <div>
                              <label className="text-[10px] font-mono uppercase text-noria-muted block mb-0.5">Monto ({selectedAccountCurrency})</label>
                              <input
                                type="number" step="0.01" placeholder="0.00"
                                value={displayAmount}
                                disabled={personSplitMode === 'EQUITATIVO'}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPersonSplits(personSplits.map((item, i) => 
                                    i === index ? { ...item, amount: val } : item
                                  ));
                                }}
                                className="muji-input text-[12px] disabled:bg-transparent disabled:text-noria-muted disabled:border-[rgba(26,26,26,0.16)]"
                                required
                              />
                            </div>
                          </div>
                        );
                      })}

                      {/* Add participant */}
                      <button
                        type="button"
                        onClick={() => setPersonSplits([...personSplits, { thirdPartyInput: '', selectedThirdPartyId: '', amount: '' }])}
                        className="w-full py-2 border border-dashed border-[#1A1A1A]/40 text-[11px] font-mono font-[700] uppercase tracking-wide text-[#647C78] hover:bg-[#1A1A1A]/5"
                      >
                        + Añadir persona
                      </button>

                      {/* Summary */}
                      {(() => {
                        const parsedTotal = parseFloat(amount) || 0;
                        let totalShared = 0;
                        if (personSplitMode === 'EQUITATIVO') {
                          totalShared = (parsedTotal / (personSplits.length + 1)) * personSplits.length;
                        } else {
                          totalShared = personSplits.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
                        }
                        const yourPart = Math.max(0, parsedTotal - totalShared);
                        return (
                          <div className="pt-2 border-t border-[#1A1A1A]/20 font-mono text-[11px] text-noria-text space-y-1">
                            <div className="flex justify-between">
                              <span>Total a dividir:</span>
                              <span className="font-semibold">{formatAmountWithSymbol(parsedTotal, selectedAccountCurrency, dbCurrencies)}</span>
                            </div>
                            <div className="flex justify-between text-[#4F8F58]">
                              <span>Deudas a cobrar:</span>
                              <span>+{formatAmountWithSymbol(totalShared, selectedAccountCurrency, dbCurrencies)}</span>
                            </div>
                            <div className="flex justify-between font-bold border-t border-[#1A1A1A]/10 pt-1">
                              <span>Tu parte real (Gasto):</span>
                              <span>{formatAmountWithSymbol(yourPart, selectedAccountCurrency, dbCurrencies)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Account + Date row */}
                  {activeForm === 'TRANSFERENCIA' ? (
                    /* Accounts for transfers */
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="muji-header block mb-1">Desde Cuenta</label>
                          <select id="tx-account" value={accountId} onChange={e => handleSourceAccountChange(e.target.value)}
                            className="muji-input" required>
                            {activeAccounts.map(acc => {
                              const inst = institutions.find(i => i.id === acc.institutionId);
                              const label = getAccountLabel(acc, inst);
                              return <option key={acc.id} value={acc.id}>{label} ({acc.currency})</option>;
                            })}
                          </select>
                        </div>
                        <div>
                          <label className="muji-header block mb-1">Hacia Cuenta</label>
                          <select id="tx-account-dest" value={toAccountId} onChange={e => handleTargetAccountChange(e.target.value)}
                            className="muji-input" required>
                            {activeAccounts.map(acc => {
                              const inst = institutions.find(i => i.id === acc.institutionId);
                              const label = getAccountLabel(acc, inst);
                              return <option key={acc.id} value={acc.id}>{label} ({acc.currency})</option>;
                            })}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="muji-header block mb-1">Fecha</label>
                        <input id="tx-date" type="date" value={date} onChange={e => setDate(e.target.value)}
                          className="muji-input" required />
                      </div>
                    </div>
                  ) : (
                    /* Account + Date row standard */
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        {activeForm === 'GASTO' ? (
                          <>
                            <label className="muji-header block mb-1">Medio de Pago</label>
                            <select
                              id="tx-payment-method"
                              value={selectedPaymentMethod}
                              onChange={e => {
                                const val = e.target.value;
                                setSelectedPaymentMethod(val);
                                setAccountId(getAccountIdFromPaymentMethod(val));
                              }}
                              className="muji-input" required
                            >
                              {activeAccounts.map(acc => {
                                const inst = institutions.find(i => i.id === acc.institutionId);
                                const accLabel = getAccountLabel(acc, inst);
                                const accInstruments = instruments.filter(i => i.accountId === acc.id);

                                if (accInstruments.length === 0) {
                                  return (
                                    <option key={`acc-${acc.id}`} value={`acc-${acc.id}`}>
                                      {accLabel} ({acc.currency})
                                    </option>
                                  );
                                }

                                return (
                                  <optgroup key={acc.id} label={`${accLabel} (${acc.currency})`}>
                                    {accInstruments.map(i => {
                                      const typeLabel = INSTRUMENT_TYPES.find(t => t.value === i.type)?.label || i.type;
                                      const name = i.alias ? `${typeLabel} (${i.alias})` : typeLabel;
                                      const feeText = (i.feePercentage > 0 || i.feeFixed > 0)
                                        ? ` (${i.feePercentage > 0 ? `${i.feePercentage}%` : ''}${i.feePercentage > 0 && i.feeFixed > 0 ? ' + ' : ''}${i.feeFixed > 0 ? `${i.feeFixed}` : ''} fee)`
                                        : '';
                                      return (
                                        <option key={`inst-${i.id}`} value={`inst-${i.id}`}>
                                          {name}{feeText}
                                        </option>
                                      );
                                    })}
                                    <option value={`acc-${acc.id}`}>
                                      Saldo de cuenta
                                    </option>
                                  </optgroup>
                                );
                              })}
                            </select>
                          </>
                        ) : (
                          <>
                            <label className="muji-header block mb-1">Cuenta de destino</label>
                            <select id="tx-account" value={accountId} onChange={e => setAccountId(e.target.value)}
                              className="muji-input" required>
                              {activeAccounts.map(acc => {
                                const inst = institutions.find(i => i.id === acc.institutionId);
                                const label = getAccountLabel(acc, inst);
                                return <option key={acc.id} value={acc.id}>{label} ({acc.currency})</option>;
                              })}
                            </select>
                          </>
                        )}
                      </div>
                      <div>
                        <label className="muji-header block mb-1">Fecha</label>
                        <input id="tx-date" type="date" value={date} onChange={e => setDate(e.target.value)}
                          className="muji-input" required />
                      </div>
                    </div>
                  )}

                  {error && <p className="text-[12px] font-[500]" style={{ color: '#C58A14' }} id="fab-error">{error}</p>}

                  {/* Submit */}
                  <button type="submit" id="fab-submit-btn"
                    className="w-full py-3.5 border text-[13px] font-[500] uppercase tracking-wider transition-colors"
                    style={{ background: 'transparent', color: '#1A1A1A', borderColor: '#1A1A1A' }}>
                    Guardar
                  </button>
                </div>
              )}
            </form>
          </div>
        </>
      )}
      {/* -- BOTTOM SHEET: CALCULADORA DE CONVERSIÓN MULTIMONEDA -- */}
      {isCalcOpen && (
        <>
          <div
            className="fixed inset-0 bg-[rgba(26,26,26,0.12)] z-40 animate-fade-in"
            onClick={() => setIsCalcOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] max-w-md mx-auto overflow-y-auto bg-[#F5F2ED] border-t-2 border-l-2 border-r-2 border-[#1A1A1A] animate-slide-up px-6 pb-10 pt-4"
            style={{ boxShadow: '0 -8px 40px rgba(0,0,0,0.08)', borderRadius: '0px' }}
          >
            {/* Handle bar */}
            <div className="flex justify-center mb-3">
              <div className="w-8 h-[3px] rounded-full bg-[rgba(26,26,26,0.12)]" />
            </div>

            {/* Header */}
            <div className="flex justify-between items-center mb-5">
              <h4 className="text-[16px] font-[500] uppercase tracking-wider text-noria-text">Calculadora Divisas</h4>
              <button
                onClick={() => setIsCalcOpen(false)}
                className="focus:outline-none p-1 text-noria-muted hover:text-noria-text"
              >
                <X size={16} />
              </button>
            </div>

            {/* Selector de Monedas */}
            <div className="grid grid-cols-5 gap-2 items-center mb-4">
              <div className="col-span-2">
                <label className="muji-header block mb-1">De (A)</label>
                <select
                  value={calcCurrencyA}
                  onChange={e => setCalcCurrencyA(e.target.value)}
                  className="muji-input font-mono text-[13px]"
                >
                  {activeCurrencies.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-1 flex justify-center pt-4">
                <button
                  type="button"
                  onClick={handleSwap}
                  className="w-8 h-8 border border-[#1A1A1A] flex items-center justify-center hover:bg-noria-text/[0.03] transition-colors focus:outline-none"
                  title="Intercambiar divisas"
                >
                  <Coins size={14} />
                </button>
              </div>

              <div className="col-span-2">
                <label className="muji-header block mb-1">A (B)</label>
                <select
                  value={calcCurrencyB}
                  onChange={e => setCalcCurrencyB(e.target.value)}
                  className="muji-input font-mono text-[13px]"
                >
                  {activeCurrencies.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tasa de Cambio */}
            <div className="py-2.5 border-b border-[rgba(26,26,26,0.12)] mb-4">
              <label className="muji-header block mb-1">Tasa de Cambio ({calcCurrencyB}/{calcCurrencyA})</label>
              <input
                type="number"
                step="0.0001"
                inputMode="decimal"
                value={rate}
                onChange={e => handleRateChangeLocal(e.target.value)}
                placeholder="Ej. 40.00"
                className="w-full text-[18px] font-mono text-noria-text bg-transparent outline-none placeholder:text-[rgba(26,26,26,0.15)]"
              />
            </div>

            {/* Campos de Monto */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="py-2.5 border-b border-[rgba(26,26,26,0.12)]">
                <label className="muji-header block mb-1">Monto en {calcCurrencyA}</label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={amountA}
                  onChange={e => handleAmountAChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-[20px] font-mono text-noria-text bg-transparent outline-none placeholder:text-[rgba(26,26,26,0.15)]"
                />
              </div>

              <div className="py-2.5 border-b border-[rgba(26,26,26,0.12)]">
                <label className="muji-header block mb-1">Monto en {calcCurrencyB}</label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={amountB}
                  onChange={e => handleAmountBChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-[20px] font-mono text-noria-text bg-transparent outline-none placeholder:text-[rgba(26,26,26,0.15)]"
                />
              </div>
            </div>

            {/* Botones de acción */}
            <button
              type="button"
              onClick={handleClear}
              className="w-full py-3.5 border border-[#1A1A1A] text-[12px] font-[500] uppercase tracking-wider hover:bg-noria-text/[0.03] transition-colors focus:outline-none"
            >
              Limpiar Campos
            </button>
          </div>
        </>
      )}
    </>
  );
}
