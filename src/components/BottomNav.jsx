import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Wallet, CalendarRange, ArrowLeftRight, Settings } from 'lucide-react';

export default function BottomNav() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const currentPath = location.pathname;

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
    { icon: CalendarRange,  name: 'Presupuesto', path: '/budget' },
    { icon: ArrowLeftRight, name: 'Lotes P2P', path: '/operations' },
    { icon: Settings,       name: 'Config',    path: '/settings' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 border-t z-40 max-w-md mx-auto"
      style={{ background: 'rgba(245,242,237,0.95)', borderColor: 'rgba(0,0,0,0.07)', backdropFilter: 'blur(12px)' }}
    >
      <div className="flex justify-between items-center h-16 px-6">
        {navItems.map((item, idx) => {
          const Icon     = item.icon;
          const isActive = currentPath === item.path;
          return (
            <button
              key={idx}
              id={`nav-tab-${item.name.toLowerCase()}`}
              onClick={() => handleTabClick(item.path, item.name)}
              className="flex flex-col items-center justify-center flex-1 py-1 focus:outline-none transition-colors duration-200"
            >
              <Icon
                size={21}
                strokeWidth={1.5}
                style={{ color: isActive ? '#5C7A52' : 'rgba(26,26,26,0.3)' }}
              />
              <span
                className="text-[9px] tracking-wider mt-1 uppercase"
                style={{ color: isActive ? '#5C7A52' : 'rgba(26,26,26,0.3)', fontWeight: isActive ? 500 : 400 }}
              >
                {item.name}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
