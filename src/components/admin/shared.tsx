/** Pieces the admin tabs share. Server components only. */

/** The ?ok= / ?error= line an admin action redirects back with. */
export function AdminBanner({ msg }: { msg: { tone: "error" | "ok"; text: string } | null }) {
  if (!msg) return null;
  return (
    <div role={msg.tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm border ${msg.tone === "error" ? "border-loss/40 bg-loss/10 text-loss" : "border-win/40 bg-win/10 text-win"}`}>
      {msg.text}
    </div>
  );
}
