import { Link, useLocation } from 'wouter';
import { BookOpen, Home, Layers3, ShoppingBag, Swords } from 'lucide-react';

// Deliberately allowlisted: never mounted over a battle, draft pick, tower run or admin form.
const destinations = [
  { href: '/', label: '메인', icon: Home },
  { href: '/online', label: '대전', icon: Swords },
  { href: '/decks', label: '덱 편집', icon: Layers3 },
  { href: '/collection', label: '컬렉션', icon: BookOpen },
  {href:'/player-notebook',label:'내 기록',icon:BookOpen},
  { href: '/shop', label: '상점', icon: ShoppingBag },
];
const routes = new Set(['/player-notebook','/online', '/decks', '/collection', '/shop', '/packs', '/daily-quests', '/attendance', '/cosmetics']);
export function GameNavigation() {
  const [location] = useLocation();
  if (!routes.has(location)) return null;
  return <nav className="ko-game-navigation" aria-label="게임 화면 이동">
    {destinations.map(({ href, label, icon: Icon }) => <Link key={href} href={href}
      aria-current={location === href ? 'page' : undefined}>
      <Icon size={18} aria-hidden="true" /><span>{label}</span>
    </Link>)}
  </nav>;
}
