"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { setAvatar } from "@/lib/actions";
import { FaceSvg } from "./Face";
import { Icon } from "./icons";
import { useToast } from "./Toast";

/**
 * The big profile picture. For the admin it is a button: clicking opens a
 * dialog with alternative faces, a click on one saves it right away.
 */
export function AvatarPicker({
  playerId,
  name,
  seed,
  choices,
  canEdit,
}: {
  playerId: string;
  name: string;
  seed: string;
  choices: string[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(seed);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const choose = (next: string) => {
    const prev = current;
    setCurrent(next);
    start(async () => {
      const res = await setAvatar(playerId, next);
      if (res.error) {
        setCurrent(prev);
        toast.push({ text: res.error, tone: "error" });
        return;
      }
      toast.push({ text: `New face for ${name}`, tone: "ok" });
      setOpen(false);
      router.refresh();
    });
  };


  const picture = (
    <FaceSvg
      seed={current}
      title={name}
      className="h-24 w-24 rounded-full ring-1 ring-line/70"
    />
  );
  if (!canEdit) return picture;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative group rounded-full shrink-0"
        title="Change avatar"
        aria-haspopup="dialog"
      >
        {picture}
        <span className="absolute -bottom-0.5 -right-0.5 grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-fg shadow ring-2 ring-bg group-hover:brightness-110 transition">
          <Icon name="edit" className="h-4 w-4" />
        </span>
      </button>

      {/* The page column animates with a transform, which would trap a fixed overlay; the dialog renders on <body> instead.
          `open` can only become true after a click, so `document` exists by then. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm fade-up"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Choose an avatar"
          >
            <div
              className="card max-w-2xl w-full max-h-[85vh] flex flex-col gap-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-4">
                <FaceSvg
                  seed={current}
                  title={name}
                  className="h-16 w-16 rounded-full ring-1 ring-line/70 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="card-title">Pick a face for {name}</h2>
                  <p className="text-sm text-muted">
                    Click one to save it. The same pick looks the same on every
                    screen.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-muted hover:text-fg text-2xl leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 overflow-y-auto p-1 -m-1">
                {[seed, ...choices.filter((s) => s !== seed)].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={pending}
                    onClick={() => choose(s)}
                    className={`rounded-2xl p-1.5 border transition hover:border-accent/70 hover:bg-accent/10 disabled:opacity-60 ${s === current ? "border-accent bg-accent/10" : "border-line"}`}
                    title={s === seed ? "Current face" : "Use this face"}
                  >
                    <FaceSvg seed={s} className="h-full w-full rounded-full" />
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-end gap-3 pt-1">
                <span className="text-xs text-muted">
                  {pending ? "Saving…" : "Esc to close"}
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
