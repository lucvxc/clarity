import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Image } from "@tauri-apps/api/image";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { getFontEmbedCSS, toBlob } from "html-to-image";
import { IconCameraFilled, IconRefresh } from "@tabler/icons-react";
import Spinner from "../../components/ui/spinner";
import { useToast } from "../../components/ui/toast";
import type { Account } from "../../components/core/types";

type Offer = { id: string; price: number | null; discount: number | null };
type Accessory = { id: string; kind: string; price: number | null };
type Bundle = { id: string; price: number | null; left: number };
type Shop = {
  bundles: Bundle[];
  offers: Offer[];
  night: Offer[];
  accessories: Accessory[];
  vp: number | null;
  kc: number | null;
  offersLeft: number;
  bundlesLeft: number;
  nightLeft: number;
  accessoriesLeft: number;
};
type Skin = { uuid: string; displayName: string; displayIcon: string | null; contentTierUuid?: string | null };
type BundleArt = { uuid: string; displayName: string; displayIcon: string | null; displayIcon2: string | null };
type Tier = { uuid: string; displayName: string; highlightColor: string; displayIcon: string | null };
type Art = { skins: Record<string, Skin>; bundles: Record<string, BundleArt>; tiers: Record<string, Tier> };
const VP_ICON = "https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png";
const KC_ICON = "https://media.valorant-api.com/currencies/85ca954a-41f2-ce94-9b45-8ca3dd39a00d/displayicon.png";
const ACCESSORY: Record<string, string> = {
  "3f296c07-64c3-494c-923b-fe692a4fa1bd": "playercards",
  "dd3bf334-87f3-40bd-b043-682a57a8dc3a": "buddies",
  "d5f120f8-ff8c-4aac-92ea-f2b5acbe9475": "sprays",
  "de7caa6b-adf7-4588-bbd1-143831e786c6": "playertitles",
};
const cosmetics = new Map<string, Promise<{ name: string; image: string | null } | null>>();

let catalog: Promise<Art> | undefined;
function getArt() {
  return (catalog ??= Promise.all([
    fetch("https://valorant-api.com/v1/weapons").then(read),
    fetch("https://valorant-api.com/v1/bundles").then(read),
    fetch("https://valorant-api.com/v1/contenttiers").then(read),
  ]).then(([weapons, bundles, tiers]) => {
    const skins: Record<string, Skin> = {};
    for (const weapon of weapons.data ?? []) {
      for (const skin of weapon.skins ?? []) {
        const info = {
          uuid: skin.uuid,
          displayName: skin.displayName,
          displayIcon: skin.displayIcon || skin.levels?.find((level: Skin) => level.displayIcon)?.displayIcon || null,
          contentTierUuid: skin.contentTierUuid,
        } as Skin;
        skins[skin.uuid.toLowerCase()] = info;
        for (const level of skin.levels ?? []) skins[level.uuid.toLowerCase()] = info;
      }
    }
    return {
      skins,
      bundles: Object.fromEntries(((bundles.data ?? []) as BundleArt[]).map((bundle) => [bundle.uuid.toLowerCase(), bundle])),
      tiers: Object.fromEntries(((tiers.data ?? []) as Tier[]).map((tier) => [tier.uuid.toLowerCase(), tier])),
    };
  }).catch((error) => {
    catalog = undefined;
    throw error;
  }));
}

function read(response: Response) {
  if (!response.ok) throw new Error("VALORANT artwork is unavailable");
  return response.json();
}

function getAccessory(item: Accessory) {
  const path = ACCESSORY[item.kind.toLowerCase()];
  if (!path) return Promise.resolve(null);
  const key = `${path}:${item.id.toLowerCase()}`;
  const cached = cosmetics.get(key);
  if (cached) return cached;
  const urls = path === "buddies"
    ? [`https://valorant-api.com/v1/buddies/levels/${item.id}`, `https://valorant-api.com/v1/buddies/${item.id}`]
    : [`https://valorant-api.com/v1/${path}/${item.id}`];
  const request = (async () => {
    for (const url of urls) {
      try {
        const { data } = await fetch(url).then(read);
        if (!data) continue;
        const level = data.levels?.find((entry: { uuid?: string }) => entry.uuid?.toLowerCase() === item.id.toLowerCase());
        const itemData = level || data;
        const name = itemData.displayName || data.displayName || itemData.titleText || data.titleText;
        const image = itemData.displayIcon || itemData.fullTransparentIcon || itemData.fullIcon || itemData.displayIcon2 || data.displayIcon || data.fullTransparentIcon || data.fullIcon || data.levels?.[0]?.displayIcon || null;
        if (name || image) return { name: name || "Accessory", image };
      } catch { /* Try the next supported buddy route. */ }
    }
    return null;
  })();
  cosmetics.set(key, request);
  void request.then((result) => { if (!result) cosmetics.delete(key); });
  return request;
}

