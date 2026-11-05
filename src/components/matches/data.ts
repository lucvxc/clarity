import { invoke } from "@tauri-apps/api/core";
import type { MatchDetails } from "../core/types";

const limit = 24;
const rankRetry = 20_000;
const prefix = "clarity:match:v4:";
const cache = new Map<string, Promise<MatchDetails>>();
const values = new Map<string, { data: MatchDetails; saved: number }>();

function key(id: string) {
  return id.trim().toLowerCase();
}

function touch<T>(items: Map<string, T>, id: string, value: T) {
  items.delete(id);
  items.set(id, value);
  while (items.size > limit) {
    const oldest = items.keys().next().value;
    if (!oldest) break;
    items.delete(oldest);
    try {
      sessionStorage.removeItem(prefix + oldest);
    } catch {}
  }
}

function needsRank(data: MatchDetails) {
  const deathmatch = [data.queue, data.mode].some((value) => {
    const mode = value?.toLowerCase() ?? "";
    return mode.includes("deathmatch") || mode.includes("hurm");
  });
  return deathmatch && data.players.some((player) => !player.hidden && player.tier == null);
}

function read(id: string) {
  try {
    const raw = sessionStorage.getItem(prefix + id);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as { data?: MatchDetails; saved?: number };
    return value.data && Array.isArray(value.data.players) && value.saved
      ? value as { data: MatchDetails; saved: number }
      : undefined;
  } catch {
    return undefined;
  }
}

function saved(id: string) {
  const value = values.get(id) ?? read(id);
  if (!value) return undefined;
  if (needsRank(value.data) && Date.now() - value.saved >= rankRetry) {
    values.delete(id);
    try {
      sessionStorage.removeItem(prefix + id);
    } catch {}
    return undefined;
  }
  touch(values, id, value);
  return value;
}

export function getDetails(id: string) {
  const match = key(id);
  if (!match) return Promise.reject(new Error("Missing match ID"));

  const cached = cache.get(match);
  if (cached) {
    touch(cache, match, cached);
    return cached;
  }

  const value = saved(match);
  if (value) {
    return Promise.resolve(value.data);
  }

  const request = invoke<MatchDetails>("match_details", { matchId: id })
    .then((value) => {
      const entry = { data: value, saved: Date.now() };
      touch(values, match, entry);
      try {
        sessionStorage.setItem(prefix + match, JSON.stringify(entry));
      } catch {}
      return value;
    })
    .finally(() => {
      if (cache.get(match) === request) cache.delete(match);
    });

  touch(cache, match, request);
  return request;
}

export function getCachedDetails(id: string) {
  const match = key(id);
  return saved(match)?.data;
}

export function prefetchDetails(id: string) {
  if (id) void getDetails(id).catch(() => {});
}
