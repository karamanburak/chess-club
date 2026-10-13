"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/lib/actions";
import { useT } from "./I18nProvider";
import { useToast } from "./Toast";

type State = "loading" | "unsupported" | "ios" | "denied" | "off" | "on";

/** The VAPID public key comes as base64url; the browser wants raw bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * "Notifications on this phone" on the player's own profile. Registers public/sw.js, asks the browser for
 * permission only on a tap, and stores the subscription on the player (savePushSubscription). On an iPhone, push
 * works only for the club opened from the home screen, so Safari in a tab gets that hint instead of a button.
 */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const { t } = useT();
  const m = t.players.push;
  const toast = useToast();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      const next: State = !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)
        ? ios && !standalone ? "ios" : "unsupported"
        : Notification.permission === "denied"
          ? "denied"
          : (await (await navigator.serviceWorker.register("/sw.js")).pushManager.getSubscription())
            ? "on"
            : "off";
      if (alive) setState(next);
    })().catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const res = await savePushSubscription(sub.toJSON());
      if (res?.error) {
        toast.push({ text: res.error, tone: "error" });
        return;
      }
      setState("on");
    } catch {
      toast.push({ text: m.failed, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    const res = await sendTestPush();
    setBusy(false);
    toast.push(res?.error ? { text: res.error, tone: "error" } : { text: m.testSent, tone: "ok" });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted -mt-1">{m.hint}</p>
      {state === "ios" && <p className="text-sm">{m.ios}</p>}
      {state === "unsupported" && <p className="text-sm text-muted">{m.unsupported}</p>}
      {state === "denied" && <p className="text-sm text-loss">{m.denied}</p>}
      {state === "off" && (
        <button type="button" className="btn btn-primary self-start" onClick={turnOn} disabled={busy}>
          {m.on}
        </button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-win mr-auto">{m.isOn}</span>
          <button type="button" className="btn btn-sm" onClick={test} disabled={busy}>
            {m.test}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={turnOff} disabled={busy}>
            {m.off}
          </button>
        </div>
      )}
    </div>
  );
}
