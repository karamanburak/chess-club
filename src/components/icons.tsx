import type { SVGProps } from "react";

/**
 * The club's mark: a knight's head, drawn as one solid shape so it stays
 * crisp at 16px in the header and at 400px as a watermark.
 */
export function KnightMark({ className = "", ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden {...rest}>
      <path d="M17 94h66v-7c0-2-1.5-3-3.5-3H74c3.5-14 5-30-3-44-2.5-4.5-6-8-10-10.5l-2-14-7 8-9-6-.5 10c-9 3-16 10-20.5 18.5-2 4-3.5 8-3 11 .5 3 3 4.5 6 4l7-1.5c2.5-.5 4.5-2 6-4 1.5 8-1 16-6 23-1.5 2-2 3.5-2 5.5H20.5c-2 0-3.5 1-3.5 3v7z" />
      <circle cx="52" cy="36" r="3.2" fill="var(--knight-eye, var(--accent))" />
      <circle cx="23.5" cy="52.5" r="1.7" fill="var(--knight-eye, var(--accent))" />
    </svg>
  );
}

export type IconName = "crown" | "pawn" | "rook" | "users" | "list" | "chart" | "trophy" | "sun" | "moon" | "shield" | "swords" | "flag" | "shuffle" | "download" | "edit" | "pin" | "refresh" | "chevron" | "tv";

/** Small line icons, all on the same 24px grid and stroke, so the header reads as one family. */
export function Icon({ name, className = "h-4 w-4", ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, "aria-hidden": true, ...rest };
  switch (name) {
    case "tv":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "crown":
      return (
        <svg {...common}>
          <path d="M3 18h18M4 17l-1-9 5 4 4-7 4 7 5-4-1 9" />
        </svg>
      );
    case "pawn":
      return (
        <svg {...common}>
          <circle cx="12" cy="6.5" r="2.5" />
          <path d="M9.5 11h5M10 11c0 3-1.5 5-3 7h10c-1.5-2-3-4-3-7M5 21h14" />
        </svg>
      );
    case "rook":
      return (
        <svg {...common}>
          <path d="M6 21h12M7 18h10M8 18V9h8v9M7 9V4h2.5v2h5V4H17v5" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 4.5a3.2 3.2 0 0 1 0 6.4M18 14.5c2 .8 3 2.6 3 5.5" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...common}>
          <path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9.5 17h5" />
        </svg>
      );
    case "sun":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common}>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6l8-3z" />
        </svg>
      );
    case "swords":
      return (
        <svg {...common}>
          <path d="M4 4l11 11M20 4L9 15M6 18l-2 2M18 18l2 2M4 14l6 6M20 14l-6 6" />
        </svg>
      );
    case "flag":
      return (
        <svg {...common}>
          <path d="M5 21V4M5 4h12l-2 4 2 4H5" />
        </svg>
      );
    case "shuffle":
      return (
        <svg {...common}>
          <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 20h4l11-11-4-4L4 16v4zM13 7l4 4" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="M12 22v-6M8 16h8l-1-5 2-2V5H7v4l2 2-1 5z" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
        </svg>
      );
  }
}
