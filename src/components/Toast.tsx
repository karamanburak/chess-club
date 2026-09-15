"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "./I18nProvider";

interface Toast {
  id: number;
  text: string;
  tone: "info" | "ok" | "error";
  undo?: () => void | Promise<void>;
}

interface Ctx {
  push: (t: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<Ctx>({ push: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++counter.current;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.undo ? 7000 : 3500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none no-print">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!toast.undo || busy) return;
    setBusy(true);
    await toast.undo();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (toast.undo && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tone = { info: "border-line", ok: "border-win/40", error: "border-loss/40" }[toast.tone];
  return (
    <div className={`pointer-events-auto fade-up flex items-center gap-3 rounded-xl border ${tone} bg-panel/95 backdrop-blur px-4 py-2.5 text-sm shadow-xl`}>
      <span>{toast.text}</span>
      {toast.undo && (
        <button type="button" onClick={run} disabled={busy} className="btn btn-sm btn-primary">
          {busy ? "…" : t.pairing.undo}
          <span className="kbd ml-1 border-accent-fg/30 text-accent-fg bg-transparent">⌘Z</span>
        </button>
      )}
      <button type="button" onClick={onClose} className="text-muted hover:text-fg text-base leading-none" aria-label={t.pairing.dismiss}>
        ×
      </button>
    </div>
  );
}
