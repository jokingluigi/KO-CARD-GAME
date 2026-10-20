import { createContext, useContext, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

const ArtworkContext = createContext<((name: string, imageUrl: string, fallbackImageUrl?:string|null) => void) | null>(null);

export function FullArtworkProvider({ children }: { children: ReactNode }) {
  const [artwork, setArtwork] = useState<{ name: string; imageUrl: string;fallbackImageUrl?:string|null } | null>(null);
  return <ArtworkContext.Provider value={(name, imageUrl,fallbackImageUrl) => setArtwork({ name, imageUrl,fallbackImageUrl })}>
    {children}
    <ArtworkDialog name={artwork?.name ?? ''} imageUrl={artwork?.imageUrl} fallbackImageUrl={artwork?.fallbackImageUrl} open={artwork !== null}
      onOpenChange={(nextOpen) => { if (!nextOpen) setArtwork(null); }} />
  </ArtworkContext.Provider>;
}

function ArtworkDialog({ name, imageUrl,fallbackImageUrl, open, onOpenChange }: {
  name: string; imageUrl?: string | null;fallbackImageUrl?:string|null; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent overlayClassName="!z-[250]" className="!z-[260] flex max-h-[96dvh] max-w-[min(96vw,1050px)] flex-col items-center border-neutral-700 bg-neutral-950 p-3 text-white">
      <DialogTitle className="self-start text-sm">{name} · 풀 일러스트</DialogTitle>
      {imageUrl && <img key={imageUrl} src={imageUrl} alt={`${name} 전체 일러스트`} className="max-h-[86dvh] max-w-full object-contain" onError={event=>{const image=event.currentTarget;if(fallbackImageUrl&&image.dataset.fallback!=="true"){image.dataset.fallback="true";image.src=fallbackImageUrl;}else image.hidden=true;}} />}
    </DialogContent>
  </Dialog>;
}

/** Artwork opens from the illustration area without changing the card frame. */
export function FullCardArtwork({ name, imageUrl,fallbackImageUrl, children }: {
  name: string;
  imageUrl?: string | null;
  fallbackImageUrl?:string|null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openShared = useContext(ArtworkContext);
  return <>
    <div className="relative mx-auto w-full max-w-[320px]">
      {children}
      {imageUrl && <button type="button" aria-label={`${name} 풀 일러스트 보기`}
        className="pointer-events-auto absolute left-[12%] right-[12%] top-[16%] bottom-[34%] z-40 cursor-zoom-in rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
        onClick={(event) => { event.stopPropagation(); if (openShared) openShared(name, imageUrl,fallbackImageUrl); else setOpen(true); }} />}
    </div>
    {!openShared && <ArtworkDialog name={name} imageUrl={imageUrl} fallbackImageUrl={fallbackImageUrl} open={open} onOpenChange={setOpen} />}
  </>;
}
