import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db.js';
import AccessScreen from './screens/AccessScreen.jsx';
import OnboardingScreen from './screens/OnboardingScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import AccountsScreen from './screens/AccountsScreen.jsx';
import BudgetScreen from './screens/BudgetScreen.jsx';
import BudgetFull from './screens/BudgetFull.jsx';
import TransactionsScreen from './screens/TransactionsScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import DivisasScreen from './screens/DivisasScreen.jsx';
import DebtsScreen from './screens/DebtsScreen.jsx';
import SplitCalculatorScreen from './screens/SplitCalculatorScreen.jsx';

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
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation || location}>
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
        <Route path="/calculator/split" element={<AccessGate><SplitCalculatorScreen /></AccessGate>} />
        
        {/* Fallback to root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {backgroundLocation && (
        <Routes>
          <Route path="/calculator/split" element={<AccessGate><SplitCalculatorScreen isSheet /></AccessGate>} />
        </Routes>
      )}
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
