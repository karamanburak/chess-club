"use client";

import type { PickablePlayer } from "@/lib/pick";
import { PlayerPicker } from "./PlayerPicker";

/** The challenge form's opponent: a PlayerPicker writing to `toId`. */
export function OpponentPicker({ players, defaultValue }: { players: PickablePlayer[]; defaultValue?: string }) {
  return <PlayerPicker name="toId" players={players} defaultValue={defaultValue} />;
}
