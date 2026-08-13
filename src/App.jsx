import React, { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db.js';
import AccessScreen from './screens/AccessScreen.jsx';

const OnboardingScreen = lazy(() => import('./screens/OnboardingScreen.jsx'));
const HomeScreen = lazy(() => import('./screens/HomeScreen.jsx'));
const AccountsScreen = lazy(() => import('./screens/AccountsScreen.jsx'));
const BudgetScreen = lazy(() => import('./screens/BudgetScreen.jsx'));
const BudgetFull = lazy(() => import('./screens/BudgetFull.jsx'));
const TransactionsScreen = lazy(() => import('./screens/TransactionsScreen.jsx'));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen.jsx'));
const DivisasScreen = lazy(() => import('./screens/DivisasScreen.jsx'));
const DebtsScreen = lazy(() => import('./screens/DebtsScreen.jsx'));
const ReceiptSplitScreen = lazy(() => import('./screens/ReceiptSplitScreen.jsx'));
const SpendingGoalsScreen = lazy(() => import('./screens/SpendingGoalsScreen.jsx'));

function RouteLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F2ED] px-6" role="status" aria-live="polite">
      <p className="border-l-2 border-[#647C78] pl-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-noria-muted">
        Cargando sección…
      </p>
    </main>
  );
}

function AccessGate({ children, onboardingRequired = true }) {
  const accessState = useLiveQuery(async () => {
    const [granted, onboarding] = await Promise.all([
      db.app_config.get('accessGranted'),
      db.app_config.get('onboardingComplete'),
    ]);
    return {
      granted: granted?.value === true,
      onboardingComplete: onboarding?.value === true,
    };
  }, []);

  if (!accessState) return null;
  if (!accessState.granted) return <Navigate to="/access" replace />;
  if (onboardingRequired && !accessState.onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }
  if (!onboardingRequired && accessState.onboardingComplete) {
    return <Navigate to="/home" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        {/* Default route redirects to access validation screen */}
        <Route path="/" element={<Navigate to="/access" replace />} />
        
        <Route path="/access" element={<AccessScreen />} />
        <Route path="/onboarding" element={<AccessGate onboardingRequired={false}><OnboardingScreen /></AccessGate>} />
        <Route path="/home" element={<AccessGate><HomeScreen /></AccessGate>} />
        <Route path="/accounts" element={<AccessGate><AccountsScreen /></AccessGate>} />
        <Route path="/budget" element={<AccessGate><BudgetScreen /></AccessGate>} />
        <Route path="/budget/full" element={<AccessGate><BudgetFull /></AccessGate>} />
        <Route path="/transactions" element={<AccessGate><TransactionsScreen /></AccessGate>} />
        <Route path="/settings" element={<AccessGate><SettingsScreen /></AccessGate>} />
        <Route path="/divisas" element={<AccessGate><DivisasScreen /></AccessGate>} />
        <Route path="/debts" element={<AccessGate><DebtsScreen /></AccessGate>} />
        <Route path="/calculator/split" element={<AccessGate><ReceiptSplitScreen initialMode="SHARED_EXPENSE" /></AccessGate>} />
        <Route path="/transactions/receipt" element={<AccessGate><ReceiptSplitScreen /></AccessGate>} />
        <Route path="/goals" element={<AccessGate><SpendingGoalsScreen /></AccessGate>} />
        
        {/* Fallback to root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
