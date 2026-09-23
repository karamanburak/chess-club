import { logout } from "@/lib/actions";
import { fmt } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { ADMIN_HOURS } from "@/lib/tokens";
import { Icon } from "./icons";
import { SubmitButton } from "./SubmitButton";

/**
 * A slim strip under the header while this device is signed in as admin, so nobody forgets it on a borrowed phone.
 * Leaving admin mode keeps the player this device claimed ("this is me").
 */
export async function AdminBanner() {
  const { t } = await getT();
  return (
    <div className="border-b border-win/30 bg-win/5 text-xs no-print">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1.5">
        <span className="flex min-w-0 items-center gap-2 text-win">
          <Icon name="shield" className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="font-medium sm:hidden">{t.nav.adminBannerShort}</span>
          <span className="hidden sm:inline">{fmt(t.nav.adminBanner, { hours: ADMIN_HOURS })}</span>
        </span>
        <form action={logout}>
          <SubmitButton className="btn btn-sm btn-ghost text-xs" pendingText="…">
            {t.nav.adminSignOut}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
