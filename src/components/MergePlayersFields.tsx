"use client";

import { useState } from "react";
import type { PickablePlayer } from "@/lib/pick";
import { PlayerPicker } from "./PlayerPicker";
import { useT } from "./I18nProvider";

/** The two sides of a merge; whoever is chosen on one side disappears from the other. */
export function MergePlayersFields({ players }: { players: PickablePlayer[] }) {
  const { t } = useT();
  const a = t.admin.merge;
  const [fromId, setFromId] = useState<string | null>(null);
  const [intoId, setIntoId] = useState<string | null>(null);
  return (
    <>
      <div>
        <label className="label">{a.from}</label>
        <PlayerPicker name="fromId" players={players} value={fromId} onChange={setFromId} exclude={intoId ? [intoId] : []} showGames tone="loss" />
      </div>
      <div>
        <label className="label">{a.into}</label>
        <PlayerPicker name="intoId" players={players} value={intoId} onChange={setIntoId} exclude={fromId ? [fromId] : []} showGames />
      </div>
    </>
  );
}
