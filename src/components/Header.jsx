import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, ArrowLeft } from 'lucide-react';

export default function Header({ title = 'Noria', showBack = false }) {
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 h-16 backdrop-blur-md border-b flex items-center justify-between px-6 z-40 max-w-md mx-auto" style={{ background: 'rgba(245,242,237,0.88)', borderColor: 'rgba(0,0,0,0.07)' }}>
      <div className="w-10">
        {showBack && (
          <button
            id="header-back-btn"
            onClick={() => navigate(-1)}
            className="p-1 -ml-1 transition-colors focus:outline-none" style={{ color: 'rgba(26,26,26,0.5)' }}
            aria-label="Volver"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <h1 className="text-[12px] font-[500] tracking-[0.25em] uppercase select-none text-center" style={{ color: '#1A1A1A' }}>
        {title}
      </h1>

      <div className="w-10 flex justify-end">
        {!showBack && title !== 'Configuración' && (
          <button
            id="header-settings-btn"
            onClick={() => navigate('/settings')}
            className="p-1 -mr-1 transition-colors focus:outline-none" style={{ color: 'rgba(26,26,26,0.5)' }}
            aria-label="Configuración"
          >
            <Settings size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </header>
  );
}
