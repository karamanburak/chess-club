import Link from "next/link";
import { localPath } from "@/lib/safe-path";
import { Icon, type IconName } from "@/components/icons";
import { readDb } from "@/lib/db";
import { adminConfigured, isAdmin } from "@/lib/auth";
import { logout } from "@/lib/actions";
import { checkHealth } from "@/lib/health";
import { getT } from "@/lib/lang";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";
import { AdminRecover, AdminSetup, AdminSignIn } from "@/components/admin/AdminGate";
import { AdminClubTab } from "@/components/admin/AdminClubTab";
import { AdminDataTab } from "@/components/admin/AdminDataTab";
import { AdminSecurityTab } from "@/components/admin/AdminSecurityTab";
import { AdminBanner } from "@/components/admin/shared";

export const dynamic = "force-dynamic";

const TONES: Record<string, "error" | "ok"> = {
  wrong: "error",
  locked: "error",
  short: "error",
  mismatch: "error",
  nofile: "error",
  badjson: "error",
  changed: "ok",
  saved: "ok",
  imported: "ok",
  restored: "ok",
  club: "ok",
  member: "ok",
  memberoff: "ok",
  switched: "ok",
  codeshort: "error",
  codemismatch: "error",
  season: "ok",
  "reset-everything": "ok",
  "reset-history": "ok",
  "reset-tournaments": "ok",
  "reset-sessions": "ok",
  "reset-friendlies": "ok",
  snapshot: "ok",
  merged: "ok",
  everyoneout: "ok",
  recovered: "ok",
  noreset: "error",
  badtoken: "error",
};

const TABS = ["club", "data", "security"] as const;
type AdminTab = (typeof TABS)[number];
const isTab = (x: unknown): x is AdminTab => typeof x === "string" && (TABS as readonly string[]).includes(x);
const TAB_ICONS: Record<AdminTab, IconName> = { club: "crown", data: "download", security: "shield" };
/** After an action redirects with ?ok=/?error=, open the tab its card lives on. */
const MESSAGE_TAB: Record<string, AdminTab> = {
  saved: "club",
  club: "club",
  season: "club",
  imported: "data",
  restored: "data",
  snapshot: "data",
  merged: "data",
  nofile: "data",
  badjson: "data",
  "reset-everything": "data",
  "reset-history": "data",
  "reset-tournaments": "data",
  "reset-sessions": "data",
  "reset-friendlies": "data",
  changed: "security",
  short: "security",
  mismatch: "security",
  wrong: "security",
  member: "security",
  memberoff: "security",
  switched: "club",
  codeshort: "security",
  codemismatch: "security",
  everyoneout: "security",
};

/** The admin page: setup, sign-in and recovery before, then three tabs (src/components/admin/*). */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const { t } = await getT();
  const a = t.admin;
  const msgKey = typeof sp.error === "string" ? sp.error : typeof sp.ok === "string" ? sp.ok : null;
  const msg = msgKey && msgKey in TONES ? { tone: TONES[msgKey], text: a.messages[msgKey as keyof typeof a.messages] } : null;

  if (!(await adminConfigured())) return <AdminSetup msg={msg} />;
  if (!(await isAdmin())) return sp.recover === "1" ? <AdminRecover msg={msg} /> : <AdminSignIn msg={msg} next={localPath(sp.next, "")} />;

  const db = await readDb();
  // Which tab: explicit ?tab=, else the tab the last action's message belongs to, else Club.
  const tab: AdminTab = isTab(sp.tab) ? sp.tab : msgKey && msgKey in MESSAGE_TAB ? MESSAGE_TAB[msgKey] : "club";
  const tabHref = (key: AdminTab) => (key === "club" ? "/admin" : `/admin?tab=${key}`);
  const health = checkHealth(db, a.health.problems);

  return (
    <>
      <PageHeader
        eyebrow={a.eyebrow}
        title={a.title}
        subtitle={<span>{a.subtitle}</span>}
        actions={
          <form action={logout}>
            <SubmitButton className="btn">{a.signOut}</SubmitButton>
          </form>
        }
      />
      {msg && (
        <div className="mb-6 max-w-xl">
          <AdminBanner msg={msg} />
        </div>
      )}

      <nav aria-label={a.tabs.label} className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1 text-sm no-print">
        {TABS.map((key) => (
          <Link
            key={key}
            href={tabHref(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 transition-colors ${tab === key ? "bg-panel-2 text-fg font-medium" : "text-muted hover:text-fg"}`}
          >
            <Icon name={TAB_ICONS[key]} className={`h-4 w-4 ${tab === key ? "text-accent" : ""}`} />
            {a.tabs[key]}
            {key === "data" && health.problems.length > 0 && <span className="badge border-loss/40 text-loss">{health.problems.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "club" && <AdminClubTab db={db} />}
      {tab === "data" && <AdminDataTab db={db} health={health} />}
      {tab === "security" && <AdminSecurityTab db={db} query={sp} />}
    </>
  );
}
