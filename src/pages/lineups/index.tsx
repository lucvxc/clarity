import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconArrowLeft,
  IconRefresh,
  IconSearchFilled,
  IconUserFilled,
} from "@tabler/icons-react";
import {
  getAgents,
  getMaps,
  type AgentInfo,
  type MapInfo,
} from "../../components/core/catalog";
import Glass from "../../components/ui/glass";
import Select from "../../components/ui/select";
import Spinner from "../../components/ui/spinner";
import {
  abilities,
  agents,
  getLineups,
  imageUrl,
  maps,
  videoUrl,
  type Lineup,
} from "../../components/lineups/data";

const ALL = -1;
const PAGE_SIZE = 30;

function Lineups() {
  const [items, setItems] = useState<Lineup[]>([]);
  const [agentArt, setAgentArt] = useState<Record<string, AgentInfo>>({});
  const [mapArt, setMapArt] = useState<Record<string, MapInfo>>({});
  const [map, setMap] = useState(ALL);
  const [agent, setAgent] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Lineup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [zoomed, setZoomed] = useState<string | null>(null);

  useEffect(() => {
    if (!zoomed) return;
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") setZoomed(null);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [zoomed]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    getLineups(refresh > 0)
      .then((value) => {
        if (active) setItems(value);
      })
      .catch(() => {
        if (active)
          setError("Lineups couldn’t load. Check your connection and try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    void getMaps()
      .then((value) => {
        if (active) setMapArt(value);
      })
      .catch(() => {});

    void getAgents()
      .then((value) => {
        if (active)
          setAgentArt(
            Object.fromEntries(
              value.map((item) => [item.displayName.toLowerCase(), item]),
            ),
          );
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => setShown(PAGE_SIZE), [map, agent, search]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const name = agents[item.agent] ?? "";
      return (
        (map === ALL || item.mapId === map) &&
        (!agent || name.toLowerCase() === agent) &&
        (!query || `${item.name} ${item.description} ${name}`.toLowerCase().includes(query))
      );
    });
  }, [items, map, agent, search]);

  const mapOptions = useMemo(() => {
    const matching = agent
      ? items.filter((item) => agents[item.agent]?.toLowerCase() === agent)
      : items;
    const counts = new Map<number, number>();
    for (const item of matching)
      counts.set(item.mapId, (counts.get(item.mapId) ?? 0) + 1);
    const ids = [...new Set(items.map((item) => item.mapId))].sort(
      (a, b) => a - b,
    );
    return [
      {
        label: "All maps",
        value: ALL,
        count: matching.length,
      },
      ...ids.map((value) => ({
        value,
        label: maps[value] ?? "Unknown map",
        count: counts.get(value) ?? 0,
      })),
    ];
  }, [items, agent]);

  const agentItems = useMemo(
    () =>
      Object.values(agentArt).sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    [agentArt],
  );

  if (selected) {
    const selectedAgent = agentArt[agents[selected.agent]?.toLowerCase()];
    const selectedMap = Object.values(mapArt).find(
      (item) =>
        item.displayName.toLowerCase() === maps[selected.mapId]?.toLowerCase(),
    );
    return (
      <div className="h-full overflow-y-auto px-5 pb-6 pt-11 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
        <div className="mx-auto max-w-6xl space-y-3">
          <button
            className="flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-white"
            onClick={() => setSelected(null)}
            type="button"
          >
            <IconArrowLeft aria-hidden="true" className="size-4" />
            All lineups
          </button>
          <Glass>
            {selectedMap?.splash && (
              <div
                className="absolute inset-0 bg-cover bg-center opacity-[0.08]"
                style={{ backgroundImage: `url(${selectedMap.splash})` }}
              />
            )}
            <div className="relative z-20 p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                {selectedAgent?.displayIcon && (
                  <img
                    alt=""
                    className="size-10 object-contain"
                    src={selectedAgent.displayIcon}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h1 className="mt-1 text-base font-medium text-white">
                    {selected.name}
                  </h1>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
                <div className="grid grid-cols-2 gap-2">
                  {selected.images.map((image, index) => {
                    const source = imageUrl(image);
                    if (!source) return null;
                    return (
                      <button
                        key={`${selected.id}-${image}`}
                        aria-label={`View lineup image ${index + 1} larger`}
                        className="group relative aspect-[1.65] overflow-hidden rounded-md bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                        onClick={() => setZoomed(source)}
                        type="button"
                      >
                        <img
                          alt={`${selected.name}, step ${index + 1}`}
                          className="size-full cursor-zoom-in object-cover"
                          loading="lazy"
                          src={source}
                        />
                        <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                      </button>
                    );
                  })}
                  {!selected.images.some(imageUrl) && (
                    <p className="col-span-2 py-10 text-center text-xs text-zinc-500">
                      No lineup images available.
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  {videoUrl(selected.video) && (
                    <iframe
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="aspect-video w-full rounded-md bg-black/40"
                      loading="lazy"
                      src={videoUrl(selected.video)}
                      title={`${selected.name} video`}
                    />
                  )}
                  {selected.description && (
                    <p className="text-xs leading-5 text-zinc-300">
                      {selected.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Glass>
        </div>
        <ImagePreview image={zoomed} onClose={() => setZoomed(null)} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-5 pb-6 pt-11 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
      <div className="mx-auto max-w-6xl space-y-3">
        <div className="flex justify-end">
          <button
            aria-label="Refresh lineups"
            className="flex size-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            onClick={() => setRefresh((value) => value + 1)}
            type="button"
          >
            <IconRefresh
              aria-hidden="true"
              className={`size-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <Select
          className="w-full"
          fullWidth
          label="Map"
          onChange={setMap}
          options={mapOptions}
          value={map}
        />
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500">Agents</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-color:rgba(255,255,255,0.16)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-track]:bg-transparent">
            <button
              aria-pressed={!agent}
              className={`flex h-[68px] w-[62px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${!agent ? "border-white/20 bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "border-white/[0.06] bg-white/[0.035] text-zinc-400 hover:bg-white/[0.07] hover:text-white"}`}
              onClick={() => setAgent("")}
              type="button"
            >
              <IconUserFilled aria-hidden="true" className="size-8 text-zinc-300" />
              <span className="max-w-full truncate text-[9px]">All</span>
            </button>
            {agentItems.map((item) => {
              const name = item.displayName.toLowerCase();
              const selected = agent === name;
              return (
                <button
                  key={item.uuid}
                  aria-label={item.displayName}
                  aria-pressed={selected}
                  className={`flex h-[68px] w-[62px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${selected ? "border-white/20 bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "border-white/[0.06] bg-white/[0.035] text-zinc-400 hover:bg-white/[0.07] hover:text-white"}`}
                  onClick={() => setAgent(selected ? "" : name)}
                  title={item.displayName}
                  type="button"
                >
                  {item.displayIcon ? (
                    <img
                      alt=""
                      className="size-8 shrink-0 object-contain"
                      loading="lazy"
                      src={item.displayIcon}
                    />
                  ) : (
                    <span className="flex size-8 items-center justify-center rounded bg-white/[0.06] text-xs font-medium text-zinc-300">
                      {item.displayName.slice(0, 1)}
                    </span>
                  )}
                  <span className="max-w-full truncate text-[9px]">
                    {item.displayName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <IconSearchFilled
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500"
            />
            <input
              aria-label="Search lineups"
              className="h-8 w-full rounded-md border border-white/10 bg-white/[0.045] pl-9 pr-3 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-white/20"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search lineups"
              value={search}
            />
          </label>
          <span className="ml-auto text-[10px] tabular-nums text-zinc-500">
            {visible.length} lineups
          </span>
        </div>

        {loading && !items.length ? (
          <div className="flex min-h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : error && !items.length ? (
          <Glass className="p-6 text-center">
            <p className="text-xs text-zinc-300">{error}</p>
            <button
              className="mt-3 text-[11px] text-zinc-400 hover:text-white"
              onClick={() => setRefresh((value) => value + 1)}
              type="button"
            >
              Try again
            </button>
          </Glass>
        ) : visible.length ? (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {visible.slice(0, shown).map((item) => (
                <LineupCard
                  key={item.id}
                  item={item}
                  agent={agentArt[agents[item.agent]?.toLowerCase()]}
                  map={maps[item.mapId] ?? "Unknown map"}
                  onClick={() => setSelected(item)}
                />
              ))}
            </div>
            {visible.length > shown && (
              <div className="flex justify-center pb-2">
                <button
                  className="rounded-md bg-white/[0.05] px-4 py-2 text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white"
                  onClick={() => setShown((value) => value + PAGE_SIZE)}
                  type="button"
                >
                  Show more
                </button>
              </div>
            )}
          </>
        ) : (
          <Glass className="p-6 text-center">
            <p className="text-xs text-zinc-400">
              No lineups match those filters.
            </p>
          </Glass>
        )}
      </div>
      <ImagePreview image={zoomed} onClose={() => setZoomed(null)} />
    </div>
  );
}

function ImagePreview({
  image,
  onClose,
}: {
  image: string | null;
  onClose: () => void;
}) {
  if (!image) return null;

  return createPortal(
    <div
      aria-label="Lineup image preview"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-5 backdrop-blur-sm"
      role="dialog"
    >
      <button
        aria-label="Close image preview"
        className="absolute inset-0 cursor-zoom-out"
        onClick={onClose}
        type="button"
      />
      <img
        alt="Expanded lineup step"
        className="pointer-events-none relative z-10 max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        src={image}
      />
    </div>,
    document.body,
  );
}

function LineupCard({
  item,
  agent,
  map,
  onClick,
}: {
  item: Lineup;
  agent?: AgentInfo;
  map: string;
  onClick: () => void;
}) {
  const image = imageUrl(item.images[0] ?? "");

  return (
    <Glass active={false} className="min-w-0" hoverable>
      <button
        className="relative z-20 flex h-full w-full flex-col text-left"
        onClick={onClick}
        type="button"
      >
        <div className="relative aspect-[1.9] w-full overflow-hidden bg-black/25">
          {image && (
            <img
              alt=""
              className="size-full object-cover"
              loading="lazy"
              src={image}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <span className="absolute bottom-2 left-2 rounded bg-black/45 px-2 py-1 text-[10px] text-white/80">
            {map}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 p-3">
          {agent?.displayIcon && (
            <img
              alt=""
              className="size-8 shrink-0 object-contain"
              loading="lazy"
              src={agent.displayIcon}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-zinc-100">
              {item.name}
            </p>
            <p className="mt-1 truncate text-[10px] text-zinc-500">
              {agents[item.agent] ?? "Agent"} · {abilities[item.agent]?.[item.ability - 1] ?? "Utility"}
            </p>
          </div>
          {videoUrl(item.video) && (
            <span className="text-[10px] text-zinc-500">Video</span>
          )}
        </div>
      </button>
    </Glass>
  );
}

export default Lineups;
