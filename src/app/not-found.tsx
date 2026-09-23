import { NotFoundCard } from "@/components/NotFoundCard";

/** Unknown addresses: outside the (site) group, so there is no header; the card links back home. */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 flex-1">
      <NotFoundCard />
    </main>
  );
}
