import { useEffect, useState } from "react";
import Glass from "../../components/ui/glass";
import Select from "../../components/ui/select";
import Switch from "../../components/ui/switch";
import {
  getRpcState,
  setRpcEnabled,
  setRpcHideUsername,
  setRpcImage,
  setRpcShowParty,
  setRpcShowRank,
  watchRpc,
  type RpcState,
} from "../../components/core/rpcsettings";

function Settings() {
  const [rpc, setRpc] = useState<RpcState>(getRpcState);

  useEffect(() => watchRpc(setRpc), []);

  return (
    <div className="h-full overflow-y-auto px-7 pb-7 pt-12 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
      <div className="mx-auto max-w-5xl space-y-3">
        <Glass className="w-full px-3 py-2.5">
          <div className="relative z-20 flex items-center gap-3">
            <img
              alt="Clarity icon"
              className="size-9 shrink-0 rounded-lg object-cover"
              src="/clarity.png"
            />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="text-sm font-medium tracking-tight text-white">
                  Clarity
                </h1>
                <span className="text-[10px] tabular-nums text-zinc-500">
                  v0.3
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-4 text-zinc-400">
                A lightweight VALORANT tracker for your account and match stats.
              </p>
            </div>
          </div>
        </Glass>

        <Glass className="w-full p-3">
          <section className="relative z-20 divide-y divide-white/[0.06]">
            <div className="flex min-h-10 items-center justify-between gap-4 py-2">
              <span className="text-xs font-medium text-zinc-200">
                Discord Rich Presence
              </span>
              <Switch
                checked={rpc.enabled}
                label="Enable Discord Rich Presence"
                onChange={setRpcEnabled}
              />
            </div>
            <div className="flex min-h-10 items-center justify-between gap-4 py-2">
              <span className="text-xs text-zinc-400">Large image</span>
              <Select
                className="w-40"
                label="Large image"
                onChange={setRpcImage}
                options={[
                  { label: "Player card", value: "card" },
                  { label: "Clarity icon", value: "icon" },
                ]}
                value={rpc.image}
              />
            </div>
            <div className="flex min-h-10 items-center justify-between gap-4 py-2">
              <span className="text-xs text-zinc-400">Show rank icon</span>
              <Switch
                checked={rpc.showRank}
                label="Show rank icon in Discord Rich Presence"
                onChange={setRpcShowRank}
              />
            </div>
            <div className="flex min-h-10 items-center justify-between gap-4 py-2">
              <span className="text-xs text-zinc-400">Show party size</span>
              <Switch
                checked={rpc.showParty}
                label="Show party size in Discord Rich Presence"
                onChange={setRpcShowParty}
              />
            </div>
            <div className="flex min-h-10 items-center justify-between gap-4 py-2">
              <span className="text-xs text-zinc-400">Hide username tooltip</span>
              <Switch
                checked={rpc.hideUsername}
                label="Hide username tooltip in Discord Rich Presence"
                onChange={setRpcHideUsername}
              />
            </div>
          </section>
        </Glass>
      </div>
    </div>
  );
}

export default Settings;
