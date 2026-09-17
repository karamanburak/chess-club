"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "./I18nProvider";

const MARGIN = 2;

function QrSvg({ d, view, size, label, className = "" }: { d: string; view: number; size: number | string; label: string; className?: string }) {
  return (
    <svg viewBox={`0 0 ${view} ${view}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={label} className={`rounded-lg bg-white text-black ${className}`}>
      <path d={d} fill="currentColor" transform={`translate(${MARGIN} ${MARGIN})`} />
    </svg>
  );
}

/** Small QR that opens a large copy in a modal, for holding the screen up to a phone across the table. */
export function QrZoom({ d, view, size, text, label }: { d: string; view: number; size: number; text: string; label: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group shrink-0 rounded-lg ring-1 ring-line hover:ring-accent transition cursor-zoom-in" title={t.admin.phones.enlarge} aria-label={t.admin.phones.enlarge}>
        <QrSvg d={d} view={view} size={size} label={label} className="block" />
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="m-auto rounded-2xl border border-line bg-panel p-0 text-fg shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm open:fade-up max-w-[min(92vw,34rem)]"
      >
        {open && (
          <div className="flex flex-col items-center gap-4 p-6">
            <QrSvg d={d} view={view} size="min(80vw, 26rem)" label={label} className="w-[min(80vw,26rem)] h-auto p-3" />
            <code className="font-mono text-sm break-all text-center">{text}</code>
            <p className="text-xs text-muted text-center">{t.admin.phones.hint}</p>
            <button type="button" className="btn" onClick={() => setOpen(false)} autoFocus>
              {t.common.close}
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
