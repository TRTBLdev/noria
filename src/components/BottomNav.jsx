import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { Home, Wallet, CalendarRange, ArrowLeftRight, TrendingDown } from 'lucide-react';

export default function BottomNav() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const currentPath = location.pathname;

  const hasAlert = useLiveQuery(async () => {
    const now = new Date();
    const threeDaysLater = new Date();
    threeDaysLater.setDate(now.getDate() + 3);
    const pending = await db.anchors
      .filter(a => a.isTemplate === false && a.status !== 'PAID')
      .toArray();
    return pending.some(a => {
      const d = new Date(a.nextDueDate);
      return d <= threeDaysLater;
    });
  }) || false;

  const handleTabClick = (path, name) => {
    if (path === '/operations' || path === '/debts') {
      alert(`${name} estará disponible próximamente.`);
      return;
    }
    navigate(path);
  };

  const navItems = [
    { icon: Home,           name: 'Home',      path: '/home' },
    { icon: Wallet,         name: 'Patrimonio', path: '/accounts' },
    { icon: CalendarRange,  name: 'Flotación', path: '/budget' },
    { icon: ArrowLeftRight, name: 'Lotes P2P', path: '/operations' },
    { icon: TrendingDown,   name: 'Deudas',    path: '/debts' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 border-t z-40 max-w-md mx-auto"
      style={{ background: '#F5F2ED', borderColor: 'rgba(26,26,26,0.16)' }}
    >
      <div className="flex justify-between items-stretch h-16 px-5">
        {navItems.map((item, idx) => {
          const Icon     = item.icon;
          const isActive = currentPath === item.path;
          const showDot = item.name === 'Flotación' && hasAlert;

          return (
            <button
              key={idx}
              id={`nav-tab-${item.name.toLowerCase()}`}
              onClick={() => handleTabClick(item.path, item.name)}
              className="relative flex flex-col items-center justify-center flex-1 py-1 focus:outline-none transition-colors duration-200"
            >
              <div className="relative">
                <Icon
                  size={19}
                  strokeWidth={1.8}
                  style={{ color: isActive ? '#1A1A1A' : 'rgba(26,26,26,0.34)' }}
                />
                {showDot && (
                  <span
                    className="absolute -top-1 -right-1 w-2 h-2"
                    style={{ background: '#B8860B', border: '1px solid #F5F2ED' }}
                  />
                )}
              </div>
              <span
                className="text-[8px] font-mono tracking-wider mt-1 uppercase"
                style={{ color: isActive ? '#647C78' : 'rgba(26,26,26,0.34)', fontWeight: isActive ? 700 : 400 }}
              >
                {item.name}
              </span>
              {isActive && (
                <span className="absolute bottom-0 h-[3px] w-7" style={{ background: '#647C78' }} />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
