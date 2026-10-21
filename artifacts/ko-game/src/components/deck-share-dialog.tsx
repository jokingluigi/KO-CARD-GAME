import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { CardRenderer } from './card-renderer';
import { CardDetailDialog } from './card-detail-dialog';
import { decodeDeck, deckShareLink, encodeDeck, type SharedDeck } from '@/lib/deck-share-code';
import { inspectSharedDeck } from '@/lib/deck-share-validation';
import type { Deck, DeckCard, DeckChampion, DeckOptions } from '@/lib/decks-client';
import { saveDeck } from '@/lib/decks-client';

export function DeckShareDialog({ mode, snapshot, initialCode, options, onClose, onImported }: {
  mode: 'share' | 'import' | null; snapshot: SharedDeck | null; initialCode: string;
  options: DeckOptions; onClose: () => void; onImported: (deck: Deck) => void;
}) {
  const [input, setInput] = useState(''), [preview, setPreview] = useState<SharedDeck | null>(null);
  const [catalog, setCatalog] = useState<DeckChampion[]>([]), [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<DeckCard | null>(null);
  const [reloadCatalog, setReloadCatalog] = useState(0);
  useEffect(() => {
    setError(''); setNotice(''); setDetail(null); setInput(initialCode);
    if (mode === 'share') setPreview(snapshot);
    else if (mode === 'import' && initialCode) {
      try { setPreview(decodeDeck(initialCode)); } catch (e) { setPreview(null); setError((e as Error).message); }
    } else setPreview(null);
  }, [mode, snapshot, initialCode]);
  const knownChampion = options.champions.some(c => c.id === preview?.championId);
  // Only an import with an unowned champion needs the existing public catalog.
  // It is metadata, never a shared-deck lookup. Cancel it when the dialog closes.
  useEffect(() => {
    setCatalog([]); setCatalogError('');
    if (mode !== 'import' || !preview || knownChampion) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/champions`, { credentials: 'include', signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(body => { if (!controller.signal.aborted) setCatalog(body.champions.filter((c: DeckChampion) => c.status === 'PUBLISHED')); })
      .catch(() => { if (controller.signal.reason !== 'closed') setCatalogError('챔피언 정보를 불러오지 못했습니다. 다시 시도해주세요.'); })
      .finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort('closed'); };
  }, [mode, preview, knownChampion, reloadCatalog]);
  const check = useMemo(() => preview ? inspectSharedDeck(preview, options, [...options.champions, ...catalog]) : null, [preview, options, catalog]);
  const code = preview ? encodeDeck(preview) : '';
  const link = code ? deckShareLink(code, window.location.origin, import.meta.env.BASE_URL) : '';
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('복사했습니다.'); }
    catch { setNotice('자동 복사를 사용할 수 없습니다. 입력칸을 길게 눌러 전체 선택 후 복사해주세요.'); }
  }
  async function addDeck() {
    if (!preview || !check || check.ruleIssues.length || check.ownershipIssues.length || saving) return;
    setSaving(true); setError('');
    try {
      // Always POST a fresh owned deck. Never use a source deck/account ID from a code.
      const result = await saveDeck({ name: preview.name, championDefinitionId: preview.championId, cardDefinitionIds: preview.cards.flatMap(c => Array(c.count).fill(c.id)) });
      if (!result.deck) throw new Error('저장된 덱을 확인하지 못했습니다.');
      onImported(result.deck);
    } catch (e) { setError(e instanceof Error ? e.message : '덱을 추가하지 못했습니다.'); }
    finally { setSaving(false); }
  }
  return <>
    <Dialog open={mode !== null} onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-24px)] max-w-2xl overflow-y-auto border-[#6d5b3c] bg-neutral-950 text-[#f0e8d8]">
        <DialogHeader><DialogTitle>{mode === 'share' ? '덱 공유' : '덱 가져오기'}</DialogTitle><DialogDescription>코드에 덱 구성이 담겨 있습니다. 카드는 지급되지 않으며 저장 시 보유 수량을 다시 확인합니다.</DialogDescription></DialogHeader>
        {mode === 'import' && <div className="space-y-2">
          <label htmlFor="deck-code-input">덱 코드 또는 공유 링크</label>
          <textarea id="deck-code-input" data-testid="deck-code-input" className="min-h-24 w-full rounded border border-neutral-700 bg-black p-3 text-base" maxLength={7000} value={input} onChange={e => setInput(e.target.value)} />
          <button className="ko-decks__secondary-action min-h-11" data-testid="button-preview-deck-code" onClick={() => { setError(''); setNotice(''); try { setPreview(decodeDeck(input)); } catch (e) { setPreview(null); setError((e as Error).message); } }}>덱 미리보기</button>
        </div>}
        {error && <p role="alert" className="text-red-300">{error}</p>}
        {preview && check && <section className="space-y-4" data-testid="deck-share-preview">
          <h3 className="text-xl">{preview.name} · {check.total}장</h3>
          <div className="flex items-center gap-3">
            {check.champion?.imageUrl && <img alt={check.champion.name} src={check.champion.imageUrl} className="h-28 w-20 object-contain" />}
            <p>{check.champion?.name ?? '사용할 수 없는 챔피언'}</p>
          </div>
          {!!check.ruleIssues.length && <div role="alert" className="text-red-300">{check.ruleIssues.map((s, i) => <p key={i}>{s}</p>)}</div>}
          {mode === 'import' && !!check.ownershipIssues.length && <div data-testid="deck-share-missing" className="text-amber-300"><p>부족한 카드를 확보한 뒤 저장할 수 있습니다.</p>{check.ownershipIssues.map(s => <p key={s}>{s}</p>)}</div>}
          {!!check.changed.length && <p className="text-amber-300">공유 이후 정보가 변경된 항목: {check.changed.join(', ')}. 아래에는 현재 효과를 표시합니다.</p>}
          {catalogError && <p role="alert">{catalogError} <button className="underline" onClick={() => setReloadCatalog(n => n + 1)}>다시 시도</button></p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {check.rows.map(({ id, count, card }) => <div key={id} className="min-w-0">
              {card ? <button type="button" className="w-full text-left" onClick={() => setDetail(card)} aria-label={`${card.name} 카드 정보`}>
                <CardRenderer cardId={id} name={card.name} cardType={card.cardType} cost={card.cost} attack={card.attack} health={card.health} rulesText={card.text} keywords={card.keywords} keywordConfig={card.effectConfig} imageUrl={card.imageUrl} rarity={card.rarity as 'NORMAL' | 'EPIC' | 'LEGENDARY'} imageDisplaySettings={{ imageDisplayMode: card.imageDisplayMode as 'COVER' | 'CONTAIN' | 'CUSTOM', imageScale: card.imageScale, imagePositionX: card.imagePositionX, imagePositionY: card.imagePositionY }} size="admin" className="w-full" />
                <p className="break-words text-sm">{card.name} ×{count}</p>
              </button> : <p className="break-all text-sm">사용 불가: {id} ×{count}</p>}
            </div>)}
          </div>
          {mode === 'share' ? <div className="space-y-3">
            <label className="block">공유 코드<textarea aria-label="공유 코드" readOnly value={code} className="mt-1 min-h-24 w-full rounded border border-neutral-700 bg-black p-2 text-base" /></label>
            <button className="ko-decks__secondary-action min-h-11" onClick={() => copy(code)}>코드 복사</button>
            <label className="block">공유 링크<input aria-label="공유 링크" readOnly value={link} className="mt-1 w-full rounded border border-neutral-700 bg-black p-2 text-base" /></label>
            <button className="ko-decks__secondary-action min-h-11" onClick={() => copy(link)}>링크 복사</button>
          </div> : <button className="ko-decks__primary-action min-h-11 w-full" data-testid="button-import-shared-deck" disabled={saving || !!check.ruleIssues.length || !!check.ownershipIssues.length} onClick={addDeck}>{saving ? '저장 중...' : '내 덱에 추가'}</button>}
        </section>}
        {notice && <p role="status">{notice}</p>}
      </DialogContent>
    </Dialog>
    <CardDetailDialog card={detail} open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }} />
  </>;
}
