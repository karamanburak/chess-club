/**
 * Where a `?next=` or a Referer may send the browser after an action: a path on this site only.
 * `//evil.example` and `/\evil.example` are read by browsers as another host, so anything that is not
 * a single leading slash followed by a normal path character falls back.
 */
export function localPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Control characters (tab, newline) are stripped by browsers, so "/\t/evil.example" would become "//evil.example".
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
