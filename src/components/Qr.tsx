import QRCode from "qrcode";
import { QrZoom } from "./QrZoom";

/**
 * A QR code as inline SVG, computed server-side with the `qrcode` package. The dark modules are
 * one path in `currentColor`; `QrZoom` draws it small and, on click, large in a modal.
 */
export function qrPath(text: string): { d: string; view: number } {
  const code = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = code.modules.size;
  const cells: string[] = [];
  for (let y = 0; y < n; y++) {
    let run = 0;
    for (let x = 0; x <= n; x++) {
      const dark = x < n && code.modules.get(y, x) === 1;
      if (dark) run++;
      else if (run) {
        cells.push(`M${x - run} ${y}h${run}v1h-${run}z`);
        run = 0;
      }
    }
  }
  const margin = 2;
  return { d: cells.join(""), view: n + margin * 2 };
}

export function Qr({ text, size = 160, label }: { text: string; size?: number; label?: string }) {
  const { d, view } = qrPath(text);
  return <QrZoom d={d} view={view} size={size} text={text} label={label ?? text} />;
}
