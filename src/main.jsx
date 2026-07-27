import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { db, seedDatabase } from './db/db.js'

// DevTools can delete IndexedDB without changing the current hash route.
// When that happens, return to the access screen after Dexie closes its connection.
db.on('versionchange', event => {
  if (event.newVersion === null) {
    setTimeout(() => {
      const target = `${window.location.origin}${window.location.pathname}#/access`;
      window.location.replace(target);
    }, 0);
  }
});

// Initialize database with default data if empty
seedDatabase().catch(err => {
  console.error("Failed to seed database:", err);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
