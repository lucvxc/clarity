const labels: Record<string, string> = {
  competitive: "Competitive",
  ranked: "Competitive",
  standard: "Standard",
  unrated: "Unrated",
  swiftplay: "Swiftplay",
  spikerush: "Spike Rush",
  deathmatch: "Deathmatch",
  teamdeathmatch: "Team Deathmatch",
  hurm: "Team Deathmatch",
  skirmish: "Skirmish",
  escalation: "Escalation",
  replication: "Replication",
  snowballfight: "Snowball Fight",
  bomb: "Unrated",
};

export function modeLabel(value: string | null | undefined) {
  const source = value?.trim() ?? "";
  if (!source) return "VALORANT";

  const parts = source.split(/[\\/]/).filter(Boolean);
  const gameModes = parts.findIndex((part) => part.toLowerCase() === "gamemodes");
  let name =
    gameModes >= 0
      ? parts[gameModes + 1] ?? parts[parts.length - 1]
      : parts[parts.length - 1];
  name ??= source;
  name = (name.split(".")[0] ?? name)
    .replace(/gamemode(?:_c)?$/i, "")
    .replace(/[_-]/g, " ")
    .trim();

  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (labels[key]) return labels[key];
  if (/^[\da-f-]{36}$/i.test(name)) return "Game mode";
  return name.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Game mode";
}

export function modeType(value: string | null) {
  const key = modeLabel(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key.includes("competitive") || key === "ranked") return "competitive";
  if (key.includes("swiftplay")) return "swiftplay";
  if (key.includes("spikerush")) return "spikerush";
  if (key.includes("teamdeathmatch") || key.includes("hurm"))
    return "teamdeathmatch";
  if (key.includes("skirmish")) return "skirmish";
  if (key.includes("deathmatch")) return "deathmatch";
  if (key.includes("unrated") || key.includes("bomb")) return "unrated";
  if (key === "standard") return "standard";
  return "other";
}
