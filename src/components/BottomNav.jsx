import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Wallet, ArrowLeftRight, Users } from 'lucide-react';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const handleTabClick = (path, name) => {
    if (path === '/operations' || path === '/debts') {
      alert(`${name} estará disponible próximamente en los siguientes módulos.`);
      return;
    }
    navigate(path);
  };

  const navItems = [
    { icon: Home, name: 'Home', path: '/home' },
    { icon: Wallet, name: 'Patrimonio', path: '/accounts' },
    { icon: ArrowLeftRight, name: 'Lotes P2P', path: '/operations' },
    { icon: Users, name: 'Deudas', path: '/debts' }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-noria-bg border-t border-noria-text/5 px-6 pb-safe-bottom z-40 max-w-md mx-auto">
      <div className="flex justify-between items-center h-16">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = currentPath === item.path;
          return (
            <button
              key={idx}
              id={`nav-tab-${item.name.toLowerCase()}`}
              onClick={() => handleTabClick(item.path, item.name)}
              className="flex flex-col items-center justify-center flex-1 py-1 focus:outline-none transition-colors duration-200"
            >
              <Icon 
                size={22} 
                strokeWidth={1.5}
                className={isActive ? "text-noria-salvia fill-noria-salvia/10" : "text-noria-text/40"}
              />
              <span className={`text-[9px] tracking-wider font-light mt-1 uppercase ${isActive ? "text-noria-salvia font-normal" : "text-noria-text/40"}`}>
                {item.name}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
