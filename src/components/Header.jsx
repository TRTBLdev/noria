import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, ArrowLeft } from 'lucide-react';

export default function Header({ title = 'Noria', showBack = false, action = null }) {
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 h-16 border-b flex items-center justify-between px-6 z-40 max-w-md mx-auto" style={{ background: '#F5F2ED', borderColor: 'rgba(26,26,26,0.18)' }}>
      <div className="w-10">
        {showBack && (
          <button
            id="header-back-btn"
            onClick={() => navigate(-1)}
            className="p-1 -ml-1 transition-colors focus:outline-none" style={{ color: 'rgba(26,26,26,0.62)' }}
            aria-label="Volver"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <h1 className="text-[12px] font-mono font-[700] tracking-[0.28em] uppercase select-none text-center" style={{ color: '#1A1A1A' }}>
        {title}
      </h1>

      <div className="w-10 flex justify-end">
        {action ? (
          action
        ) : (
          !showBack && title !== 'Configuración' && (
            <button
              id="header-settings-btn"
              onClick={() => navigate('/settings')}
              className="p-1 -mr-1 transition-colors focus:outline-none" style={{ color: 'rgba(26,26,26,0.62)' }}
              aria-label="Configuración"
            >
              <Settings size={20} strokeWidth={1.5} />
            </button>
          )
        )}
      </div>
    </header>
  );
}
