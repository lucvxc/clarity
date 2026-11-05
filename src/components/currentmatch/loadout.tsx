import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MatchPlayer, WeaponLoadout } from "../core/types";

type ItemArt = { name: string; image: string | null };
type Catalog = {
  weapons: Record<string, ItemArt>;
  skins: Record<string, ItemArt>;
  buddies: Record<string, ItemArt>;
};
type Level = {
  uuid: string;
  displayName?: string;
  displayIcon?: string | null;
  fullRender?: string | null;
  displayIcon2?: string | null;
};
type Skin = Level & { levels?: Level[]; chromas?: Level[] };
type Weapon = Level & { skins?: Skin[] };
type Buddy = Level & { levels?: Level[] };
type Reply<T> = { data: T[] };

let catalog: Promise<Catalog> | undefined;
let cachedMatch = "";
let cachedLoadouts: Promise<Record<string, WeaponLoadout[]>> | undefined;

function getLoadouts(matchId: string) {
  if (cachedMatch !== matchId || !cachedLoadouts) {
    cachedMatch = matchId;
    cachedLoadouts = invoke<Record<string, WeaponLoadout[]>>("current_loadouts", {
      matchId,
    }).catch((error) => {
      if (cachedMatch === matchId) cachedLoadouts = undefined;
      throw error;
    });
  }
  return cachedLoadouts;
}

function content<T>(url: string) {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error("VALORANT content unavailable");
    return response.json() as Promise<Reply<T>>;
  });
}

function getCatalog() {
  return (catalog ??= Promise.all([
    content<Weapon>("https://valorant-api.com/v1/weapons"),
    content<Buddy>("https://valorant-api.com/v1/buddies"),
  ])
    .then(([weaponsReply, buddiesReply]) => {
      const weapons: Catalog["weapons"] = {};
      const skins: Catalog["skins"] = {};
      const buddies: Catalog["buddies"] = {};

      for (const weapon of weaponsReply.data) {
        weapons[weapon.uuid.toLowerCase()] = {
          name: weapon.displayName || "Weapon",
          image: weapon.displayIcon || null,
        };
        for (const skin of weapon.skins ?? []) {
          const base: ItemArt = {
            name: skin.displayName || weapon.displayName || "Weapon skin",
            image: skin.displayIcon || skin.levels?.[0]?.displayIcon || null,
          };
          skins[skin.uuid.toLowerCase()] = base;
          for (const level of skin.levels ?? []) {
            skins[level.uuid.toLowerCase()] = {
              name: level.displayName || base.name,
              image: level.displayIcon || base.image,
            };
          }
          for (const chroma of skin.chromas ?? []) {
            skins[chroma.uuid.toLowerCase()] = {
              name: chroma.displayName || base.name,
              image: chroma.fullRender || chroma.displayIcon || base.image,
            };
          }
        }
      }

      for (const buddy of buddiesReply.data) {
        const base: ItemArt = {
          name: buddy.displayName || "Gun buddy",
          image:
            buddy.displayIcon ||
            buddy.levels?.[0]?.displayIcon ||
            buddy.levels?.[0]?.fullRender ||
            null,
        };
        buddies[buddy.uuid.toLowerCase()] = base;
        for (const level of buddy.levels ?? []) {
          buddies[level.uuid.toLowerCase()] = {
            name: level.displayName || base.name,
            image: level.displayIcon || level.fullRender || base.image,
          };
        }
      }

      return { weapons, skins, buddies };
    })
    .catch((error) => {
      catalog = undefined;
      throw error;
    }));
}

function Loadout({
  player,
  matchId,
}: {
  player: MatchPlayer;
  matchId: string;
}) {
  const [items, setItems] = useState<WeaponLoadout[]>([]);
  const [loadoutState, setLoadoutState] = useState<"loading" | "ready" | "error">("loading");
  const [art, setArt] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  const signature = items
    .map((item) => `${item.weaponId}:${item.itemIds.join(",")}`)
    .join("|");

  useEffect(() => {
    let active = true;
    setItems([]);
    setLoadoutState("loading");
    void getLoadouts(matchId)
      .then((all) => {
        if (!active) return;
        setItems(all[player.subject.toLowerCase()] ?? []);
        setLoadoutState("ready");
      })
      .catch(() => { if (active) setLoadoutState("error"); });
    return () => { active = false; };
  }, [matchId, player.subject]);

  useEffect(() => {
    let active = true;
    setArt(null);
    setFailed(false);
    if (!signature) return () => { active = false; };
    void getCatalog()
      .then((value) => { if (active) setArt(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [signature]);

  const loadout = art
    ? items
        .map((item) => {
          const skin = item.itemIds
            .map((id) => art.skins[id.toLowerCase()])
            .find(Boolean);
          const buddy = item.itemIds
            .map((id) => art.buddies[id.toLowerCase()])
            .find(Boolean);
          return {
            id: item.weaponId,
            weapon: art.weapons[item.weaponId.toLowerCase()],
            skin,
            buddy,
          };
        })
        .filter((item) => item.skin || item.buddy)
        .sort((a, b) => (a.weapon?.name || "").localeCompare(b.weapon?.name || ""))
    : [];

  return (
    <div className="border-t border-white/[0.05] bg-[#101010] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium text-zinc-300">
          {player.name}{player.tagLine && <span className="text-zinc-500">#{player.tagLine}</span>}
        </p>
        <span className="text-[9px] text-zinc-600">Equipped skins and buddies</span>
      </div>
      {loadoutState === "loading" ? (
        <p className="py-3 text-center text-[10px] text-zinc-500">Loading player loadout</p>
      ) : loadoutState === "error" ? (
        <p className="py-3 text-center text-[10px] text-zinc-500">Loadout data unavailable</p>
      ) : !items.length ? (
        <p className="py-3 text-center text-[10px] text-zinc-500">
          No loadout data for this player
        </p>
      ) : !art ? (
        <p className="py-3 text-center text-[10px] text-zinc-500">
          {failed ? "Loadout details unavailable" : "Loading loadout"}
        </p>
      ) : loadout.length ? (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {loadout.map((item) => (
            <div key={item.id} className="min-w-0 rounded-md bg-[#181818] px-2 py-1.5">
              <p className="truncate text-[9px] font-medium text-zinc-400" title={item.weapon?.name || "Weapon"}>
                {item.weapon?.name || "Weapon"}
              </p>
              <div className="relative mt-1 flex h-9 items-center justify-center">
                {item.skin?.image ? (
                  <img src={item.skin.image} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                ) : item.weapon?.image ? (
                  <img src={item.weapon.image} alt="" className="max-h-full max-w-full object-contain opacity-60" loading="lazy" />
                ) : null}
                {item.buddy?.image && (
                  <span
                    aria-label={`Gun buddy: ${item.buddy.name}`}
                    className="absolute bottom-0 right-1 flex size-5 items-center justify-center rounded-full bg-[#252525] shadow-sm"
                    role="img"
                    title={item.buddy.name}
                  >
                    <img src={item.buddy.image} alt="" className="size-3.5 object-contain" loading="lazy" />
                  </span>
                )}
              </div>
              <p className="truncate text-[10px] text-zinc-200" title={item.skin?.name}>
                {item.skin?.name || "Skin unavailable"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-3 text-center text-[10px] text-zinc-500">
          No weapon skin or buddy details found
        </p>
      )}
    </div>
  );
}

export default Loadout;
