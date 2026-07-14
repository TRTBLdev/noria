import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, ArrowLeft } from 'lucide-react';

export default function Header({ title = 'Noria', showBack = false }) {
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-noria-bg/85 backdrop-blur-md border-b border-noria-text/5 flex items-center justify-between px-6 z-40 max-w-md mx-auto">
      <div className="w-10">
        {showBack && (
          <button
            id="header-back-btn"
            onClick={() => navigate(-1)}
            className="text-noria-text/60 hover:text-noria-text p-1 -ml-1 transition-colors focus:outline-none"
            aria-label="Volver"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <h1 className="text-sm font-light tracking-[0.25em] uppercase text-noria-text select-none text-center">
        {title}
      </h1>

      <div className="w-10 flex justify-end">
        {!showBack && title !== 'Configuración' && (
          <button
            id="header-settings-btn"
            onClick={() => navigate('/settings')}
            className="text-noria-text/60 hover:text-noria-text p-1 -mr-1 transition-colors focus:outline-none"
            aria-label="Configuración"
          >
            <Settings size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </header>
  );
}
