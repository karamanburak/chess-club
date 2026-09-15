import { localizedQuote, quoteOfTheDay } from "@/lib/quotes";
import { getT } from "@/lib/lang";

/** The club's daily epigraph: the quote in display italics, the author beneath. */
export async function QuoteOfTheDay({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const { lang } = await getT();
  const q = localizedQuote(quoteOfTheDay(), lang);
  if (size === "sm") {
    return (
      <p className={`text-sm text-muted leading-snug ${className}`}>
        <span className="italic">“{q.text}”</span> <span className="whitespace-nowrap">— {q.by}</span>
      </p>
    );
  }
  return (
    <figure className={`min-w-0 ${className}`}>
      <blockquote className={`font-display italic text-fg/90 ${size === "lg" ? "text-2xl lg:text-3xl leading-snug" : "text-lg md:text-xl leading-snug"}`}>
        “{q.text}”
      </blockquote>
      <figcaption className={`mt-1.5 text-muted tracking-wide ${size === "lg" ? "text-base" : "text-sm"}`}>— {q.by}</figcaption>
    </figure>
  );
}
