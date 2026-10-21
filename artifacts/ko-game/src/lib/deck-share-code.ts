/** Self-contained public deck snapshots. CRC detects damage, not authenticity. No I/O. */
export type SharedDeck = {
  name: string;
  championId: string;
  championRevision: number;
  cards: { id: string; count: number; revision: number }[];
};
const PREFIX = 'KO1.';
const MAX_BYTES = 4096;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const invalid = () => new Error('덱 코드가 손상되었거나 올바르지 않습니다. 코드를 다시 복사해주세요.');
export function checksum(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Hash only public display/rule fields; no identity, ownership, or private metadata. */
export function deckEntityRevision(entity: Record<string, unknown>): number {
  return checksum(encoder.encode(JSON.stringify([
    entity.name, entity.cardType, entity.cost, entity.attack, entity.health,
    entity.rarity, entity.text, entity.keywords, entity.tags, entity.effectConfig,
    entity.maxHealth, entity.abilityName, entity.abilityCost, entity.abilityText,
    entity.hasQuest, entity.questText, entity.questRewardText, entity.upgradedAbilityText,
  ])));
}
function validate(deck: SharedDeck) {
  if (!deck || typeof deck.name !== 'string' || !deck.name.trim() || deck.name !== deck.name.trim() || [...deck.name].length > 30 || /[\u0000-\u001f\u007f]/u.test(deck.name)) throw invalid();
  const idOk = (id: unknown) => typeof id === 'string' && id.length > 0 && encoder.encode(id).length <= 128 && !/[\s\u0000-\u001f\u007f]/u.test(id);
  const revOk = (n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 0xffffffff;
  if (!idOk(deck.championId) || !revOk(deck.championRevision) || !Array.isArray(deck.cards) || deck.cards.length < 1 || deck.cards.length > 25) throw invalid();
  const seen = new Set<string>();
  let total = 0;
  for (const card of deck.cards) {
    if (!card || !idOk(card.id) || seen.has(card.id) || !Number.isInteger(card.count) || card.count < 1 || card.count > 25 || !revOk(card.revision)) throw invalid();
    seen.add(card.id); total += card.count;
  }
  if (total !== 25) throw new Error('공유 덱에는 정확히 25장이 필요합니다.');
}
export function encodeDeck(deck: SharedDeck): string {
  validate(deck);
  const bytes: number[] = [1];
  const u32 = (value: number) => { for (let i = 0; i < 4; i++) bytes.push((value >>> (i * 8)) & 255); };
  const str = (value: string) => { const b = encoder.encode(value); bytes.push(b.length, ...b); };
  const id = (value: string) => {
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) {
      bytes.push(0, ...value.replaceAll('-', '').match(/../g)!.map(n => parseInt(n, 16)));
    } else { bytes.push(1); str(value); }
  };
  str(deck.name); id(deck.championId); u32(deck.championRevision); bytes.push(deck.cards.length);
  for (const card of [...deck.cards].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    id(card.id); bytes.push(card.count); u32(card.revision);
  }
  u32(checksum(new Uint8Array(bytes)));
  if (bytes.length > MAX_BYTES) throw invalid();
  return PREFIX + btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function extractDeckCode(input: string): string {
  if (input.length > 7000) throw invalid();
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    try { return new URLSearchParams(new URL(value).hash.slice(1)).get('deck') ?? ''; }
    catch { throw invalid(); }
  }
  return value;
}
export function decodeDeck(input: string): SharedDeck {
  const code = extractDeckCode(input);
  if (/^KO\d+\./.test(code) && !code.startsWith(PREFIX)) throw new Error('지원하지 않는 덱 코드 버전입니다. 게임을 새로고침해주세요.');
  if (!code.startsWith(PREFIX) || code.length > 5500 || !/^[A-Za-z0-9_-]+$/.test(code.slice(4))) throw invalid();
  try {
    const body = code.slice(4), binary = atob(body.replaceAll('-', '+').replaceAll('_', '/'));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    if (bytes.length < 12 || bytes.length > MAX_BYTES) throw invalid();
    const end = bytes.length - 4;
    const view = new DataView(bytes.buffer);
    if (checksum(bytes.slice(0, end)) !== view.getUint32(end, true)) throw invalid();
    let offset = 0;
    const take = (n: number) => { if (offset + n > end) throw invalid(); const value = bytes.slice(offset, offset + n); offset += n; return value; };
    const byte = () => take(1)[0]!;
    const u32 = () => { const b = take(4); return new DataView(b.buffer).getUint32(0, true); };
    const str = () => decoder.decode(take(byte()));
    const id = () => {
      const kind = byte();
      if (kind === 1) return str();
      if (kind !== 0) throw invalid();
      const s = Array.from(take(16), n => n.toString(16).padStart(2, '0')).join('');
      return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
    };
    if (byte() !== 1) throw invalid();
    const deck: SharedDeck = { name: str(), championId: id(), championRevision: u32(), cards: [] };
    const count = byte();
    if (count > 25) throw invalid();
    for (let i = 0; i < count; i++) deck.cards.push({ id: id(), count: byte(), revision: u32() });
    if (offset !== end) throw invalid();
    validate(deck);
    // Reject alternative/noncanonical base64 encodings as well as duplicate records.
    if (encodeDeck(deck) !== code) throw invalid();
    return deck;
  } catch (error) { throw error instanceof Error && error.message.includes('25장') ? error : invalid(); }
}
export function deckShareLink(code: string, origin: string, base = '/') {
  decodeDeck(code);
  return new URL(`${base.replace(/\/$/, '')}/decks#deck=${code}`, origin).href;
}
