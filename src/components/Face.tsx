import { face, FACE_SIZE, hashSeed } from "@/lib/avatar";

/** The drawn avatar, sized by its parent. Pure SVG, works in server and client components. */
export function FaceSvg({ seed, className = "", title }: { seed: string; className?: string; title?: string }) {
  const f = face(seed);
  const id = `c${hashSeed(seed).toString(36)}`;
  const s = FACE_SIZE;
  const [rx, ry] = f.head === "round" ? [15, 15.5] : f.head === "oval" ? [13.5, 17] : [16.5, 14.5];
  const cx = 32;
  const cy = 29;
  const top = cy - ry; // top of the head
  const eyeY = cy - 1.5;
  const eyeL = cx - 6;
  const eyeR = cx + 6;
  const mouthY = cy + 8;
  const ink = f.ink;
  const white = "#fffaf0";

  const hairBack = f.hairStyle === "long" ? <rect x={cx - rx - 2} y={top + 6} width={(rx + 2) * 2} height={ry * 2 + 8} rx={12} fill={f.hair} /> : null;
  const hairFront = (() => {
    const capTop = `M${cx - rx} ${cy - 2} C${cx - rx} ${top - 4} ${cx + rx} ${top - 4} ${cx + rx} ${cy - 2} C${cx + rx * 0.6} ${top + 5} ${cx - rx * 0.6} ${top + 5} ${cx - rx} ${cy - 2}Z`;
    switch (f.hairStyle) {
      case "short":
      case "long":
        return <path d={capTop} fill={f.hair} />;
      case "part":
        return (
          <>
            <path d={capTop} fill={f.hair} />
            <path d={`M${cx - rx} ${cy - 2} C${cx - rx + 4} ${top + 2} ${cx + 4} ${top + 3} ${cx + rx - 1} ${cy - 5} L${cx + rx} ${top + 4} C${cx} ${top - 2} ${cx - rx} ${top} ${cx - rx} ${cy - 2}Z`} fill={f.hair} />
          </>
        );
      case "curly":
        return (
          <>
            {[-2, -1, 0, 1, 2].map((i) => (
              <circle key={i} cx={cx + i * (rx / 2.3)} cy={top + 1 + Math.abs(i)} r={5.5} fill={f.hair} />
            ))}
            <path d={capTop} fill={f.hair} />
          </>
        );
      case "afro":
        return (
          <>
            <circle cx={cx} cy={cy - 6} r={rx + 7} fill={f.hair} />
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={f.skin} />
          </>
        );
      case "bun":
        return (
          <>
            <circle cx={cx} cy={top - 3} r={6} fill={f.hair} />
            <path d={capTop} fill={f.hair} />
          </>
        );
      case "spiky":
        return <polygon points={`${cx - rx} ${cy - 2} ${cx - rx + 3} ${top - 6} ${cx - 7} ${top + 2} ${cx - 2} ${top - 9} ${cx + 3} ${top + 1} ${cx + 8} ${top - 7} ${cx + rx - 2} ${top + 2} ${cx + rx} ${cy - 2}`} fill={f.hair} />;
      case "cap":
        return (
          <>
            <path d={`M${cx - rx - 1} ${cy - 3} C${cx - rx - 1} ${top - 5} ${cx + rx + 1} ${top - 5} ${cx + rx + 1} ${cy - 3}Z`} fill={f.body} />
            <rect x={cx - rx - 6} y={cy - 5} width={rx * 2 + 6} height={4} rx={2} fill={f.body} />
            <rect x={cx - rx - 1} y={cy - 6} width={rx * 2 + 2} height={3} fill={ink} opacity={0.25} />
          </>
        );
      case "beanie":
        return (
          <>
            <path d={`M${cx - rx - 1} ${cy - 1} C${cx - rx - 1} ${top - 6} ${cx + rx + 1} ${top - 6} ${cx + rx + 1} ${cy - 1}Z`} fill={f.body} />
            <rect x={cx - rx - 1} y={cy - 6} width={rx * 2 + 2} height={5} rx={1.5} fill={f.body} stroke={ink} strokeOpacity={0.2} />
            <circle cx={cx} cy={top - 5} r={3.5} fill={white} />
          </>
        );
      case "bald":
      default:
        return null;
    }
  })();

  const brows = (() => {
    const w = 5;
    const y = eyeY - 5.5;
    if (f.brows === "raised") {
      return (
        <>
          <path d={`M${eyeL - w / 2} ${y + 1} q${w / 2} -2.5 ${w} 0`} stroke={ink} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <path d={`M${eyeR - w / 2} ${y + 1} q${w / 2} -2.5 ${w} 0`} stroke={ink} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </>
      );
    }
    if (f.brows === "angry") {
      return (
        <>
          <path d={`M${eyeL - w / 2} ${y - 1} l${w} 1.5`} stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
          <path d={`M${eyeR + w / 2} ${y - 1} l${-w} 1.5`} stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
        </>
      );
    }
    return (
      <>
        <path d={`M${eyeL - w / 2} ${y} h${w}`} stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
        <path d={`M${eyeR - w / 2} ${y} h${w}`} stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
      </>
    );
  })();

  const eyes = (() => {
    switch (f.eyes) {
      case "big":
        return (
          <>
            <circle cx={eyeL} cy={eyeY} r={3.4} fill={white} />
            <circle cx={eyeR} cy={eyeY} r={3.4} fill={white} />
            <circle cx={eyeL + 0.8} cy={eyeY + 0.4} r={1.8} fill={ink} />
            <circle cx={eyeR + 0.8} cy={eyeY + 0.4} r={1.8} fill={ink} />
          </>
        );
      case "wink":
        return (
          <>
            <circle cx={eyeL} cy={eyeY} r={2} fill={ink} />
            <path d={`M${eyeR - 3} ${eyeY} h6`} stroke={ink} strokeWidth={1.8} strokeLinecap="round" />
          </>
        );
      case "happy":
        return (
          <>
            <path d={`M${eyeL - 3} ${eyeY + 1} q3 -4 6 0`} stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
            <path d={`M${eyeR - 3} ${eyeY + 1} q3 -4 6 0`} stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
          </>
        );
      case "sleepy":
        return (
          <>
            <path d={`M${eyeL - 3} ${eyeY - 1} q3 3 6 0`} stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
            <path d={`M${eyeR - 3} ${eyeY - 1} q3 3 6 0`} stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
          </>
        );
      case "dots":
      default:
        return (
          <>
            <circle cx={eyeL} cy={eyeY} r={2} fill={ink} />
            <circle cx={eyeR} cy={eyeY} r={2} fill={ink} />
          </>
        );
    }
  })();

  const mouth = (() => {
    switch (f.mouth) {
      case "grin":
        return (
          <>
            <path d={`M${cx - 6} ${mouthY - 1} q6 8 12 0z`} fill={ink} />
            <rect x={cx - 4} y={mouthY - 0.5} width={8} height={2.2} fill={white} />
          </>
        );
      case "o":
        return <ellipse cx={cx} cy={mouthY + 0.5} rx={2.2} ry={2.6} fill={ink} />;
      case "neutral":
        return <path d={`M${cx - 4.5} ${mouthY} h9`} stroke={ink} strokeWidth={1.8} strokeLinecap="round" />;
      case "smirk":
        return <path d={`M${cx - 4} ${mouthY} q4 3.5 8 -1`} stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
      case "smile":
      default:
        return <path d={`M${cx - 5.5} ${mouthY - 1} q5.5 5 11 0`} stroke={ink} strokeWidth={1.9} fill="none" strokeLinecap="round" />;
    }
  })();

  const accessory = (() => {
    switch (f.accessory) {
      case "glasses":
        return (
          <g fill="none" stroke={ink} strokeWidth={1.4} opacity={0.85}>
            <circle cx={eyeL} cy={eyeY} r={5} />
            <circle cx={eyeR} cy={eyeY} r={5} />
            <path d={`M${eyeL + 5} ${eyeY} h${eyeR - eyeL - 10}`} />
          </g>
        );
      case "blush":
        return (
          <>
            <circle cx={eyeL - 2} cy={eyeY + 6} r={2.6} fill="#f28b82" opacity={0.55} />
            <circle cx={eyeR + 2} cy={eyeY + 6} r={2.6} fill="#f28b82" opacity={0.55} />
          </>
        );
      case "beard":
        return <path d={`M${cx - rx + 2} ${cy + 2} q${rx - 2} ${ry + 4} ${(rx - 2) * 2} 0 v6 q${-(rx - 2)} 9 ${-(rx - 2) * 2} 0z`} fill={f.hair} />;
      case "freckles":
        return (
          <g fill={ink} opacity={0.45}>
            {[-4, -2, 0].map((d) => (
              <circle key={`l${d}`} cx={eyeL - 2 + d} cy={eyeY + 5.5 + Math.abs(d) * 0.3} r={0.8} />
            ))}
            {[0, 2, 4].map((d) => (
              <circle key={`r${d}`} cx={eyeR + 2 + d} cy={eyeY + 5.5 + Math.abs(d - 2) * 0.3} r={0.8} />
            ))}
          </g>
        );
      case "earring":
        return <circle cx={cx + rx + 0.5} cy={cy + 4} r={1.6} fill="#e4a93b" />;
      default:
        return null;
    }
  })();

  return (
    <svg viewBox={`0 0 ${s} ${s}`} className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id={id}>
          <circle cx={s / 2} cy={s / 2} r={s / 2} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width={s} height={s} fill={f.bg} />
        <g transform={`rotate(${f.tilt} ${cx} ${cy})`}>
          {hairBack}
          {/* shoulders and shirt */}
          <path d={`M8 ${s + 2} C8 ${s - 16} 18 ${cy + 15} ${cx} ${cy + 15} C${s - 18} ${cy + 15} ${s - 8} ${s - 16} ${s - 8} ${s + 2}Z`} fill={f.body} />
          {/* neck */}
          <rect x={cx - 5} y={cy + ry - 6} width={10} height={12} rx={3} fill={f.skinShade} />
          {/* ears */}
          <circle cx={cx - rx} cy={cy + 1} r={3.2} fill={f.skin} />
          <circle cx={cx + rx} cy={cy + 1} r={3.2} fill={f.skin} />
          {/* head */}
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={f.skin} />
          {f.hairStyle !== "afro" && hairFront}
          {f.hairStyle === "afro" && hairFront}
          {f.accessory === "beard" && accessory}
          {brows}
          {eyes}
          {mouth}
          {f.accessory !== "beard" && accessory}
        </g>
      </g>
    </svg>
  );
}