function duration(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const clock = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return days ? `${days}d ${clock}` : clock;
}

function Store({ account }: { account: Account | null }) {
  const toast = useToast();
  const capture = useRef<HTMLDivElement>(null);
  const images = useRef(new Map<string, Promise<string>>());
  const fonts = useRef<Promise<string> | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [art, setArt] = useState<Art | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [captureReady, setCaptureReady] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState(Date.now());
  const [featured, setFeatured] = useState(0);
  const [accessoryArt, setAccessoryArt] = useState<Record<string, { name: string; image: string | null }>>({});
  const [accessoriesReady, setAccessoriesReady] = useState(false);
  const accountKey = account ? `${account.gameName}#${account.tagLine}` : "";

  useEffect(() => {
    if (!accountKey) { setShop(null); return; }
    let active = true;
    setLoading(true);
    setError("");
    setAccessoryArt({});
    setAccessoriesReady(false);
    void getArt().then((images) => { if (active) setArt(images); }).catch(() => {});
    void invoke<Shop>("store")
      .then((value) => {
        if (!active) return;
        setShop(value);
        setFeatured(0);
        void Promise.all(value.accessories.map(async (item) => [item.id, await getAccessory(item)] as const))
          .then((items) => { if (active) setAccessoryArt(Object.fromEntries(items.filter((item): item is readonly [string, { name: string; image: string | null }] => item[1] != null).map(([id, info]) => [id, info]))); })
          .catch(() => {})
          .finally(() => { if (active) setAccessoriesReady(true); });
        const time = Date.now();
        setLoaded(time);
        setNow(time);
      })
      .catch((issue) => {
        if (!active) return;
        const message = String(issue);
        setError(message.includes("INTERNAL_UNHANDLED_SERVER_ERROR")
          ? "Riot's store service isn't responding right now. Try Refresh in a little while."
          : message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountKey, refresh]);

  useEffect(() => {
    if (!shop) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [shop]);
  useEffect(() => {
    if (!shop || shop.bundles.length < 2) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        setFeatured((index) => (index + 1) % shop.bundles.length);
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [shop]);
  useEffect(() => {
    const node = capture.current;
    if (!node || !shop || !art || !accessoriesReady) {
      setCaptureReady(false);
      return;
    }
    let active = true;
    setCaptureReady(false);
    fonts.current ??= getFontEmbedCSS(node, { preferredFontFormat: "woff2" }).catch(() => "");
    const urls = Array.from(node.querySelectorAll("img"), (img) => img.src)
      .filter((url) => url && !url.startsWith("data:"));
    void Promise.all([
      fonts.current,
      ...urls.map((url) => {
        let request = images.current.get(url);
        if (!request) {
          request = invoke<string>("store_asset", { url }).catch((error) => {
            images.current.delete(url);
            throw error;
          });
          images.current.set(url, request);
        }
        return request;
      }),
    ]).then(() => { if (active) setCaptureReady(true); })
      .catch((error) => console.error("Store screenshot artwork failed", error));
    return () => { active = false; };
  }, [shop, art, accessoryArt, accessoriesReady]);
  const left = (seconds: number) => duration(Math.max(0, seconds - Math.floor((now - loaded) / 1000)));
  const current = shop?.bundles[featured];

  async function copy() {
    const node = capture.current;
    if (!node || copying) return;
    setCopying(true);
    const stage = document.createElement("div");
    try {
      stage.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none";
      const clone = node.cloneNode(true) as HTMLDivElement;
      clone.style.width = `${node.clientWidth}px`;
      stage.append(clone);
      document.body.append(stage);
      await Promise.all(Array.from(clone.querySelectorAll("img"), async (img) => {
        const url = img.src;
        if (!url || url.startsWith("data:")) return;
        const image = images.current.get(url);
        if (!image) throw new Error("Store artwork is not ready");
        img.src = await image;
        await img.decode();
      }));
      const blob = await toBlob(clone, {
        backgroundColor: "#0b0b0b",
        width: clone.scrollWidth,
        height: clone.scrollHeight,
        pixelRatio: 1.5,
        fontEmbedCSS: (await fonts.current) ?? undefined,
      });
      if (!blob) throw new Error("Could not render the store image");
      const image = await Image.fromBytes(await blob.arrayBuffer());
      try {
        await writeImage(image);
      } finally {
        await image.close();
      }
      toast.success("Store screenshot copied");
    } catch (error) {
      console.error("Store screenshot failed", error);
      toast.error("Couldn’t copy the store screenshot");
    } finally {
      stage.remove();
      setCopying(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-5 pb-8 pt-11 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.18)_transparent]">
      <div className="mb-3 flex justify-end">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            {shop?.vp != null && <Balance icon={VP_ICON} label="VALORANT Points" value={shop.vp} />}
            {shop?.kc != null && <Balance icon={KC_ICON} label="Kingdom Credits" value={shop.kc} />}
          </div>
          <button type="button" onClick={() => void copy()} disabled={!captureReady || loading || copying} className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-40">
            <IconCameraFilled className="size-3.5" /> {copying ? "Copying" : "Screenshot"}
          </button>
          <button type="button" onClick={() => setRefresh((n) => n + 1)} disabled={!account || loading} className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-40">
            <IconRefresh className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>
      {!account ? (
        <p className="py-24 text-center text-sm text-zinc-500">Launch VALORANT to see your store.</p>
      ) : !shop && loading ? (
        <div className="flex h-64 items-center justify-center"><Spinner label="Loading store" /></div>
      ) : !shop ? (
        <p className="py-24 text-center text-sm text-zinc-500">{error || "Store is unavailable right now."}</p>
      ) : (
        <div ref={capture} className="space-y-5">
          {error && <p className="text-xs text-zinc-500">{error}</p>}
          <section>
            <div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-medium text-zinc-200">Featured collection</h2><span className="font-mono text-sm font-medium tabular-nums text-zinc-300">{left(current?.left || shop.bundlesLeft)}</span></div>
            <div
              aria-label="Featured collections"
              aria-roledescription="carousel"
              className="relative h-52 overflow-hidden rounded-lg bg-[#161a20]"
            >
              {shop.bundles.map((item, index) => {
                const bundle = art?.bundles[item.id.toLowerCase()];
                const image = bundle?.displayIcon2 || bundle?.displayIcon;
                return image && <img key={item.id} className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${index === featured ? "opacity-100" : "opacity-0"}`} src={image} alt="" aria-hidden="true" />;
              })}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/20" />
              {current && <div className="absolute inset-x-5 bottom-4 flex items-end justify-between gap-4">
                <div className="min-w-0"><h3 className="truncate text-lg font-medium text-white">{art?.bundles[current.id.toLowerCase()]?.displayName || "Featured collection"}</h3></div>
                {current.price != null && <Price amount={current.price} className="shrink-0 rounded bg-black/55 px-2.5 py-1.5 text-sm font-semibold text-white" />}
              </div>}
              {shop.bundles.length > 1 && <div className="absolute left-1/2 top-2 flex -translate-x-1/2 gap-0.5">{shop.bundles.map((item, index) => <button key={item.id} type="button" aria-label={`Show collection ${index + 1}`} aria-current={index === featured ? "true" : undefined} onClick={() => setFeatured(index)} className="flex h-5 w-3 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"><span className={`rounded-full transition-all ${index === featured ? "h-1 w-3 bg-white" : "size-1 bg-white/50 hover:bg-white/80"}`} /></button>)}</div>}
            </div>
          </section>
          <section>
            <div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-medium text-zinc-200">Daily offers</h2><span className="font-mono text-sm font-medium tabular-nums text-zinc-300">{left(shop.offersLeft)}</span></div>
            <div className="grid grid-cols-2 gap-1 lg:grid-cols-4">
              {shop.offers.map((item) => <SkinCard key={item.id} offer={item} skin={art?.skins[item.id.toLowerCase()]} tier={art?.tiers[art.skins[item.id.toLowerCase()]?.contentTierUuid?.toLowerCase() ?? ""]} />)}
            </div>
          </section>
          {shop.night.length > 0 && <section>
            <div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-medium text-zinc-200">Night Market</h2><span className="font-mono text-sm font-medium tabular-nums text-zinc-300">{left(shop.nightLeft)}</span></div>
            <div className="grid grid-cols-2 gap-1 lg:grid-cols-3">{shop.night.map((item) => <SkinCard key={item.id} offer={item} skin={art?.skins[item.id.toLowerCase()]} tier={art?.tiers[art.skins[item.id.toLowerCase()]?.contentTierUuid?.toLowerCase() ?? ""]} />)}</div>
          </section>}
          {shop.accessories.length > 0 && <section>
            <div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-medium text-zinc-200">Accessories</h2><span className="font-mono text-sm font-medium tabular-nums text-zinc-300">{left(shop.accessoriesLeft)}</span></div>
            <div className="grid grid-cols-2 gap-1 lg:grid-cols-4">{shop.accessories.map((item) => <AccessoryCard key={item.id} item={item} art={accessoryArt[item.id]} />)}</div>
          </section>}
        </div>
      )}
    </div>
  );
}

function SkinCard({ offer, skin, tier }: { offer: Offer; skin?: Skin; tier?: Tier }) {
  const color = tier?.highlightColor?.slice(0, 6) || "30383d";
  const rgb = [0, 2, 4].map((offset) => parseInt(color.slice(offset, offset + 2), 16)).join(",");
  return <div
    className="group relative aspect-[1.85] min-h-[124px] overflow-hidden rounded-lg bg-[#151a1e]"
    style={{ background: `linear-gradient(145deg, rgba(${rgb},.55), rgba(20,24,28,.96) 75%)` }}
  >
    {skin?.displayIcon && <img src={skin.displayIcon} alt="" className="absolute inset-x-3 top-3 h-[60%] w-[calc(100%_-_1.5rem)] object-contain" />}
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-8">
      <p className="truncate text-xs font-medium text-white">{skin?.displayName || "Weapon skin"}</p>
      <div className="mt-0.5 flex items-center justify-between text-[11px] text-white/70"><span>{offer.price != null ? <Price amount={offer.price} /> : "Price unavailable"}</span>{offer.discount != null && offer.discount > 0 && <span className="text-emerald-300">-{offer.discount}%</span>}</div>
    </div>
  </div>;
}

function Price({ amount, currency = "vp", className = "" }: { amount: number; currency?: "vp" | "kc"; className?: string }) {
  const icon = currency === "kc" ? KC_ICON : VP_ICON;
  const label = currency === "kc" ? "Kingdom Credits" : "Valorant Points";
  return <span className={`inline-flex items-center gap-1.5 ${className}`}><img src={icon} alt={label} className="size-3.5 object-contain" />{amount.toLocaleString()}</span>;
}

function Balance({ icon, label, value }: { icon: string; label: string; value: number }) {
  return <div aria-label={`${label}: ${value.toLocaleString()}`} title={label} className="flex items-center gap-1.5 text-xs font-medium tabular-nums text-zinc-300"><img src={icon} alt="" className="size-4 object-contain" />{value.toLocaleString()}</div>;
}

function AccessoryCard({ item, art }: { item: Accessory; art?: { name: string; image: string | null } }) {
  const kind = ACCESSORY[item.kind.toLowerCase()];
  const label = kind === "playercards" ? "Player card" : kind === "buddies" ? "Gun buddy" : kind === "sprays" ? "Spray" : "Player title";
  return <div className="relative flex aspect-[1.85] min-h-[124px] items-center justify-center overflow-hidden rounded-lg bg-[#181d22]">
    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] to-transparent" />
    {art?.image ? <img src={art.image} alt="" className={`absolute inset-3 h-[calc(100%_-_1.5rem)] w-[calc(100%_-_1.5rem)] ${kind === "playercards" ? "object-cover" : "object-contain"}`} /> : <p className="relative px-3 text-center text-sm text-zinc-300">{art?.name || label}</p>}
    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2.5 pt-7">
      <div className="min-w-0"><p className="truncate text-xs font-medium text-white">{art?.name || label}</p><p className="text-[10px] text-white/55">{label}</p></div>
      {item.price != null && <Price amount={item.price} currency="kc" className="text-white" />}
    </div>
  </div>;
}

export default Store;
