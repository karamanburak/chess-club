"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useToast } from "./Toast";

/**
 * Shows a one-off message carried in the URL (?flash=...) as a toast, then
 * removes it from the address bar. Server actions use this to report
 * validation errors without crashing to the error page.
 */
export function Flash() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const flash = params.get("flash");
  const notice = params.get("notice");

  useEffect(() => {
    if (!flash && !notice) return;
    if (flash) toast.push({ text: flash, tone: "error" });
    if (notice) toast.push({ text: notice, tone: "ok" });
    const rest = new URLSearchParams(params.toString());
    rest.delete("flash");
    rest.delete("notice");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash, notice]);

  return null;
}
