import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AccessScreen from './screens/AccessScreen.jsx';
import OnboardingScreen from './screens/OnboardingScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import AccountsScreen from './screens/AccountsScreen.jsx';
import BudgetScreen from './screens/BudgetScreen.jsx';
import TransactionsScreen from './screens/TransactionsScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Default route redirects to access validation screen */}
        <Route path="/" element={<Navigate to="/access" replace />} />
        
        <Route path="/access" element={<AccessScreen />} />
        <Route path="/onboarding" element={<OnboardingScreen />} />
        <Route path="/home" element={<HomeScreen />} />
        <Route path="/accounts" element={<AccountsScreen />} />
        <Route path="/budget" element={<BudgetScreen />} />
        <Route path="/transactions" element={<TransactionsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        
        {/* Fallback to root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
