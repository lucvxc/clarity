import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import Glass from "../ui/glass";
import Select from "../ui/select";
import Skeleton from "../ui/skeleton";

type Progress = { id: string; objectives: Record<string, number>; complete: boolean };
type Definition = {
  uuid: string;
  title: string | null;
  displayName: string | null;
  type: string;
  xpGrant: number;
  objectives: { objectiveUuid: string; value: number }[];
};
type Mission = { id: string; title: string; xp: number; done: number; goal: number; complete: boolean; type: string };

let catalog: Promise<Definition[]> | null = null;
function definitions() {
  return (catalog ??= fetch("https://valorant-api.com/v1/missions")
    .then((response) => {
      if (!response.ok) throw new Error("Mission catalog unavailable");
      return response.json() as Promise<{ data: Definition[] }>;
    })
    .then((result) => result.data)
    .catch((error) => { catalog = null; throw error; }));
}

function Missions({ subject }: { subject: string | null }) {
  const [kind, setKind] = useState<"weekly" | "daily">("weekly");
  const [items, setItems] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!subject) {
      setItems([]);
      setLoading(true);
      setError(false);
      return;
    }
    let active = true;
    async function load() {
      try {
        const [progress, data] = await Promise.all([
          invoke<Progress[]>("missions"),
          definitions(),
        ]);
        if (!active) return;
        setError(false);
        const byId = new Map(data.map((item) => [item.uuid.toLowerCase(), item]));
        setItems(progress.flatMap((row) => {
          const info = byId.get(row.id.toLowerCase());
          if (!info) return [];
          const progress = Object.fromEntries(Object.entries(row.objectives).map(([id, value]) => [id.toLowerCase(), value]));
          const goal = info.objectives.reduce((sum, objective) => sum + objective.value, 0);
          const done = info.objectives.reduce((sum, objective) =>
            sum + Math.min(progress[objective.objectiveUuid.toLowerCase()] ?? 0, objective.value), 0);
          return [{
            id: row.id,
            title: info.title || info.displayName || "Mission",
            xp: info.xpGrant,
            done,
            goal,
            complete: row.complete || (goal > 0 && done >= goal),
            type: info.type.toLowerCase(),
          }];
        }));
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    setLoading(true);
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 300_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [subject]);

  const visible = items
    .filter((item) => item.type.endsWith(kind))
    .sort((a, b) => Number(a.complete) - Number(b.complete));

  return (
    <Glass className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium text-zinc-100">Challenges</p>
        <Select label="Challenge type" value={kind} onChange={setKind} options={[
          { label: "Weekly", value: "weekly" },
          { label: "Daily", value: "daily" },
        ]} />
      </div>
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 rounded-md" />)}</div>
      ) : error ? (
        <p className="py-4 text-center text-[11px] text-zinc-500">Couldn’t load challenges. Clarity will retry shortly.</p>
      ) : visible.length ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {visible.map((item) => <div key={item.id} className="rounded-md bg-white/[0.035] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium text-zinc-100">{item.title}</p>
              <span className="shrink-0 text-[10px] text-zinc-500">{item.xp.toLocaleString()} XP</span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-400/80 transition-[width] duration-300" style={{ width: `${item.goal ? Math.min(100, item.done / item.goal * 100) : Number(item.complete) * 100}%` }} />
            </div>
            <p className="mt-1.5 text-[10px] tabular-nums text-zinc-400">{item.complete ? "Completed" : `${item.done.toLocaleString()} / ${item.goal.toLocaleString()}`}</p>
          </div>)}
        </div>
      ) : <p className="py-4 text-center text-[11px] text-zinc-500">{subject ? `No active ${kind} challenges` : "Launch VALORANT to see challenges"}</p>}
    </Glass>
  );
}

export default Missions;
