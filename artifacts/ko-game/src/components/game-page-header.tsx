import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ArrowRight } from "lucide-react";
import "./player-surfaces.css";
export const REWARD_PAGE_LINKS = [
  { href: "/daily-quests", label: "퀘스트" },
  { href: "/attendance", label: "출석 보드" },
];
export const SHOP_PAGE_LINKS = [
  { href: "/shop", label: "상점" },
  { href: "/packs", label: "내 팩" },
];
export function GamePageHeader({
  eyebrow,
  title,
  description,
  aside,
  links,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
  links?: Array<{ href: string; label: string }>;
}) {
  const [path] = useLocation();
  return (
    <>
      <header className="lux-head lux-pagehead">
        <Link href="/" className="lux-back" aria-label="메인 메뉴로"><ArrowLeft size={16} />메인</Link>
        <div className="lux-pagehead__titles">
          <h1 className="lux-title">{title}</h1>
          {description && <p className="lux-sub">{description}</p>}
        </div>
        {aside && <div className="lux-pagehead__aside">{aside}</div>}
      </header>
      {links && (
        <nav className="lux-tabs" aria-label={`${title} 관련 화면`}>
          {links.map((link) => (
            <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}>{link.label}</Link>
          ))}
        </nav>
      )}
    </>
  );
}
export function SurfaceEmpty({
  title,
  children,
  href,
  label,
}: {
  title: string;
  children: ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <section className="ko-surface-empty">
      <span aria-hidden="true">KO</span>
      <h2>{title}</h2>
      <p>{children}</p>
      {href && (
        <Link href={href} className="ko-surface-action">
          {label}
          <ArrowRight size={16} />
        </Link>
      )}
    </section>
  );
}
