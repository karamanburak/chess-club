import Link from "next/link";
import { getT } from "@/lib/lang";
import { Empty } from "./ui";

/** The 404 body, in the viewer's language: for notFound() on a page and for unknown addresses. */
export async function NotFoundCard() {
  const { t } = await getT();
  return (
    <div className="card max-w-xl mx-auto mt-10">
      <Empty icon="pawn" title={t.common.notFoundTitle}>
        <p className="mb-4">{t.common.notFoundText}</p>
        <Link href="/" className="btn btn-primary">
          {t.common.backHome}
        </Link>
      </Empty>
    </div>
  );
}
