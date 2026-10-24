export type CatalogFilters = { ownership: 'ALL' | 'OWNED' | 'UNOWNED'; rarity: string; tag: string; cost: string };
export const EMPTY_CATALOG_FILTERS: CatalogFilters = { ownership: 'ALL', rarity: 'ALL', tag: 'ALL', cost: 'ALL' };
type CatalogCard = { quantity?: number; rarity: string; tags?: string[]; cost: number };
export function matchesCatalogFilters(card: CatalogCard, filters: CatalogFilters) {
  if (filters.ownership === 'OWNED' && (card.quantity ?? 0) <= 0) return false;
  if (filters.ownership === 'UNOWNED' && (card.quantity ?? 0) > 0) return false;
  return (filters.rarity === 'ALL' || card.rarity === filters.rarity) &&
    (filters.tag === 'ALL' || (card.tags ?? []).includes(filters.tag)) &&
    (filters.cost === 'ALL' || card.cost === Number(filters.cost));
}
export function CardCatalogFilters({ cards, value, onChange }: { cards: CatalogCard[]; value: CatalogFilters; onChange: (value: CatalogFilters) => void }) {
  const tags = [...new Set(cards.flatMap(card => card.tags ?? []).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'));
  const costs = [...new Set(cards.map(card => card.cost))].sort((a,b) => a-b);
  const controls: [keyof CatalogFilters, string, [string,string][]][] = [
    ['ownership', '보유 여부', [['ALL','전체 보유 상태'],['OWNED','보유'],['UNOWNED','미보유']]],
    ['rarity', '등급', [['ALL','전체 등급'],['NORMAL','NORMAL'],['EPIC','EPIC'],['LEGENDARY','LEGENDARY']]],
    ['tag', '태그', [['ALL','전체 태그'], ...tags.map(tag => [tag,tag] as [string,string])]],
    ['cost', '코스트', [['ALL','전체 코스트'], ...costs.map(cost => [String(cost),String(cost)] as [string,string])]],
  ];
  return <div className="ko-catalog-filters grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="카드 분류">
    {controls.map(([key,label,options]) => <label key={key} className="min-w-0 text-xs text-neutral-300">{label}
      <select aria-label={label} value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.value })} className="mt-1 block min-h-11 w-full min-w-0 rounded border border-neutral-700 bg-neutral-950 px-2 text-base text-white">
        {options.map(([id,text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </label>)}
    <div className="ko-filter-summary" aria-label="적용 중인 분류">{controls.filter(([key]) => value[key] !== "ALL").map(([key,label,options]) => <button key={key} type="button" aria-label={`${label} 필터 해제`} onClick={() => onChange({ ...value, [key]: "ALL" })}>{label}: {options.find(([id]) => id === value[key])?.[1]} ×</button>)}</div>
    <button type="button" disabled={Object.entries(EMPTY_CATALOG_FILTERS).every(([key, initial]) => value[key as keyof CatalogFilters] === initial)} onClick={() => onChange({ ...EMPTY_CATALOG_FILTERS })} className="min-h-11 rounded border border-neutral-700 px-3 text-sm text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed">분류 초기화</button>
  </div>;
}
