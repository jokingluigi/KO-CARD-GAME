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
      <div className="ko-surface-topline">
        <Link href="/" className="ko-surface-back">
          <ArrowLeft size={17} />
          메인 메뉴
        </Link>
        <span>KO / {eyebrow}</span>
      </div>
      <header className="ko-surface-heading">
        <div>
          <p>{eyebrow}</p>
          <h1>
            {title}
            <span aria-hidden="true">.</span>
          </h1>
          <p>{description}</p>
        </div>
        {aside && <div className="ko-surface-heading__aside">{aside}</div>}
      </header>
      {links && (
        <nav className="ko-surface-tabs" aria-label={`${title} 관련 화면`}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={path === link.href ? "page" : undefined}
            >
              {link.label}
              <ArrowRight size={14} />
            </Link>
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
