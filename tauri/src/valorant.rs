use base64::Engine;
use reqwest::{Client, Error as HttpError};

mod account;
mod live;
mod missions;
mod player;
mod stats;
mod store;

pub use account::account;
pub use live::{current_match, loadouts, presence};
pub use missions::{Mission, missions};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
pub use stats::{history, match_details, player_history, stats};
use std::collections::HashMap;
use std::{
    env, fs,
    io::ErrorKind,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
pub use store::{Storefront, store};

const PLATFORM: &str = "ewoJInBsYXRmb3JtVHlwZSI6ICJQQyIsCgkicGxhdGZvcm1PUyI6ICJXaW5kb3dzIiwKCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjI2MjAwLjEuMjU2LjY0Yml0IiwKCSJwbGF0Zm9ybUNoaXBzZXQiOiAiVW5rbm93biIKfQ==";
const TIMEOUT: Duration = Duration::from_secs(6);
const CACHE: Duration = Duration::from_secs(900);
const QUEUE_CACHE: Duration = Duration::from_secs(60);
const QUEUE_MISS: Duration = Duration::from_secs(10);
const PARTY_CACHE: Duration = Duration::from_secs(120);
const PARTY_MISS: Duration = Duration::from_secs(20);
const RANK_TTL: Duration = Duration::from_secs(300);
const RANK_MISS_TTL: Duration = Duration::from_secs(20);
const RANK_DATA_TTL: Duration = Duration::from_secs(300);
const RANK_LIMIT_TTL: Duration = Duration::from_secs(120);
const RANK_ERROR_TTL: Duration = Duration::from_secs(20);
const PROFILE_TTL: Duration = Duration::from_secs(900);
const PROFILE_MISS_TTL: Duration = Duration::from_secs(300);
const HISTORY: usize = 20;
const PROFILE_MATCHES: usize = 5;
const NAME_LIMIT: usize = 512;
const EMPTY: &str = "00000000-0000-0000-0000-000000000000";
const DEFAULT: &str = "9fb348bc-41a0-91ad-8a3e-818035c4e561";

type Timed<T> = (Instant, T);
type Store<T> = OnceLock<Mutex<HashMap<String, Timed<T>>>>;
type RouteData = (Instant, String, String, String);

static LOCAL: OnceLock<Result<Client, String>> = OnceLock::new();
static API: OnceLock<Result<Client, String>> = OnceLock::new();
static VERSION: OnceLock<Mutex<Option<(Instant, String)>>> = OnceLock::new();
static NAMES: OnceLock<Mutex<HashMap<String, PlayerName>>> = OnceLock::new();
static RANKS: Store<Option<u32>> = OnceLock::new();
static RANK_DATA: Store<Result<Value, String>> = OnceLock::new();
static RANK_LIMIT: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
static PROFILES: Store<Option<ProfileStats>> = OnceLock::new();
static QUEUES: Store<Option<String>> = OnceLock::new();
static PARTIES: Store<Option<String>> = OnceLock::new();
static ROUTE: OnceLock<Mutex<Option<RouteData>>> = OnceLock::new();

pub async fn profiles(subjects: Vec<String>) -> Result<HashMap<String, ProfileStats>, String> {
    let lock = lock()?.ok_or_else(|| "Riot Client is not running".to_string())?;
    let auth = auth(&lock).await?;
    Ok(player::profiles(&auth, &subjects).await)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    game_name: String,
    tag_line: String,
    subject: String,
    player_card_id: String,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    current_tier: Option<u32>,
    peak_tier: Option<u32>,
    peak_act_id: Option<String>,
    games: Option<u32>,
    wins: Option<u32>,
    rating: Option<u32>,
    kd: Option<f32>,
    headshot_pct: Option<f32>,
    bodyshot_pct: Option<f32>,
    legshot_pct: Option<f32>,
    headshots: Option<u32>,
    bodyshots: Option<u32>,
    legshots: Option<u32>,
    agent: Option<String>,
    agent_games: Option<u32>,
    recent_games: Option<u32>,
    recent_matches: Vec<RecentMatch>,
    rank_error: Option<String>,
    match_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchPage {
    matches: Vec<RecentMatch>,
    next_offset: usize,
    has_more: bool,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentMatch {
    match_id: String,
    map_id: String,
    queue: Option<String>,
    mode: Option<String>,
    agent_id: Option<String>,
    started: Option<u64>,
    won: Option<bool>,
    rounds_won: Option<u32>,
    rounds_lost: Option<u32>,
    kills: Option<u32>,
    deaths: Option<u32>,
    assists: Option<u32>,
    kd: Option<f32>,
    acs: Option<u32>,
    score: Option<u32>,
    headshots: Option<u32>,
    bodyshots: Option<u32>,
    legshots: Option<u32>,
    mvp: bool,
    match_mvp: bool,
    competitive: bool,
    rr: Option<i32>,
    tier: Option<u32>,
    rank_change: Option<i8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchDetails {
    match_id: String,
    map_id: String,
    queue: Option<String>,
    mode: Option<String>,
    started: Option<u64>,
    duration: Option<u64>,
    rounds_won: Option<u32>,
    rounds_lost: Option<u32>,
    players: Vec<MatchDetailPlayer>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchDetailPlayer {
    subject: String,
    name: String,
    tag_line: Option<String>,
    player_card_id: Option<String>,
    you: bool,
    hidden: bool,
    team: String,
    agent_id: Option<String>,
    tier: Option<u32>,
    level: Option<u32>,
    kills: u32,
    deaths: u32,
    assists: u32,
    score: u32,
    rounds: u32,
    headshots: u32,
    bodyshots: u32,
    legshots: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchInfo {
    match_id: String,
    phase: String,
    map_id: String,
    mode_id: String,
    queue_id: Option<String>,
    players: Vec<MatchPlayer>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponLoadout {
    weapon_id: String,
    item_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    pub phase: String,
    pub mode_id: Option<String>,
    pub queue_id: Option<String>,
    pub party_id: Option<String>,
    pub party_size: Option<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchPlayer {
    subject: String,
    name: String,
    tag_line: Option<String>,
    player_card_id: Option<String>,
    agent_id: Option<String>,
    team: String,
    tier: Option<u32>,
    level: Option<u32>,
    games: Option<u32>,
    wins: Option<u32>,
    kd: Option<f32>,
    headshot_pct: Option<f32>,
    acs: Option<f32>,
    selection: Option<String>,
    party_group: Option<u8>,
    you: bool,
    hidden: bool,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStats {
    pub player_card_id: Option<String>,
    pub current_tier: Option<u32>,
    pub peak_tier: Option<u32>,
    pub peak_act_id: Option<String>,
    pub rating: Option<u32>,
    pub level: Option<u32>,
    pub games: Option<u32>,
    pub wins: Option<u32>,
    pub kd: Option<f32>,
    pub headshot_pct: Option<f32>,
    pub acs: Option<f32>,
}

#[derive(Clone)]
struct PlayerName {
    game: String,
    tag: String,
}

#[derive(Deserialize)]
struct Session {
    game_name: String,
    game_tag: String,
    puuid: String,
    region: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Token {
    access_token: String,
    token: String,
    subject: Option<String>,
}

#[derive(Deserialize)]
struct Loadout {
    #[serde(rename = "Identity")]
    identity: Identity,
}

#[derive(Deserialize)]
struct Identity {
    #[serde(rename = "PlayerCardID")]
    card: String,
}

#[derive(Deserialize)]
struct Version {
    data: Build,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Build {
    riot_client_version: String,
}

struct Lock {
    port: u16,
    pass: String,
}

struct Auth {
    session: Session,
    token: Token,
    region: String,
    shard: String,
    version: String,
}

async fn auth(lock: &Lock) -> Result<Auth, String> {
    let session = session(lock).await?;
    let local = local()?;
    let base = format!("https://127.0.0.1:{}", lock.port);
    let token: Token = json(local, &base, &lock.pass, "/entitlements/v1/token").await?;
    if token.access_token.is_empty() || token.token.is_empty() {
        return Err("Riot Client returned incomplete account tokens".to_string());
    }

    let (region, shard) = routes(&session.region)
        .ok_or_else(|| "Could not determine Riot's VALORANT region".to_string())?;

    Ok(Auth {
        session,
        token,
        region,
        shard,
        version: version().await?,
    })
}

async fn session(lock: &Lock) -> Result<Session, String> {
    let base = format!("https://127.0.0.1:{}", lock.port);
    let session: Session = json(local()?, &base, &lock.pass, "/chat/v1/session").await?;
    if session.game_name.trim().is_empty()
        || session.game_tag.trim().is_empty()
        || !uuid(&session.puuid)
    {
        return Err("Riot Client returned an incomplete session".to_string());
    }
    Ok(session)
}

async fn json<T: DeserializeOwned>(
    client: &Client,
    base: &str,
    pass: &str,
    path: &str,
) -> Result<T, String> {
    client
        .get(format!("{base}{path}"))
        .basic_auth("riot", Some(pass))
        .send()
        .await
        .map_err(|_| "Riot Client local API is unavailable".to_string())?
        .error_for_status()
        .map_err(|_| "Riot Client rejected the local API request".to_string())?
        .json()
        .await
        .map_err(|_| "Riot Client returned an invalid local API response".to_string())
}

async fn get<T: DeserializeOwned>(url: &str, token: &Token, version: &str) -> Result<T, String> {
    call(url, token, version)?
        .send()
        .await
        .map_err(|error| issue("Valorant request failed", error))?
        .error_for_status()
        .map_err(|error| issue("Valorant request failed", error))?
        .json()
        .await
        .map_err(|_| "Valorant returned invalid data".to_string())
}

async fn rank_data(url: &str, token: &Token, version: &str) -> Result<Value, String> {
    let cache = RANK_DATA.get_or_init(|| Mutex::new(HashMap::new()));
    {
        let mut cache = cache.lock().unwrap_or_else(|error| error.into_inner());
        cache.retain(|_, (at, value)| at.elapsed() < rank_data_ttl(value));
        if let Some((_, value)) = cache.get(url) {
            return (*value).clone();
        }
    }

    let limited = RANK_LIMIT.get_or_init(|| Mutex::new(None));
    {
        let mut limited = limited.lock().unwrap_or_else(|error| error.into_inner());
        if let Some(at) = *limited {
            if at.elapsed() < RANK_LIMIT_TTL {
                return Err("Valorant request failed (HTTP 429)".to_string());
            }
            *limited = None;
        }
    }

    let value = get::<Value>(url, token, version).await;
    if value
        .as_ref()
        .is_err_and(|error| error.contains("HTTP 429"))
    {
        *limited.lock().unwrap_or_else(|error| error.into_inner()) = Some(Instant::now());
    }
    let mut cache = cache.lock().unwrap_or_else(|error| error.into_inner());
    cache.insert(url.to_string(), (Instant::now(), value.clone()));
    while cache.len() > 256 {
        let oldest = cache
            .iter()
            .min_by_key(|(_, (at, _))| *at)
            .map(|(key, _)| key.clone());
        if let Some(key) = oldest {
            cache.remove(&key);
        } else {
            break;
        }
    }
    value
}

fn rank_data_ttl(value: &Result<Value, String>) -> Duration {
    match value {
        Ok(_) => RANK_DATA_TTL,
        Err(error) if error.contains("HTTP 429") => RANK_LIMIT_TTL,
        Err(_) => RANK_ERROR_TTL,
    }
}

fn call(url: &str, token: &Token, version: &str) -> Result<reqwest::RequestBuilder, String> {
    Ok(api()?
        .get(url)
        .header("X-Riot-ClientPlatform", PLATFORM)
        .header("X-Riot-ClientVersion", version)
        .header("X-Riot-Entitlements-JWT", &token.token)
        .bearer_auth(&token.access_token))
}

fn rank(mmr: &Value) -> Stats {
    let mut stats = Stats::default();
    let seasons = path_ci(
        Some(mmr),
        &["QueueSkills", "competitive", "SeasonalInfoBySeasonID"],
    )
    .and_then(Value::as_object);
    let latest = get_ci(Some(mmr), "LatestCompetitiveUpdate");
    let current = latest
        .and_then(|value| get_ci(Some(value), "SeasonID"))
        .and_then(Value::as_str)
        .and_then(|id| {
            seasons.and_then(|values| {
                values
                    .iter()
                    .find(|(season, _)| season.eq_ignore_ascii_case(id))
                    .map(|(season, value)| (season.as_str(), value))
            })
        })
        .or_else(|| {
            seasons.and_then(|values| {
                values
                    .iter()
                    .max_by_key(|(_, season)| {
                        num(path_ci(
                            Some(season),
                            &["LatestCompetitiveUpdate", "MatchStartTime"],
                        ))
                        .unwrap_or(0)
                    })
                    .map(|(season, value)| (season.as_str(), value))
            })
        });

    let current_act_id = current.map(|(id, _)| id.to_string());
    let current = current.map(|(_, value)| value);
    let season_tier = num(get_ci(current, "CompetitiveTier"));
    let update_tier = num(get_ci(latest, "TierAfterUpdate"));
    let queue_tier = num(path_ci(
        Some(mmr),
        &["QueueSkills", "competitive", "CompetitiveTier"],
    ));
    let tier = [season_tier, update_tier, queue_tier]
        .into_iter()
        .flatten()
        .find(|tier| *tier > 0)
        .or(season_tier)
        .or(update_tier)
        .or(queue_tier);
    stats.current_tier = tier;
    stats.rating = num(get_ci(latest, "RankedRatingAfterUpdate"))
        .or_else(|| num(get_ci(current, "RankedRating")));
    stats.games = num(get_ci(current, "NumberOfGames"));
    stats.wins = num(get_ci(current, "NumberOfWins"));

    let mut peak = stats.current_tier.unwrap_or(0);
    stats.peak_act_id = current_act_id.filter(|_| peak > 0);
    if let Some(seasons) = seasons {
        let historical_peak = seasons
            .iter()
            .filter_map(|(act, season)| {
                let tier = get_ci(Some(season), "WinsByTier")
                    .and_then(Value::as_object)?
                    .iter()
                    .filter(|(_, wins)| wins.as_u64().unwrap_or(0) > 0)
                    .filter_map(|(tier, _)| tier.parse::<u32>().ok())
                    .max()?;
                let played = num(path_ci(
                    Some(season),
                    &["LatestCompetitiveUpdate", "MatchStartTime"],
                ))
                .unwrap_or(0);
                Some((tier, played, act))
            })
            .max_by_key(|(tier, played, _)| (*tier, *played));
        if let Some((tier, _, act)) = historical_peak
            && (tier > peak || (tier == peak && stats.peak_act_id.is_none()))
        {
            peak = tier;
            stats.peak_act_id = Some(act.to_string());
        }
    }
    stats.peak_tier = (peak > 0).then_some(peak);
    stats
}

fn num(value: Option<&Value>) -> Option<u32> {
    value
        .and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_i64().and_then(|number| u64::try_from(number).ok()))
                .or_else(|| value.as_str()?.parse::<u64>().ok())
        })
        .and_then(|value| u32::try_from(value).ok())
}

fn get_ci<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    value?
        .as_object()?
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(key))
        .map(|(_, value)| value)
}

fn hit_counts(detail: &Value, subject: &str) -> (u32, u32, u32) {
    let mut counts = (0, 0, 0);
    if let Some(rounds) = get_ci(Some(detail), "RoundResults").and_then(Value::as_array) {
        for round in rounds {
            let Some(players) = get_ci(Some(round), "PlayerStats").and_then(Value::as_array) else {
                continue;
            };
            let Some(player) = players.iter().find(|player| {
                text(get_ci(Some(player), "Subject"))
                    .is_some_and(|id| id.eq_ignore_ascii_case(subject))
            }) else {
                continue;
            };
            let before = counts;
            if let Some(damage) = get_ci(Some(player), "Damage").and_then(Value::as_array) {
                for hit in damage {
                    counts.0 += num(get_ci(Some(hit), "Headshots")).unwrap_or(0);
                    counts.1 += num(get_ci(Some(hit), "Bodyshots")).unwrap_or(0);
                    counts.2 += num(get_ci(Some(hit), "Legshots")).unwrap_or(0);
                }
            }
            if counts == before {
                counts.0 += num(get_ci(Some(player), "Headshots")).unwrap_or(0);
                counts.1 += num(get_ci(Some(player), "Bodyshots")).unwrap_or(0);
                counts.2 += num(get_ci(Some(player), "Legshots")).unwrap_or(0);
            }
        }
    }

    if counts == (0, 0, 0)
        && let Some(players) = get_ci(Some(detail), "Players").and_then(Value::as_array)
        && let Some(player) = players.iter().find(|player| {
            text(get_ci(Some(player), "Subject")).is_some_and(|id| id.eq_ignore_ascii_case(subject))
        })
    {
        let stats = get_ci(Some(player), "Stats");
        counts.0 = num(get_ci(stats, "Headshots")).unwrap_or(0);
        counts.1 = num(get_ci(stats, "Bodyshots")).unwrap_or(0);
        counts.2 = num(get_ci(stats, "Legshots")).unwrap_or(0);
    }

    counts
}

fn path_ci<'a>(mut value: Option<&'a Value>, keys: &[&str]) -> Option<&'a Value> {
    for key in keys {
        value = get_ci(value, key);
    }
    value
}

fn round_score(detail: &Value, team_id: Option<&str>) -> Option<(u32, u32)> {
    let team_id = team_id?;
    let rounds = detail
        .get("roundResults")
        .or_else(|| detail.get("RoundResults"))?
        .as_array()?;
    let mut score = (0, 0);
    let mut counted = 0;

    for round in rounds {
        let Some(winner) = text(
            round
                .get("winningTeam")
                .or_else(|| round.get("WinningTeam")),
        ) else {
            continue;
        };
        if winner.eq_ignore_ascii_case(team_id) {
            score.0 += 1;
            counted += 1;
        } else if !winner.is_empty() {
            score.1 += 1;
            counted += 1;
        }
    }

    (counted > 0).then_some(score)
}

fn signed(value: Option<&Value>) -> Option<i32> {
    value
        .and_then(|value| value.as_i64().or_else(|| value.as_str()?.parse().ok()))
        .and_then(|value| i32::try_from(value).ok())
}

async fn version() -> Result<String, String> {
    let cache = VERSION.get_or_init(|| Mutex::new(None));
    if let Some((at, value)) = cache
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .as_ref()
        && at.elapsed() < CACHE
    {
        return Ok(value.clone());
    }

    if let Some(value) = local_version() {
        *cache.lock().unwrap_or_else(|error| error.into_inner()) =
            Some((Instant::now(), value.clone()));
        return Ok(value);
    }

    let value = api()?
        .get("https://valorant-api.com/v1/version")
        .send()
        .await
        .map_err(|error| issue("Client version request failed", error))?
        .error_for_status()
        .map_err(|error| issue("Client version request failed", error))?
        .json::<Version>()
        .await
        .map_err(|_| "Valorant returned an invalid version".to_string())?
        .data
        .riot_client_version;

    *cache.lock().unwrap_or_else(|error| error.into_inner()) =
        Some((Instant::now(), value.clone()));
    Ok(value)
}

fn local_version() -> Option<String> {
    let path = std::path::PathBuf::from(env::var_os("LOCALAPPDATA")?)
        .join("VALORANT")
        .join("Saved")
        .join("Logs")
        .join("ShooterGame.log");
    fs::read_to_string(path)
        .ok()?
        .lines()
        .rev()
        .find_map(|line| {
            let value = line.split_once("CI server version: ")?.1.trim();
            (value.starts_with("release-") && value.contains("-shipping-"))
                .then(|| value.to_string())
        })
}

fn lock() -> Result<Option<Lock>, String> {
    let Some(app_data) = env::var_os("LOCALAPPDATA") else {
        return Ok(None);
    };
    let path = std::path::PathBuf::from(app_data)
        .join("Riot Games")
        .join("Riot Client")
        .join("Config")
        .join("lockfile");
    let data = match fs::read_to_string(path) {
        Ok(data) => data,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Could not read Riot Client lockfile".to_string()),
    };

    let mut parts = data.trim().splitn(5, ':');
    let _name = parts.next();
    let _pid = parts.next();
    let port = parts
        .next()
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|value| *value != 0)
        .ok_or_else(|| "Riot Client lockfile has an invalid port".to_string())?;
    let pass = parts
        .next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Riot Client lockfile has no local token".to_string())?
        .to_string();
    let protocol = parts
        .next()
        .ok_or_else(|| "Riot Client lockfile has no protocol".to_string())?;
    if protocol != "https" {
        return Err("Riot Client local API is not using HTTPS".to_string());
    }

    Ok(Some(Lock { port, pass }))
}

fn routes(region: &str) -> Option<(String, String)> {
    let key = region.to_ascii_lowercase();
    let cache = ROUTE.get_or_init(|| Mutex::new(None));
    if let Some((at, cached_region, game, shard)) = cache
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .as_ref()
        && cached_region == &key
        && at.elapsed() < CACHE
    {
        return Some((game.clone(), shard.clone()));
    }

    let route = game_route().or_else(|| mapped_route(&key))?;
    *cache.lock().unwrap_or_else(|error| error.into_inner()) =
        Some((Instant::now(), key, route.0.clone(), route.1.clone()));
    Some(route)
}

fn mapped_route(region: &str) -> Option<(String, String)> {
    let (game, shard) = match region {
        "na" | "na1" => ("na", "na"),
        "latam" | "la1" | "la2" => ("latam", "na"),
        "br" | "br1" => ("br", "na"),
        "eu" | "euw1" | "eun1" | "tr1" | "ru" => ("eu", "eu"),
        "ap" | "jp" | "jp1" | "oc1" | "sg2" | "ph2" | "tw2" | "vn2" => ("ap", "ap"),
        "kr" | "kr1" => ("kr", "kr"),
        "pbe" => ("na", "pbe"),
        _ => return None,
    };
    Some((game.to_string(), shard.to_string()))
}

fn game_route() -> Option<(String, String)> {
    let app_data = env::var_os("LOCALAPPDATA")?;
    let path = std::path::PathBuf::from(app_data)
        .join("VALORANT")
        .join("Saved")
        .join("Logs")
        .join("ShooterGame.log");
    let log = fs::read_to_string(path).ok()?;
    let mut end = log.len();

    while let Some(start) = log[..end].rfind("glz-") {
        let route_start = start + 4;
        let Some(suffix) = log[route_start..].find(".a.pvp.net") else {
            end = start;
            continue;
        };
        let route_end = route_start + suffix;
        let route = &log[route_start..route_end];
        let parsed = route.split_once("-1.").and_then(|(region, shard)| {
            (valid_route(region) && valid_route(shard))
                .then(|| (region.to_string(), shard.to_string()))
        });
        if parsed.is_some() {
            return parsed;
        }
        end = start;
    }

    None
}

fn valid_route(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'-')
}

fn text(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
}

fn uuid(value: &str) -> bool {
    value != EMPTY
        && value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}

fn local() -> Result<&'static Client, String> {
    match LOCAL.get_or_init(|| {
        Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(TIMEOUT)
            .build()
            .map_err(|_| "Could not prepare Riot Client connection".to_string())
    }) {
        Ok(client) => Ok(client),
        Err(error) => Err(error.clone()),
    }
}

fn api() -> Result<&'static Client, String> {
    match API.get_or_init(|| {
        Client::builder()
            .timeout(TIMEOUT)
            .build()
            .map_err(|_| "Could not prepare Valorant API connection".to_string())
    }) {
        Ok(client) => Ok(client),
        Err(error) => Err(error.clone()),
    }
}

pub async fn asset(url: String) -> Result<String, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid store image URL".to_string())?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("media.valorant-api.com") {
        return Err("Invalid store image URL".to_string());
    }
    let response = api()?
        .get(parsed)
        .send()
        .await
        .map_err(|_| "Couldn’t load store artwork".to_string())?
        .error_for_status()
        .map_err(|_| "Couldn’t load store artwork".to_string())?;
    if response
        .content_length()
        .is_some_and(|size| size > 8_000_000)
    {
        return Err("Store artwork is too large".to_string());
    }
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .split(';')
        .next()
        .unwrap_or("image/png")
        .to_string();
    if !["image/png", "image/jpeg", "image/webp"].contains(&mime.as_str()) {
        return Err("Unsupported store artwork".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Couldn’t read store artwork".to_string())?;
    if bytes.len() > 8_000_000 {
        return Err("Store artwork is too large".to_string());
    }
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn issue(label: &str, error: HttpError) -> String {
    match error.status() {
        Some(status) => format!("{label} (HTTP {})", status.as_u16()),
        None => label.to_string(),
    }
}
