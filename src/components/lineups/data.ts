export type Lineup = {
  id: string;
  name: string;
  description: string;
  agent: number;
  ability: number;
  mapId: number;
  images: string[];
  video: string;
};

export const maps: Record<number, string> = {
  1: "Ascent",
  2: "Bind",
  3: "Breeze",
  4: "Haven",
  5: "Icebox",
  6: "Split",
  7: "Fracture",
  8: "Pearl",
  9: "Lotus",
  10: "Sunset",
  11: "Abyss",
  12: "Summit",
};

export const agents: Record<number, string> = {
  2: "Breach",
  3: "Brimstone",
  4: "Cypher",
  6: "Killjoy",
  11: "Sage",
  13: "Sova",
  14: "Viper",
  16: "KAY/O",
  18: "Fade",
  20: "Gekko",
};

export const abilities: Record<number, string[]> = {
  2: ["Aftershock"],
  3: ["Incendiary"],
  4: ["Trapwire", "Cyber Cage", "Spycam"],
  6: ["Nanoswarm"],
  11: ["Barrier Orb", "Slow Orb"],
  13: ["Recon Bolt", "Shock Bolt"],
  14: ["Snake Bite", "Poison Cloud"],
  16: ["FRAG-ment", "ZERO-point", "FLASH-drive"],
  18: ["Haunt", "Seize"],
  20: ["Mosh Pit", "Wingman", "Dizzy"],
};

const url = "https://uh5it8zn19.execute-api.us-east-1.amazonaws.com/development";
const key = "clarity.lineups";
const age = 86_400_000;
let request: Promise<Lineup[]> | undefined;

export function getLineups(refresh = false) {
  const cached = read();
  if (!refresh && cached && Date.now() - cached.saved < age)
    return Promise.resolve(cached.items);
  if (request) return request;

  request = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Lineup request failed (${response.status})`);
      return response.json() as Promise<unknown>;
    })
    .then((value) => {
      if (!Array.isArray(value)) throw new Error("Lineup data is unavailable");
      const items = value.filter(isLineup);
      if (value.length && !items.length) throw new Error("Lineup data is invalid");
      write(items);
      return items;
    })
    .catch((error: unknown) => {
      if (cached) return cached.items;
      throw error;
    })
    .finally(() => {
      request = undefined;
    });
  return request;
}

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as {
      saved?: number;
      items?: unknown;
    } | null;
    if (value?.saved && Array.isArray(value.items)) {
      const items = value.items.filter(isLineup);
      if (items.length === value.items.length)
        return { saved: value.saved, items };
    }
  } catch {}
  return null;
}

function write(items: Lineup[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ saved: Date.now(), items }));
  } catch {}
}

function isLineup(value: unknown): value is Lineup {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.description === "string" &&
    typeof item.agent === "number" &&
    Number.isFinite(item.agent) &&
    typeof item.ability === "number" &&
    Number.isFinite(item.ability) &&
    typeof item.mapId === "number" &&
    Number.isFinite(item.mapId) &&
    Array.isArray(item.images) &&
    item.images.every((image) => typeof image === "string") &&
    typeof item.video === "string"
  );
}

export function imageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function videoUrl(value: string) {
  const id = value.trim();
  return /^[\w-]{11}$/.test(id)
    ? `https://www.youtube-nocookie.com/embed/${id}`
    : "";
}
