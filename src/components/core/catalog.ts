import type { Tier } from "./types";

export type MapInfo = {
  uuid: string;
  displayName: string;
  splash: string | null;
  mapUrl?: string | null;
};

export type AgentInfo = {
  uuid: string;
  displayName: string;
  displayIcon: string | null;
  fullPortrait: string | null;
  backgroundGradientColors?: string[];
  role?: { displayName?: string } | null;
};

export type ActInfo = {
  uuid: string;
  displayName: string;
  type: string;
  startTime: string;
  endTime: string;
};

let tierRequest: Promise<Record<number, Tier>> | undefined;
let mapRequest: Promise<Record<string, MapInfo>> | undefined;
let actRequest: Promise<ActInfo[]> | undefined;
let agentListRequest: Promise<AgentInfo[]> | undefined;
const agents = new Map<string, Promise<AgentInfo>>();
const tierKey = "clarity.catalog.tiers";
const tierAge = 86_400_000;

export function getTiers() {
  const cached = readTiers();
  if (cached && Date.now() - cached.saved < tierAge) {
    return Promise.resolve(cached.tiers);
  }

  const request = () =>
    fetch("https://valorant-api.com/v1/competitivetiers")
      .then(read<{ tiers?: Tier[] }[]>)
      .then(({ data }) => {
        const sets = data ?? [];
        const tiers = sets[sets.length - 1]?.tiers ?? sets[0]?.tiers ?? [];
        const result = Object.fromEntries(tiers.map((tier) => [tier.tier, tier]));
        writeTiers(result);
        return result;
      });

  if (cached) {
    if (!tierRequest) {
      tierRequest = request()
        .catch(() => cached.tiers)
        .finally(() => {
          tierRequest = undefined;
        });
    }
    return tierRequest;
  }

  return (tierRequest ??= request().finally(() => {
    tierRequest = undefined;
  }));
}

export function getActs() {
  return (actRequest ??= fetch("https://valorant-api.com/v1/seasons")
    .then(read<ActInfo[]>)
    .then(({ data }) => data ?? [])
    .catch((error: unknown) => {
      actRequest = undefined;
      throw error;
    }));
}

function readTiers() {
  try {
    const value = JSON.parse(localStorage.getItem(tierKey) ?? "null") as {
      saved?: number;
      tiers?: Record<number, Tier>;
    } | null;
    return value?.saved && value.tiers
      ? { saved: value.saved, tiers: value.tiers }
      : null;
  } catch {
    return null;
  }
}

function writeTiers(tiers: Record<number, Tier>) {
  try {
    localStorage.setItem(tierKey, JSON.stringify({ saved: Date.now(), tiers }));
  } catch {}
}

export function getMaps() {
  return (mapRequest ??= fetch("https://valorant-api.com/v1/maps")
    .then(read<MapInfo[]>)
    .then(({ data }) =>
      Object.fromEntries(
        (data ?? []).map((map) => [map.uuid.toLowerCase(), map]),
      ),
    )
    .catch((error: unknown) => {
      mapRequest = undefined;
      throw error;
    }));
}

export function getAgent(id: string) {
  const cached = agents.get(id);
  if (cached) return cached;

  const request = fetch(`https://valorant-api.com/v1/agents/${id}`)
    .then(read<AgentInfo>)
    .then(({ data }) => {
      if (!data) throw new Error("VALORANT agent data is missing");
      return data;
    })
    .catch((error: unknown) => {
      agents.delete(id);
      throw error;
    });
  agents.set(id, request);
  return request;
}

export function getAgents() {
  return (agentListRequest ??= fetch(
    "https://valorant-api.com/v1/agents?isPlayableCharacter=true",
  )
    .then(read<AgentInfo[]>)
    .then(({ data }) => data ?? [])
    .catch((error: unknown) => {
      agentListRequest = undefined;
      throw error;
    }));
}

async function read<T>(response: Response) {
  if (!response.ok) throw new Error("VALORANT catalog request failed");
  return response.json() as Promise<{ data?: T }>;
}
