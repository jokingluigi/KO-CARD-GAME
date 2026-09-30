import type { Scene, StoryCharacter } from '../../../../lib/game-engine/src/tower/types';

/** The same story presentation is used by real runs and the live admin preview. */
export function TowerDialogueView({ scene, characters, index }: { scene?: Scene; characters: StoryCharacter[]; index: number }) {
  const line = scene?.lines[index];
  const speaker = characters.find(character => character.id === line?.speakerId);
  const actors = (['LEFT', 'RIGHT'] as const).map(side => {
    const lastLine = scene?.lines.slice(0, index + 1).filter(item => item.side === side).at(-1);
    const character = characters.find(item => item.id === lastLine?.speakerId);
    return { side, lastLine, character, sprite: lastLine ? character?.sprites[lastLine.expression] ?? character?.sprites.NEUTRAL : undefined, speaking: line?.side === side };
  });
  return <div className="min-w-0 space-y-5">
    <div className="grid grid-cols-2 items-end gap-3 overflow-hidden">{actors.map(actor => <div key={actor.side} className={`min-w-0 transition-opacity ${actor.speaking ? 'opacity-100' : 'opacity-50'}`}>
      {actor.sprite ? <img src={actor.sprite} alt={actor.character?.displayName ?? ''} className="mx-auto max-h-[38dvh] max-w-full origin-bottom object-contain" style={{ transform: `translate(${actor.lastLine?.spriteOffsetX ?? 0}%, ${actor.lastLine?.spriteOffsetY ?? 0}%) scale(${actor.lastLine?.spriteScale ?? 1})` }} /> : actor.character ? <div className="flex min-h-40 items-center justify-center rounded border border-neutral-700 text-neutral-400">{actor.character.displayName} · 이미지 없음</div> : null}
    </div>)}</div>
    <div className="rounded border border-neutral-700 p-4"><h3 className="font-bold">{speaker?.displayName ?? '이야기'}</h3><p className="mt-3 whitespace-pre-wrap break-words text-lg leading-8">{line?.text ?? '대사를 추가하고 화자를 선택해 주세요.'}</p></div>
  </div>;
}
