import React from 'react';
import {
  BookOpen,
  Briefcase,
  CreditCard,
  DollarSign,
  Film,
  Gift,
  Home,
  Landmark,
  Monitor,
  Plane,
  Receipt,
  ShoppingCart,
  Store,
  Target,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi,
  Zap
} from 'lucide-react';

export const CATEGORY_ICON_OPTIONS = [
  { key: 'home', label: 'Hogar', Icon: Home },
  { key: 'cart', label: 'Compras', Icon: ShoppingCart },
  { key: 'utilities', label: 'Servicios', Icon: Zap },
  { key: 'internet', label: 'Internet', Icon: Wifi },
  { key: 'food', label: 'Comida', Icon: Utensils },
  { key: 'education', label: 'Educacion', Icon: BookOpen },
  { key: 'streaming', label: 'Streaming', Icon: Film },
  { key: 'receipt', label: 'Factura', Icon: Receipt },
  { key: 'bank', label: 'Banco', Icon: Landmark },
  { key: 'wallet', label: 'Wallet', Icon: Wallet },
  { key: 'card', label: 'Tarjeta', Icon: CreditCard },
  { key: 'work', label: 'Trabajo', Icon: Briefcase },
  { key: 'freelance', label: 'Freelance', Icon: Monitor },
  { key: 'investment', label: 'Inversion', Icon: TrendingUp },
  { key: 'business', label: 'Negocio', Icon: Store },
  { key: 'gift', label: 'Regalo', Icon: Gift },
  { key: 'travel', label: 'Viaje', Icon: Plane },
  { key: 'goal', label: 'Meta', Icon: Target },
  { key: 'money', label: 'Dinero', Icon: DollarSign }
];

export function getCategoryIconOption(iconKey) {
  return CATEGORY_ICON_OPTIONS.find(option => option.key === iconKey) || CATEGORY_ICON_OPTIONS.find(option => option.key === 'money');
}

export default function CategoryIcon({ iconKey, size = 16, className = '', title }) {
  const option = getCategoryIconOption(iconKey);
  const Icon = option.Icon;

  return (
    <span
      className={`inline-flex items-center justify-center text-noria-muted ${className}`}
      title={title || option.label}
      aria-hidden={title ? undefined : true}
    >
      <Icon size={size} strokeWidth={1.7} />
    </span>
  );
}
