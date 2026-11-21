import {useTagLabels,tagLabel} from '@/lib/tag-labels';
import type { ReactNode } from "react";
import { KEYWORD_LABELS } from "./alt-inspector-utils";
export type CatalogFilters = { ownership: 'ALL' | 'OWNED' | 'UNOWNED'; rarity: string; tag: string; cost: string; keyword?: string };
export const EMPTY_CATALOG_FILTERS: CatalogFilters = { ownership: 'ALL', rarity: 'ALL', tag: 'ALL', cost: 'ALL', keyword: 'ALL' };
type CatalogCard = { quantity?: number; rarity: string; tags?: string[]; cost: number; keywords?: readonly string[] | string[] };
export function matchesCatalogFilters(card: CatalogCard, filters: CatalogFilters) {
  if (filters.ownership === 'OWNED' && (card.quantity ?? 0) <= 0) return false;
  if (filters.ownership === 'UNOWNED' && (card.quantity ?? 0) > 0) return false;
  return (filters.rarity === 'ALL' || card.rarity === filters.rarity) &&
    (filters.tag === 'ALL' || (card.tags ?? []).includes(filters.tag)) &&
    (filters.cost === 'ALL' || card.cost === Number(filters.cost)) &&
    (!filters.keyword || filters.keyword === 'ALL' || (card.keywords ?? []).includes(filters.keyword));
}
export function CardCatalogFilters({ cards, value, onChange, children, label="상세 필터" }: { cards: CatalogCard[]; value: CatalogFilters; onChange: (value: CatalogFilters) => void; children?:ReactNode; label?:string }) {
  const labels=useTagLabels();
  const tags = [...new Set(cards.flatMap(card => card.tags ?? []).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'));
  const costs = [...new Set(cards.map(card => card.cost))].sort((a,b) => a-b);
  const keywords = [...new Set(cards.flatMap(card => [...(card.keywords ?? [])]))].filter(k => (KEYWORD_LABELS as Record<string,string>)[k]).sort((a,b) => (KEYWORD_LABELS as Record<string,string>)[a]!.localeCompare((KEYWORD_LABELS as Record<string,string>)[b]!,'ko'));
  const controls: [keyof CatalogFilters, string, [string,string][]][] = [
    ['ownership', '보유 여부', [['ALL','전체 보유 상태'],['OWNED','보유'],['UNOWNED','미보유']]],
    ['rarity', '등급', [['ALL','전체 등급'],['NORMAL','일반'],['EPIC','에픽'],['LEGENDARY','레전더리'],['CHAMPION','챔피언']]],
    ['tag', '태그', [['ALL','전체 태그'], ...tags.map(tag => [tag,tagLabel(tag,labels)] as [string,string])]],
    ['cost', '코스트', [['ALL','전체 코스트'], ...costs.map(cost => [String(cost),String(cost)] as [string,string])]],
  ];
  const active = Object.values(value).filter(v=>v && v!=="ALL").length;
  const keywordValue = value.keyword ?? 'ALL';
  return <div className="ko-catalog-filter-panel">{keywords.length > 0 && <div className="ko-keyword-filter" role="group" aria-label="키워드로 보기"><p>키워드로 보기</p><div>
    <button type="button" aria-pressed={keywordValue==='ALL'} onClick={()=>onChange({...value,keyword:'ALL'})}>전체</button>
    {keywords.map(k=><button key={k} type="button" aria-pressed={keywordValue===k} onClick={()=>onChange({...value,keyword:keywordValue===k?'ALL':k})}>{(KEYWORD_LABELS as Record<string,string>)[k]}</button>)}
  </div></div>}<div className="grid grid-cols-2 gap-2 py-3" role="group" aria-label="등급·태그로 보기">
    {controls.filter(([key])=>key==='rarity'||key==='tag').map(([key,title,options])=><label key={key} className="min-w-0 text-xs text-neutral-300">{title}{key==='rarity'?'으로':'로'} 보기<select aria-label={title} value={value[key]} onChange={event=>onChange({...value,[key]:event.target.value})} className="mt-1 min-h-11 w-full min-w-0 rounded border border-neutral-700 bg-neutral-950 px-2 text-base text-white">{options.map(([id,text])=><option key={id} value={id}>{text}</option>)}</select></label>)}
  </div><details className="ko-catalog-filter-disclosure"><summary>{label}{active ? ` · ${active}개 적용 중` : ""}</summary><div className="ko-catalog-filters grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="카드 분류">
    {children}
    {controls.filter(([key])=>key!=='rarity'&&key!=='tag').map(([key,label,options]) => <label key={key} className="min-w-0 text-xs text-neutral-300">{label}
      <select aria-label={label} value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.value })} className="mt-1 block min-h-11 w-full min-w-0 rounded border border-neutral-700 bg-neutral-950 px-2 text-base text-white">
        {options.map(([id,text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </label>)}
    <div className="ko-filter-summary" aria-label="적용 중인 분류">{keywordValue!=='ALL'&&<button type="button" aria-label="키워드 필터 해제" onClick={()=>onChange({...value,keyword:'ALL'})}>키워드: {(KEYWORD_LABELS as Record<string,string>)[keywordValue] ?? keywordValue} ×</button>}{controls.filter(([key]) => value[key] !== "ALL").map(([key,label,options]) => <button key={key} type="button" aria-label={`${label} 필터 해제`} onClick={() => onChange({ ...value, [key]: "ALL" })}>{label}: {options.find(([id]) => id === value[key])?.[1]} ×</button>)}</div>
    <button type="button" disabled={Object.entries(EMPTY_CATALOG_FILTERS).every(([key, initial]) => (value[key as keyof CatalogFilters] ?? 'ALL') === initial)} onClick={() => onChange({ ...EMPTY_CATALOG_FILTERS })} className="min-h-11 rounded border border-neutral-700 px-3 text-sm text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed">분류 초기화</button>
  </div></details></div>;
}
