export type RpcImage = "card" | "icon";
export type RpcState = {
  image: RpcImage;
  showRank: boolean;
  showParty: boolean;
  hideUsername: boolean;
  enabled: boolean;
  status: "connecting" | "connected" | "offline" | "disabled";
  error: string | null;
};

const listeners = new Set<(state: RpcState) => void>();
const imageKey = "clarity.rpc.image";
const rankKey = "clarity.rpc.rank";
const partyKey = "clarity.rpc.party";
const usernameKey = "clarity.rpc.hide-username";
const enabledKey = "clarity.rpc.enabled";
let state: RpcState = {
  image: readImage(),
  showRank: readRank(),
  showParty: readParty(),
  hideUsername: readUsername(),
  enabled: readEnabled(),
  status: "connecting",
  error: null,
};

function readImage(): RpcImage {
  try {
    return localStorage.getItem(imageKey) === "icon" ? "icon" : "card";
  } catch {
    return "card";
  }
}

function readEnabled() {
  try {
    return localStorage.getItem(enabledKey) !== "false";
  } catch {
    return true;
  }
}

function readRank() {
  try {
    return localStorage.getItem(rankKey) !== "false";
  } catch {
    return true;
  }
}

function readUsername() {
  try {
    return localStorage.getItem(usernameKey) === "true";
  } catch {
    return false;
  }
}

function readParty() {
  try {
    return localStorage.getItem(partyKey) !== "false";
  } catch {
    return true;
  }
}

function publish(next: Partial<RpcState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener(state));
}

export function getRpcState() {
  return state;
}

export function watchRpc(listener: (state: RpcState) => void) {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function setRpcImage(image: RpcImage) {
  try {
    localStorage.setItem(imageKey, image);
  } catch {}
  publish({ image });
}

export function setRpcShowRank(showRank: boolean) {
  try {
    localStorage.setItem(rankKey, String(showRank));
  } catch {}
  publish({ showRank });
}

export function setRpcShowParty(showParty: boolean) {
  try {
    localStorage.setItem(partyKey, String(showParty));
  } catch {}
  publish({ showParty });
}

export function setRpcHideUsername(hideUsername: boolean) {
  try {
    localStorage.setItem(usernameKey, String(hideUsername));
  } catch {}
  publish({ hideUsername });
}

export function setRpcEnabled(enabled: boolean) {
  try {
    localStorage.setItem(enabledKey, String(enabled));
  } catch {}
  publish({ enabled, status: enabled ? "connecting" : "disabled", error: null });
}

export function setRpcStatus(
  status: RpcState["status"],
  error: string | null = null,
) {
  publish({ status, error });
}
