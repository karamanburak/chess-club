/**
 * Player avatars are flat cartoon characters in the spirit of language-app
 * mascots: a round head, a bold hairstyle, simple eyes and mouth, a coloured
 * shirt on a coloured ground. Every feature is picked from the seed's hash,
 * so the same seed draws the same person on every device.
 */
export interface Face {
  bg: string;
  skin: string;
  skinShade: string;
  hair: string;
  /** Shirt colour (kept as `body` for older callers). */
  body: string;
  ink: string;
  head: "round" | "oval" | "wide";
  hairStyle: "short" | "part" | "curly" | "bun" | "long" | "bald" | "spiky" | "cap" | "beanie" | "afro";
  eyes: "dots" | "big" | "wink" | "happy" | "sleepy";
  mouth: "smile" | "grin" | "o" | "neutral" | "smirk";
  brows: "flat" | "raised" | "angry";
  accessory: "none" | "glasses" | "blush" | "beard" | "freckles" | "earring";
  /** Slight head tilt in degrees, -6..6. */
  tilt: number;
}

export const FACE_SIZE = 64;

const BG = ["#e4a93b", "#5ab4ac", "#c26f7a", "#778da9", "#84a98c", "#f2cc8f", "#8c2f39", "#415a77", "#a3b18a", "#e07a5f", "#9a8c98", "#588157", "#d8b365", "#52796f"];
const SKIN: [string, string][] = [
  ["#f9d5b8", "#e9b993"],
  ["#f1c27d", "#d9a65f"],
  ["#e0ac69", "#c48f4d"],
  ["#c68642", "#a66d32"],
  ["#8d5524", "#6e401a"],
  ["#5c3a21", "#442a16"],
  ["#ffdbac", "#efc191"],
  ["#d29c74", "#b57f59"],
];
const HAIR = ["#2b1d14", "#4b2e1e", "#8b5a2b", "#d9a441", "#c94f2c", "#8c8c8c", "#f1e3c6", "#3d5a80", "#b5179e", "#1f1f1f", "#e63946", "#6a994e"];
const SHIRT = ["#3b6ea5", "#d84343", "#2f9e6e", "#f4a261", "#6a4c93", "#1d3557", "#e9c46a", "#ff7b9c", "#2a9d8f", "#f8f4e3", "#264653", "#bc6c25"];

const HEADS: Face["head"][] = ["round", "oval", "wide"];
const HAIRS: Face["hairStyle"][] = ["short", "part", "curly", "bun", "long", "bald", "spiky", "cap", "beanie", "afro"];
const EYES: Face["eyes"][] = ["dots", "big", "wink", "happy", "sleepy"];
const MOUTHS: Face["mouth"][] = ["smile", "grin", "o", "neutral", "smirk"];
const BROWS: Face["brows"][] = ["flat", "raised", "angry"];
const ACCESSORIES: Face["accessory"][] = ["none", "glasses", "blush", "beard", "freckles", "earring", "none", "glasses", "blush"];

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** Splits the hash into independent small numbers so features do not move together. */
function picker(seed: string) {
  let x = hashSeed(seed) || 1;
  return (range: number): number => {
    // xorshift32
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % range;
  };
}

export function face(seed: string): Face {
  const pick = picker(seed);
  const bg = BG[pick(BG.length)];
  const [skin, skinShade] = SKIN[pick(SKIN.length)];
  const hair = HAIR[pick(HAIR.length)];
  let body = SHIRT[pick(SHIRT.length)];
  if (body === bg) body = SHIRT[(SHIRT.indexOf(body) + 1) % SHIRT.length];
  const hairStyle = HAIRS[pick(HAIRS.length)];
  const accessory = ACCESSORIES[pick(ACCESSORIES.length)];
  return {
    bg,
    skin,
    skinShade,
    hair,
    body,
    ink: "#2b1d14",
    head: HEADS[pick(HEADS.length)],
    hairStyle,
    eyes: EYES[pick(EYES.length)],
    mouth: MOUTHS[pick(MOUTHS.length)],
    brows: BROWS[pick(BROWS.length)],
    // A beard on a capped head is fine; a beard plus glasses would crowd the face.
    accessory: accessory === "beard" && hairStyle === "beanie" ? "glasses" : accessory,
    tilt: pick(13) - 6,
  };
}

/** Any short string works as a seed; older files still carry emoji here and keep working. */
export function isAvatar(s: string): boolean {
  return s.length > 0 && s.length <= 40;
}

/** The face a player gets before anyone chooses: derived from their id. */
export function pickAvatar(seed: string): string {
  return seed;
}

export function randomAvatar(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** A stable set of alternatives to choose from on the edit form. */
export function avatarChoices(base: string, count = 24): string[] {
  return Array.from({ length: count }, (_, i) => `${base}#${i + 1}`);
}
