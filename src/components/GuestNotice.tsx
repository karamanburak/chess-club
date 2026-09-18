import Link from "next/link";
import { Icon } from "./icons";
import { getT } from "@/lib/lang";

/** Shown to a device that neither claimed a player nor signed in as admin, where the page hides its controls. */
export async function GuestNotice({ className = "" }: { className?: string }) {
  const { t } = await getT();
  return (
    <Link href="/me" className={`card flex items-center gap-3 border-line bg-panel-2/40 text-sm hover:border-accent/60 transition-colors no-print ${className}`}>
      <Icon name="users" className="h-5 w-5 text-accent shrink-0" />
      <span>
        {t.common.guestBrowse} <span className="text-accent font-medium whitespace-nowrap">{t.common.whoAreYou} →</span>
      </span>
    </Link>
  );
}
