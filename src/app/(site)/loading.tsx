import { getT } from "@/lib/lang";

/** Shown while a page renders on the server (every page is dynamic), so a tap on a tab answers at once. */
export default async function Loading() {
  const { t } = await getT();
  return (
    <div role="status" aria-live="polite" className="flex justify-center py-20">
      <span className="h-6 w-6 rounded-full border-2 border-line border-t-accent animate-spin" aria-hidden />
      <span className="sr-only">{t.common.loading}</span>
    </div>
  );
}
