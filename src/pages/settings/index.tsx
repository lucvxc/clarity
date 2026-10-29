import Glass from "../../components/ui/glass";

function Settings() {
  return (
    <div className="h-full overflow-y-auto px-7 pb-7 pt-12 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
      <div className="mx-auto max-w-5xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">Preferences</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight text-white">Settings</h1>
        <Glass className="mt-5 max-w-xl p-4">
          <div className="relative z-20">
            <p className="text-sm font-medium text-zinc-200">Settings are on the way</p>
            <p className="mt-1 text-sm text-zinc-500">Your account and app preferences will live here.</p>
          </div>
        </Glass>
      </div>
    </div>
  );
}

export default Settings;
