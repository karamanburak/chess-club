import Link from "next/link";
import { getT } from "@/lib/lang";
import { Icon, type IconName } from "./icons";

export type StatsTab = "club" | "hall" | "h2h";

const TABS: { key: StatsTab; href: string; icon: IconName }[] = [
  { key: "club", href: "/stats", icon: "chart" },
  { key: "hall", href: "/hall-of-fame", icon: "trophy" },
  { key: "h2h", href: "/h2h", icon: "swords" },
];

/** The tab bar on top of the three stats pages (one "Stats" entry in the Nav), styled like the Admin tabs. Three equal tabs without icons on phones, so all three labels fit. */
export async function StatsTabs({ active }: { active: StatsTab }) {
  const { t } = await getT();
  const m = t.stats.tabs;
  return (
    <nav aria-label={m.label} className="mb-6 grid grid-cols-3 gap-1 rounded-xl border border-line bg-panel p-1 text-xs sm:text-sm sm:flex no-print">
      {TABS.map(({ key, href, icon }) => {
        const here = key === active;
        return (
          <Link
            key={key}
            href={href}
            aria-current={here ? "page" : undefined}
            className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-2 sm:px-3.5 py-2 transition-colors ${here ? "bg-panel-2 text-fg font-medium" : "text-muted hover:text-fg"}`}
          >
            <Icon name={icon} className={`hidden sm:block h-4 w-4 ${here ? "text-accent" : ""}`} />
            {m[key]}
          </Link>
        );
      })}
    </nav>
  );
}
