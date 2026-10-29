import type { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

type FrameProps = {
  children: ReactNode;
};

function Frame({ children }: FrameProps) {
  return (
    <div className="relative flex h-screen overflow-hidden rounded-md bg-[#080808] font-[Google_Sans,sans-serif] text-zinc-100">
      <header className="absolute inset-x-0 top-0 z-50 h-10 select-none">
        <div
          className="absolute inset-y-0 left-0 right-20 cursor-default"
          data-tauri-drag-region
          onMouseDown={(event) => {
            if (event.button === 0) void appWindow.startDragging();
          }}
        />
        <div className="absolute right-2 top-1.5 flex items-center gap-1">
          <button
            aria-label="Minimize window"
            className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:outline-none"
            onClick={() => void appWindow.minimize()}
            title="Minimize"
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 16 16" width="12">
              <path d="M3.5 8h9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
            </svg>
          </button>

          <button
            aria-label="Close window"
            className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-600 hover:text-white focus-visible:bg-red-600 focus-visible:outline-none"
            onClick={() => void appWindow.close()}
            title="Close"
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 16 16" width="14">
              <path d="m4.25 4.25 7.5 7.5m0-7.5-7.5 7.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </header>

      {children}
    </div>
  );
}

export default Frame;
