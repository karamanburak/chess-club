"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the server components of the current page every few seconds while the tab is
 * visible, so a result entered on one phone shows up on every other screen without a reload.
 * Pure re-render: form state, scroll position and any running PairingReveal are kept.
 */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const ms = Math.max(3, seconds) * 1000;
    const tick = () => {
      if (document.hidden) return;
      // Don't yank a menu or a half-typed form out from under someone's fingers.
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      router.refresh();
    };
    const id = setInterval(tick, ms);
    const onVisible = () => !document.hidden && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);
  return null;
}
