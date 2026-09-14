import { quoteOfTheDay } from "@/lib/quotes";

/** The club's daily epigraph: the quote in display italics, the author beneath. */
export function QuoteOfTheDay({ size = "md", className = "" }: { size?: "md" | "lg"; className?: string }) {
  const q = quoteOfTheDay();
  return (
    <figure className={`min-w-0 ${className}`}>
      <blockquote className={`font-display italic text-fg/90 ${size === "lg" ? "text-2xl lg:text-3xl leading-snug" : "text-lg md:text-xl leading-snug"}`}>
        “{q.text}”
      </blockquote>
      <figcaption className={`mt-1.5 text-muted tracking-wide ${size === "lg" ? "text-base" : "text-sm"}`}>— {q.by}</figcaption>
    </figure>
  );
}
