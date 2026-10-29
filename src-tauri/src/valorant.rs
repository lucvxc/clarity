use futures::future::join_all;
use reqwest::{Client, Error as HttpError};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use std::collections::HashMap;
use std::{
    env, fs,
    io::ErrorKind,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

const PLATFORM: &str = "ewoJInBsYXRmb3JtVHlwZSI6ICJQQyIsCgkicGxhdGZvcm1PUyI6ICJXaW5kb3dzIiwKCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjI2MjAwLjEuMjU2LjY0Yml0IiwKCSJwbGF0Zm9ybUNoaXBzZXQiOiAiVW5rbm93biIKfQ==";
const TIMEOUT: Duration = Duration::from_secs(6);
const CACHE: Duration = Duration::from_secs(900);
const QUEUE_CACHE: Duration = Duration::from_secs(60);
const QUEUE_MISS: Duration = Duration::from_secs(10);
const HISTORY: usize = 20;
const PROFILE_MATCHES: usize = 5;
const EMPTY: &str = "00000000-0000-0000-0000-000000000000";
const DEFAULT: &str = "9fb348bc-41a0-91ad-8a3e-818035c4e561";

static LOCAL: OnceLock<Result<Client, String>> = OnceLock::new();
static API: OnceLock<Result<Client, String>> = OnceLock::new();
static VERSION: OnceLock<Mutex<Option<(Instant, String)>>> = OnceLock::new();
static NAMES: OnceLock<Mutex<HashMap<String, PlayerName>>> = OnceLock::new();
static RANKS: OnceLock<Mutex<HashMap<String, (Instant, Option<u32>)>>> = OnceLock::new();
static PROFILES: OnceLock<Mutex<HashMap<String, (Instant, Option<ProfileStats>)>>> = OnceLock::new();
static QUEUES: OnceLock<Mutex<HashMap<String, (Instant, Option<String>)>>> = OnceLock::new();
static ROUTE: OnceLock<Mutex<Option<(Instant, String, String, String)>>> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    game_name: String,
    tag_line: String,
    player_card_id: String,
    card_default: bool,
    card_error: Option<String>,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    current_tier: Option<u32>,
    peak_tier: Option<u32>,
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

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentMatch {
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
    mvp: bool,
    competitive: bool,
    rr: Option<i32>,
    tier: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchInfo {
    phase: String,
    map_id: String,
    mode_id: String,
    queue_id: Option<String>,
    players: Vec<MatchPlayer>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchPlayer {
    name: String,
    tag_line: Option<String>,
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
    you: bool,
    hidden: bool,
}

#[derive(Clone, Default)]
struct ProfileStats {
    games: Option<u32>,
    wins: Option<u32>,
    kd: Option<f32>,
    headshot_pct: Option<f32>,
    acs: Option<f32>,
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

pub async fn account() -> Result<Option<Account>, String> {
    let Some(lock) = lock()? else {
        return Ok(None);
    };
    let client = local()?;
    let base = format!("https://127.0.0.1:{}", lock.port);

    let session: Session = match json(client, &base, &lock.pass, "/chat/v1/session").await {
        Ok(session) => session,
        Err(_) => return Ok(None),
    };

    if session.game_name.trim().is_empty()
        || session.game_tag.trim().is_empty()
        || !uuid(&session.puuid)
    {
        return Ok(None);
    }

    let (player_card_id, card_default, card_error) =
        match card(client, &base, &lock, &session).await {
            Ok(Some(card)) => (card, false, None),
            Ok(None) => (DEFAULT.to_string(), true, None),
            Err(error) => (DEFAULT.to_string(), true, Some(error)),
        };

    Ok(Some(Account {
        game_name: session.game_name,
        tag_line: session.game_tag,
        player_card_id,
        card_default,
        card_error,
    }))
}

pub async fn current_match() -> Result<Option<MatchInfo>, String> {
    let lock = lock()?.ok_or_else(|| "Riot Client is not running".to_string())?;
    let auth = auth(&lock).await?;
    let root = format!("https://glz-{}-1.{}.a.pvp.net", auth.region, auth.shard);
    let puuid = &auth.session.puuid;

    for (phase, player_path, match_path) in [
        (
            "live",
            format!("/core-game/v1/players/{puuid}"),
            "/core-game/v1/matches/",
        ),
        (
            "pregame",
            format!("/pregame/v1/players/{puuid}"),
            "/pregame/v1/matches/",
        ),
    ] {
        let Some(id) = match_id(&root, &player_path, &auth).await? else {
            continue;
        };
        let Some(game) = match_data(&root, match_path, &id, &auth).await? else {
            continue;
        };
        let (map_id, mode_id, roster) = if phase == "live" {
            (
                text(game.get("MapID")),
                text(game.get("ModeID")),
                live_roster(&game, puuid),
            )
        } else {
            (
                text(game.get("MapID")),
                text(game.get("Mode")),
                pregame_roster(&game, puuid),
            )
        };
        let map_id = map_id.ok_or_else(|| "Riot match data has no map ID".to_string())?;
        let mode_id = mode_id.ok_or_else(|| "Riot match data has no game mode".to_string())?;
        let queue_id = text(game.get("QueueID").or_else(|| game.pointer("/MatchmakingData/QueueID")))
            .map(str::to_string)
            .or_else(|| {
                (game.get("IsRanked").and_then(Value::as_bool) == Some(true))
                    .then(|| "competitive".to_string())
            });
        let queue_id = match queue_id {
            Some(queue) => Some(queue),
            None => party_queue(&auth).await,
        };
        if let Some(queue) = queue_id.as_deref() {
            save_queue(puuid, Some(queue.to_string()));
        }
        let (names, ranks, profiles) = futures::join!(
            names(&auth, &roster),
            ranks(&auth, &roster),
            profiles(&auth, &roster),
        );
        let players = roster
            .iter()
            .map(|(team, player)| match_player(player, team, &auth, &names, &ranks, &profiles))
            .collect();

        return Ok(Some(MatchInfo {
            phase: phase.to_string(),
            map_id: map_id.to_string(),
            mode_id: mode_id.to_string(),
            queue_id,
            players,
        }));
    }

    save_queue(puuid, None);
    Ok(None)
}

async fn match_id(root: &str, path: &str, auth: &Auth) -> Result<Option<String>, String> {
    let player: Value = match get(&format!("{root}{path}"), &auth.token, &auth.version).await {
        Ok(player) => player,
        Err(error) if missing(&error) => return Ok(None),
        Err(error) => return Err(error),
    };

    text(player.get("MatchID"))
        .map(str::to_string)
        .map(Some)
        .ok_or_else(|| "Riot match lookup returned no match ID".to_string())
}

async fn match_data(
    root: &str,
    path: &str,
    id: &str,
    auth: &Auth,
) -> Result<Option<Value>, String> {
    match get(&format!("{root}{path}{id}"), &auth.token, &auth.version).await {
        Ok(game) => Ok(Some(game)),
        Err(error) if missing(&error) => Ok(None),
        Err(error) => Err(error),
    }
}

async fn party_queue(auth: &Auth) -> Option<String> {
    let cache = QUEUES.get_or_init(|| Mutex::new(HashMap::new()));
    let subject = &auth.session.puuid;
    {
        let stored = cache.lock().unwrap_or_else(|error| error.into_inner());
        if let Some((at, queue)) = stored.get(subject) {
            let lifetime = if queue.is_some() { QUEUE_CACHE } else { QUEUE_MISS };
            if at.elapsed() < lifetime {
                return queue.clone();
            }
        }
    }

    let root = format!("https://glz-{}-1.{}.a.pvp.net", auth.region, auth.shard);
    let queue = async {
        let player = get::<Value>(
            &format!("{root}/parties/v1/players/{subject}"),
            &auth.token,
            &auth.version,
        )
        .await
        .ok()?;
        let party = text(player.get("CurrentPartyID").or_else(|| player.get("currentPartyId")))?;
        let info = get::<Value>(
            &format!("{root}/parties/v1/parties/{party}"),
            &auth.token,
            &auth.version,
        )
        .await
        .ok()?;
        text(info.pointer("/MatchmakingData/QueueID").or_else(|| info.pointer("/MatchmakingData/queueId")))
            .map(str::to_string)
    }
    .await;

    save_queue(subject, queue.clone());
    queue
}

fn save_queue(subject: &str, queue: Option<String>) {
    QUEUES
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .insert(subject.to_string(), (Instant::now(), queue));
}

fn missing(error: &str) -> bool {
    error.ends_with("(HTTP 404)")
}

pub async fn stats(limit: Option<usize>) -> Result<Stats, String> {
    let limit = limit.unwrap_or(5).clamp(1, 20);
    let Some(lock) = lock()? else {
        return Err("Riot Client is not running".to_string());
    };
    let auth = auth(&lock).await?;
    let root = format!("https://pd.{}.a.pvp.net", auth.shard);
    let mmr = get::<Value>(
        &format!("{root}/mmr/v1/players/{}", auth.session.puuid),
        &auth.token,
        &auth.version,
    )
    .await;
    let mut stats = match &mmr {
        Ok(mmr) => rank(mmr),
        Err(_) => Stats::default(),
    };

    let updates = get::<Value>(
        &format!(
            "{root}/mmr/v1/players/{}/competitiveupdates?startIndex=0&endIndex=19&queue=competitive",
            auth.session.puuid
        ),
        &auth.token,
        &auth.version,
    )
    .await;
    match &updates {
        Ok(updates) => rank_updates(&mut stats, updates),
        Err(_) => {}
    }
    let rr_changes = updates.as_ref().ok()
        .and_then(|value| value.get("Matches"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|game| Some((
            text(game.get("MatchID"))?.to_ascii_lowercase(),
            (
                signed(game.get("RankedRatingEarned"))
                    .or_else(|| signed(game.get("MmrChangeToLastGame")))
                    .or_else(|| {
                        let after = num(game.get("RankedRatingAfterUpdate"))? as i32;
                        let before = num(game.get("RankedRatingBeforeUpdate"))? as i32;
                        Some(after - before)
                    }),
                num(game.get("TierAfterUpdate")),
            ),
        )))
        .collect::<HashMap<_, _>>();
    if stats.current_tier.is_none() {
        stats.rank_error = Some(match (&mmr, &updates) {
            (Err(mmr_error), Err(updates_error)) => {
                format!("MMR request: {mmr_error}; competitive updates: {updates_error}")
            }
            (Err(error), _) | (_, Err(error)) => error.clone(),
            (Ok(_), Ok(_)) => {
                "Riot returned no competitive rank entries for this account".to_string()
            }
        });
    }

    let history: Value = match get(
        &format!(
            "{root}/match-history/v1/history/{}?startIndex=0&endIndex={}",
            auth.session.puuid,
            HISTORY - 1
        ),
        &auth.token,
        &auth.version,
    )
    .await
    {
        Ok(history) => history,
        Err(error) => {
            stats.match_error = Some(error);
            return Ok(stats);
        }
    };

    let Some(matches) = history.get("History").and_then(Value::as_array) else {
        return Ok(stats);
    };
    stats.recent_games = Some(matches.len().min(limit) as u32);

    let mut kills = 0;
    let mut deaths = 0;
    let mut headshots = 0;
    let mut bodyshots = 0;
    let mut legshots = 0;
    let mut agents = HashMap::<String, u32>::new();
    let token = &auth.token;
    let version = &auth.version;
    let ids = matches
        .iter()
        .take(HISTORY)
        .enumerate()
        .filter_map(|(index, game)| {
            game.get("MatchID")
                .and_then(Value::as_str)
                .map(|id| (index, id.to_string()))
        })
        .collect::<Vec<_>>();
    let mut details = Vec::with_capacity(ids.len());
    for batch in ids.chunks(5) {
        let loaded = join_all(batch.iter().map(|(index, id)| {
            let index = *index;
            let url = format!("{root}/match-details/v1/matches/{id}");
            async move { (index, get::<Value>(&url, token, version).await.ok()) }
        }))
        .await;
        details.extend(
            loaded
                .into_iter()
                .filter_map(|(index, detail)| detail.map(|detail| (index, detail))),
        );
    }
    for (match_index, detail) in details {
        let Some(player) = detail
            .get("players")
            .or_else(|| detail.get("Players"))
            .and_then(Value::as_array)
            .and_then(|players| {
                players.iter().find(|player| {
                    player
                        .get("subject")
                        .or_else(|| player.get("Subject"))
                        .and_then(Value::as_str)
                        == Some(&auth.session.puuid)
                })
            })
        else {
            continue;
        };

        let values = player.get("stats").or_else(|| player.get("Stats"));
        let game_kills = num(values.and_then(|values| values.get("kills").or_else(|| values.get("Kills")))).unwrap_or(0);
        let game_deaths = num(values.and_then(|values| values.get("deaths").or_else(|| values.get("Deaths")))).unwrap_or(0);
        let game_assists = num(values.and_then(|values| values.get("assists").or_else(|| values.get("Assists"))));
        if match_index < limit {
            kills += game_kills;
            deaths += game_deaths;
        }
        let mut shots = (0, 0, 0);
        if let Some(rounds) = detail
            .get("roundResults")
            .or_else(|| detail.get("RoundResults"))
            .and_then(Value::as_array)
        {
            for round in rounds {
                let Some(players) = round
                    .get("playerStats")
                    .or_else(|| round.get("PlayerStats"))
                    .and_then(Value::as_array)
                else {
                    continue;
                };
                let Some(entry) = players.iter().find(|entry| {
                    text(entry.get("subject").or_else(|| entry.get("Subject")))
                        == Some(&auth.session.puuid)
                }) else {
                    continue;
                };
                if let Some(damage) = entry
                    .get("damage")
                    .or_else(|| entry.get("Damage"))
                    .and_then(Value::as_array)
                {
                    for hit in damage {
                        shots.0 +=
                            num(hit.get("headshots").or_else(|| hit.get("Headshots"))).unwrap_or(0);
                        shots.1 +=
                            num(hit.get("bodyshots").or_else(|| hit.get("Bodyshots"))).unwrap_or(0);
                        shots.2 +=
                            num(hit.get("legshots").or_else(|| hit.get("Legshots"))).unwrap_or(0);
                    }
                }
            }
        }
        if shots == (0, 0, 0) {
            if let Some(values) = player.get("stats").or_else(|| player.get("Stats")) {
                shots.0 =
                    num(values.get("headshots").or_else(|| values.get("Headshots"))).unwrap_or(0);
                shots.1 =
                    num(values.get("bodyshots").or_else(|| values.get("Bodyshots"))).unwrap_or(0);
                shots.2 =
                    num(values.get("legshots").or_else(|| values.get("Legshots"))).unwrap_or(0);
            }
        }
        if match_index < limit {
            headshots += shots.0;
            bodyshots += shots.1;
            legshots += shots.2;
        }
        let agent_id = player
            .get("characterId")
            .or_else(|| player.get("CharacterID"))
            .and_then(Value::as_str)
            .filter(|value| uuid(value))
            .map(str::to_string);
        if match_index < limit {
            if let Some(agent) = agent_id.as_ref() {
            *agents.entry(agent.to_string()).or_default() += 1;
            }
        }
        let history_game = matches.get(match_index);
        let info = detail.get("matchInfo").or_else(|| detail.get("MatchInfo"));
        let match_id = text(info.and_then(|info| info.get("matchId").or_else(|| info.get("MatchID"))))
            .or_else(|| text(history_game.and_then(|game| game.get("MatchID").or_else(|| game.get("matchId")))));
        let map_id = text(info.and_then(|info| info.get("mapId").or_else(|| info.get("MapID")))).unwrap_or_default().to_string();
        let started = info.and_then(|info| info.get("gameStartMillis").or_else(|| info.get("GameStartMillis"))).and_then(Value::as_u64);
        let queue = text(history_game.and_then(|game| game.get("QueueID").or_else(|| game.get("queueId"))))
            .or_else(|| text(info.and_then(|info| info.get("queueId").or_else(|| info.get("QueueID")))))
            .map(str::to_string);
        let mode = text(info.and_then(|info| info.get("gameMode").or_else(|| info.get("ModeID")))).map(str::to_string);
        let team_id = text(player.get("teamId").or_else(|| player.get("TeamID")));
        let team = detail.get("teams").or_else(|| detail.get("Teams")).and_then(Value::as_array).and_then(|teams| teams.iter().find(|team| text(team.get("teamId").or_else(|| team.get("TeamID"))) == team_id));
        let won = team.and_then(|team| team.get("won").or_else(|| team.get("Won"))).and_then(Value::as_bool);
        let round_score = round_score(&detail, team_id);
        let rounds_won = team.and_then(|team| num(team.get("roundsWon").or_else(|| team.get("RoundsWon"))))
            .or_else(|| round_score.map(|score| score.0));
        let rounds_lost = team.and_then(|team| num(team.get("roundsLost").or_else(|| team.get("RoundsLost"))))
            .or_else(|| round_score.map(|score| score.1));
        let played = num(values.and_then(|values| values.get("roundsPlayed").or_else(|| values.get("RoundsPlayed")))).unwrap_or(0);
        let score = num(values.and_then(|values| values.get("score").or_else(|| values.get("Score"))));
        let rr_match = match_id
            .map(str::to_ascii_lowercase)
            .and_then(|id| rr_changes.get(&id));
        let competitive = queue.as_deref().is_some_and(|queue| {
            queue.eq_ignore_ascii_case("competitive")
                || queue.to_ascii_lowercase().contains("competitive")
        }) || rr_match.is_some();
        let queue = if competitive {
            Some("competitive".to_string())
        } else {
            queue.or_else(|| mode.clone())
        };
        let team_score = detail
            .get("players")
            .or_else(|| detail.get("Players"))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|candidate| text(candidate.get("teamId").or_else(|| candidate.get("TeamID"))) == team_id)
            .filter_map(|candidate| {
                num(candidate.get("stats").or_else(|| candidate.get("Stats")).and_then(|stats| stats.get("score").or_else(|| stats.get("Score"))))
            })
            .max();
        stats.recent_matches.push(RecentMatch {
            map_id,
            queue,
            mode,
            agent_id,
            started,
            won,
            rounds_won,
            rounds_lost,
            kills: Some(game_kills),
            deaths: Some(game_deaths),
            assists: game_assists,
            kd: (game_deaths > 0).then_some(game_kills as f32 / game_deaths as f32),
            acs: (played.max(rounds_won.unwrap_or(0) + rounds_lost.unwrap_or(0)) > 0)
                .then(|| score.unwrap_or(0) / played.max(rounds_won.unwrap_or(0) + rounds_lost.unwrap_or(0))),
            score,
            mvp: score.is_some() && score == team_score,
            competitive,
            rr: rr_match.and_then(|(rr, _)| *rr),
            tier: rr_match.and_then(|(_, tier)| *tier),
        });
    }

    if stats.recent_games.unwrap_or(0) > 0 && deaths > 0 {
        stats.kd = Some(kills as f32 / deaths as f32);
    }
    let shots = headshots + bodyshots + legshots;
    if shots > 0 {
        stats.headshots = Some(headshots);
        stats.bodyshots = Some(bodyshots);
        stats.legshots = Some(legshots);
        stats.headshot_pct = Some(headshots as f32 * 100.0 / shots as f32);
        stats.bodyshot_pct = Some(bodyshots as f32 * 100.0 / shots as f32);
        stats.legshot_pct = Some(legshots as f32 * 100.0 / shots as f32);
    }
    if let Some((agent, count)) = agents.into_iter().max_by_key(|(_, count)| *count) {
        stats.agent = Some(agent);
        stats.agent_games = Some(count);
    }

    Ok(stats)
}

async fn auth(lock: &Lock) -> Result<Auth, String> {
    let local = local()?;
    let base = format!("https://127.0.0.1:{}", lock.port);
    let session: Session = json(local, &base, &lock.pass, "/chat/v1/session").await?;
    if session.game_name.trim().is_empty()
        || session.game_tag.trim().is_empty()
        || !uuid(&session.puuid)
    {
        return Err("Riot Client returned an incomplete session".to_string());
    }

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

fn live_roster(game: &Value, puuid: &str) -> Vec<(String, Value)> {
    let Some(players) = game.get("Players").and_then(Value::as_array) else {
        return Vec::new();
    };
    let own_team = players
        .iter()
        .find(|player| text(player.get("Subject")) == Some(puuid))
        .and_then(|player| text(player.get("TeamID")));

    players
        .iter()
        .filter_map(|player| {
            let team = text(player.get("TeamID"))?;
            Some((
                if Some(team) == own_team {
                    "ally"
                } else {
                    "enemy"
                }
                .to_string(),
                player.clone(),
            ))
        })
        .collect()
}

fn pregame_roster(game: &Value, puuid: &str) -> Vec<(String, Value)> {
    let mut roster = Vec::new();
    for (key, team) in [("AllyTeam", "ally"), ("EnemyTeam", "enemy")] {
        if let Some(players) = game
            .get(key)
            .and_then(|value| value.get("Players"))
            .and_then(Value::as_array)
        {
            roster.extend(
                players
                    .iter()
                    .cloned()
                    .map(|player| (team.to_string(), player)),
            );
        }
    }

    if !roster.is_empty() {
        return roster;
    }

    let Some(teams) = game.get("Teams").and_then(Value::as_array) else {
        return roster;
    };
    let own_team = teams.iter().find_map(|team| {
        let players = team.get("Players")?.as_array()?;
        players
            .iter()
            .any(|player| text(player.get("Subject")) == Some(puuid))
            .then(|| text(team.get("TeamID")))
            .flatten()
    });

    for team in teams {
        let Some(team_id) = text(team.get("TeamID")) else {
            continue;
        };
        let label = if Some(team_id) == own_team {
            "ally"
        } else {
            "enemy"
        };
        if let Some(players) = team.get("Players").and_then(Value::as_array) {
            roster.extend(
                players
                    .iter()
                    .cloned()
                    .map(|player| (label.to_string(), player)),
            );
        }
    }
    roster
}

async fn names(auth: &Auth, roster: &[(String, Value)]) -> HashMap<String, PlayerName> {
    let cache = NAMES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut missing = Vec::new();
    {
        let cache = cache.lock().unwrap_or_else(|error| error.into_inner());
        for (_, player) in roster {
            if let Some(subject) = text(player.get("Subject")) {
                let hidden = player
                    .pointer("/PlayerIdentity/Incognito")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                if !hidden
                    && subject != auth.session.puuid
                    && !cache.contains_key(subject)
                    && !missing.iter().any(|value| value == subject)
                {
                    missing.push(subject.to_string());
                }
            }
        }
    }

    if !missing.is_empty() {
        let url = format!(
            "https://pd.{}.a.pvp.net/name-service/v2/players",
            auth.shard
        );
        if let Ok(client) = api() {
            if let Ok(response) = client
                .put(url)
                .header("X-Riot-ClientPlatform", PLATFORM)
                .header("X-Riot-ClientVersion", &auth.version)
                .header("X-Riot-Entitlements-JWT", &auth.token.token)
                .bearer_auth(&auth.token.access_token)
                .json(&missing)
                .send()
                .await
            {
                if let Ok(response) = response.error_for_status() {
                    if let Ok(rows) = response.json::<Vec<Value>>().await {
                        let mut cache = cache.lock().unwrap_or_else(|error| error.into_inner());
                        for row in rows {
                            let Some(subject) = text(row.get("Subject")) else {
                                continue;
                            };
                            let Some(game) = text(row.get("GameName")) else {
                                continue;
                            };
                            let Some(tag) = text(row.get("TagLine")) else {
                                continue;
                            };
                            cache.insert(
                                subject.to_string(),
                                PlayerName {
                                    game: game.to_string(),
                                    tag: tag.to_string(),
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    cache
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone()
}

async fn ranks(auth: &Auth, roster: &[(String, Value)]) -> HashMap<String, u32> {
    let cache = RANKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut found = HashMap::new();
    let mut missing = Vec::new();
    {
        let stored = cache.lock().unwrap_or_else(|error| error.into_inner());
        for (_, player) in roster {
            let Some(subject) = text(player.get("Subject")) else {
                continue;
            };
            if player
                .pointer("/PlayerIdentity/Incognito")
                .and_then(Value::as_bool)
                == Some(true)
                && subject != auth.session.puuid
            {
                continue;
            }
            if num(player.get("CompetitiveTier")).is_some_and(|tier| tier >= 3)
                || num(player.pointer("/SeasonalBadgeInfo/Rank")).is_some_and(|tier| tier >= 3)
            {
                continue;
            }
            if let Some((time, tier)) = stored.get(subject) {
                // Cache missing ranks too, so live-match polling doesn't retry rate-limited lookups every few seconds.
                if time.elapsed() < Duration::from_secs(300) {
                    if let Some(tier) = tier {
                        found.insert(subject.to_string(), *tier);
                    }
                    continue;
                }
            }
            if !missing.iter().any(|id| id == subject) {
                missing.push(subject.to_string());
            }
        }
    }

    let results = join_all(missing.iter().map(|subject| async move {
        let url = format!(
            "https://pd.{}.a.pvp.net/mmr/v1/players/{subject}",
            auth.shard
        );
        let mmr = get::<Value>(&url, &auth.token, &auth.version).await.ok();
        let current = mmr.as_ref().and_then(|value| rank(value).current_tier);
        let tier = if current.is_some_and(|tier| tier >= 3) {
            current
        } else {
            let updates =
                format!("{url}/competitiveupdates?startIndex=0&endIndex=19&queue=competitive");
            let recent = get::<Value>(&updates, &auth.token, &auth.version)
                .await
                .ok()
                .and_then(|value| value.get("Matches").and_then(Value::as_array).cloned())
                .and_then(|games| {
                    games
                        .into_iter()
                        .max_by_key(|game| num(game.get("MatchStartTime")).unwrap_or(0))
                })
                .and_then(|game| num(game.get("TierAfterUpdate")));
            recent.filter(|tier| *tier >= 3).or(current).or(recent)
        };
        (subject.clone(), tier)
    }))
    .await;
    let mut stored = cache.lock().unwrap_or_else(|error| error.into_inner());
    for (subject, tier) in results {
        stored.insert(subject.clone(), (Instant::now(), tier));
        if let Some(tier) = tier {
            found.insert(subject, tier);
        }
    }
    found
}

async fn profiles(auth: &Auth, roster: &[(String, Value)]) -> HashMap<String, ProfileStats> {
    let cache = PROFILES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut found = HashMap::new();
    let mut missing = Vec::new();
    {
        let stored = cache.lock().unwrap_or_else(|error| error.into_inner());
        for (_, player) in roster {
            let Some(subject) = text(player.get("Subject")) else {
                continue;
            };
            if player
                    .pointer("/PlayerIdentity/Incognito")
                    .and_then(Value::as_bool)
                    == Some(true)
            {
                continue;
            }
            if let Some((time, profile)) = stored.get(subject) {
                let lifetime = if profile.is_some() { 900 } else { 300 };
                if time.elapsed() < Duration::from_secs(lifetime) {
                    if let Some(profile) = profile {
                        found.insert(subject.to_string(), profile.clone());
                    }
                    continue;
                }
            }
            if !missing.iter().any(|value| value == subject) {
                missing.push(subject.to_string());
            }
        }
    }

    for batch in missing.chunks(2) {
        let results = join_all(batch.iter().map(|subject| async move {
            (subject.clone(), profile(auth, subject).await)
        }))
        .await;
        let mut stored = cache.lock().unwrap_or_else(|error| error.into_inner());
        for (subject, profile) in results {
            stored.insert(subject.clone(), (Instant::now(), profile.clone()));
            if let Some(profile) = profile {
                found.insert(subject, profile);
            }
        }
    }

    found
}

async fn profile(auth: &Auth, subject: &str) -> Option<ProfileStats> {
    let root = format!("https://pd.{}.a.pvp.net", auth.shard);
    let mmr_url = format!("{root}/mmr/v1/players/{subject}");
    let history_url = format!(
        "{root}/match-history/v1/history/{subject}?startIndex=0&endIndex={}",
        PROFILE_MATCHES - 1
    );
    let (mmr, history) = futures::join!(
        async {
            if subject == auth.session.puuid {
                None
            } else {
                get::<Value>(&mmr_url, &auth.token, &auth.version).await.ok()
            }
        },
        get::<Value>(&history_url, &auth.token, &auth.version),
    );
    let mut profile = mmr
        .map(|value| {
            let ranked = rank(&value);
            ProfileStats {
                games: ranked.games,
                wins: ranked.wins,
                ..ProfileStats::default()
            }
        })
        .unwrap_or_default();
    let ids = history
        .ok()
        .and_then(|value| value.get("History").and_then(Value::as_array).cloned())
        .unwrap_or_default()
        .into_iter()
        .take(PROFILE_MATCHES)
        .filter_map(|game| game.get("MatchID").and_then(Value::as_str).map(str::to_string))
        .collect::<Vec<_>>();
    let root = root.as_str();
    let details = join_all(ids.iter().map(|id| async move {
        let url = format!("{root}/match-details/v1/matches/{id}");
        get::<Value>(&url, &auth.token, &auth.version).await.ok()
    }))
    .await;

    let mut kills = 0;
    let mut deaths = 0;
    let mut headshots = 0;
    let mut bodyshots = 0;
    let mut legshots = 0;
    let mut score = 0;
    let mut rounds = 0;
    for detail in details.into_iter().flatten() {
        let Some(player) = detail
            .get("players")
            .or_else(|| detail.get("Players"))
            .and_then(Value::as_array)
            .and_then(|players| {
                players.iter().find(|player| {
                    text(player.get("subject").or_else(|| player.get("Subject"))) == Some(subject)
                })
            })
        else {
            continue;
        };
        let values = player.get("stats").or_else(|| player.get("Stats"));
        kills += num(values.and_then(|values| values.get("kills").or_else(|| values.get("Kills"))))
            .unwrap_or(0);
        deaths += num(values.and_then(|values| values.get("deaths").or_else(|| values.get("Deaths"))))
            .unwrap_or(0);
        if let Some(game_score) = num(values.and_then(|values| values.get("score").or_else(|| values.get("Score")))) {
            let game_rounds = num(values.and_then(|values| values.get("roundsPlayed").or_else(|| values.get("RoundsPlayed"))))
                .or_else(|| {
                    detail
                        .get("roundResults")
                        .or_else(|| detail.get("RoundResults"))
                        .and_then(Value::as_array)
                        .map(|rounds| rounds.len() as u32)
                })
                .unwrap_or(0);
            if game_rounds > 0 {
                score += game_score;
                rounds += game_rounds;
            }
        }
        let mut hits = (0, 0, 0);
        if let Some(rounds) = detail
            .get("roundResults")
            .or_else(|| detail.get("RoundResults"))
            .and_then(Value::as_array)
        {
            for round in rounds {
                let Some(players) = round
                    .get("playerStats")
                    .or_else(|| round.get("PlayerStats"))
                    .and_then(Value::as_array)
                else {
                    continue;
                };
                if let Some(entry) = players.iter().find(|entry| {
                    text(entry.get("subject").or_else(|| entry.get("Subject"))) == Some(subject)
                }) {
                    if let Some(damage) = entry
                        .get("damage")
                        .or_else(|| entry.get("Damage"))
                        .and_then(Value::as_array)
                    {
                        for hit in damage {
                            hits.0 += num(hit.get("headshots").or_else(|| hit.get("Headshots")))
                                .unwrap_or(0);
                            hits.1 += num(hit.get("bodyshots").or_else(|| hit.get("Bodyshots")))
                                .unwrap_or(0);
                            hits.2 += num(hit.get("legshots").or_else(|| hit.get("Legshots")))
                                .unwrap_or(0);
                        }
                    }
                }
            }
        }
        if hits == (0, 0, 0) {
            hits.0 += num(values.and_then(|values| values.get("headshots").or_else(|| values.get("Headshots"))))
                .unwrap_or(0);
            hits.1 += num(values.and_then(|values| values.get("bodyshots").or_else(|| values.get("Bodyshots"))))
                .unwrap_or(0);
            hits.2 += num(values.and_then(|values| values.get("legshots").or_else(|| values.get("Legshots"))))
                .unwrap_or(0);
        }
        headshots += hits.0;
        bodyshots += hits.1;
        legshots += hits.2;
    }

    if deaths > 0 {
        profile.kd = Some(kills as f32 / deaths as f32);
    }
    let total_shots = headshots + bodyshots + legshots;
    if total_shots > 0 {
        profile.headshot_pct = Some(headshots as f32 * 100.0 / total_shots as f32);
    }
    if rounds > 0 {
        profile.acs = Some(score as f32 / rounds as f32);
    }
    (profile.games.is_some()
        || profile.kd.is_some()
        || profile.headshot_pct.is_some()
        || profile.acs.is_some())
        .then_some(profile)
}

fn match_player(
    player: &Value,
    team: &str,
    auth: &Auth,
    names: &HashMap<String, PlayerName>,
    ranks: &HashMap<String, u32>,
    profiles: &HashMap<String, ProfileStats>,
) -> MatchPlayer {
    let subject = text(player.get("Subject")).unwrap_or_default();
    let identity = player.get("PlayerIdentity").unwrap_or(&Value::Null);
    let hidden = identity
        .get("Incognito")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let you = subject == auth.session.puuid;
    let name = if hidden && !you {
        "Anonymous".to_string()
    } else if you {
        auth.session.game_name.clone()
    } else {
        names
            .get(subject)
            .map(|value| value.game.clone())
            .unwrap_or_else(|| "Unknown player".to_string())
    };
    let tag_line = if you {
        Some(auth.session.game_tag.clone())
    } else if hidden {
        None
    } else {
        names.get(subject).map(|value| value.tag.clone())
    };
    let level_hidden = identity
        .get("HideAccountLevel")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let rank = num(player.get("CompetitiveTier"))
        .filter(|tier| *tier >= 3)
        .or_else(|| num(player.pointer("/SeasonalBadgeInfo/Rank")).filter(|tier| *tier >= 3))
        .or_else(|| ranks.get(subject).copied());
    let agent = text(player.get("CharacterID"))
        .filter(|value| uuid(value))
        .map(str::to_string);
    let profile = profiles.get(subject);

    MatchPlayer {
        name,
        tag_line,
        agent_id: agent,
        team: team.to_string(),
        tier: rank,
        level: (!level_hidden)
            .then(|| num(identity.get("AccountLevel")))
            .flatten(),
        games: profile.and_then(|profile| profile.games),
        wins: profile.and_then(|profile| profile.wins),
        kd: profile.and_then(|profile| profile.kd),
        headshot_pct: profile.and_then(|profile| profile.headshot_pct),
        acs: profile.and_then(|profile| profile.acs),
        selection: text(player.get("CharacterSelectionState")).map(str::to_string),
        you,
        hidden,
    }
}

fn rank_updates(stats: &mut Stats, updates: &Value) {
    let Some(matches) = updates.get("Matches").and_then(Value::as_array) else {
        return;
    };
    let latest = matches
        .iter()
        .max_by_key(|game| num(game.get("MatchStartTime")).unwrap_or(0));
    if stats.current_tier.is_none() {
        stats.current_tier = latest.and_then(|game| num(game.get("TierAfterUpdate")));
    }
    if stats.rating.is_none() {
        stats.rating = latest.and_then(|game| num(game.get("RankedRatingAfterUpdate")));
    }
    if stats.peak_tier.is_none() {
        stats.peak_tier = matches
            .iter()
            .filter_map(|game| num(game.get("TierAfterUpdate")))
            .filter(|tier| *tier > 0)
            .max();
    }
}

async fn card(
    local: &Client,
    base: &str,
    lock: &Lock,
    session: &Session,
) -> Result<Option<String>, String> {
    let token: Token = json(local, base, &lock.pass, "/entitlements/v1/token").await?;
    if token.access_token.is_empty() || token.token.is_empty() {
        return Err("Riot Client returned incomplete account tokens".to_string());
    }

    let version = version().await?;
    let loadout: Loadout = api()?
        .get(format!(
            "https://pd.{}.a.pvp.net/personalization/v3/players/{}/playerloadout",
            routes(&session.region)
                .ok_or_else(|| "Could not determine Riot's VALORANT region".to_string())?
                .1,
            session.puuid
        ))
        .header("X-Riot-ClientPlatform", PLATFORM)
        .header("X-Riot-ClientVersion", version)
        .header("X-Riot-Entitlements-JWT", token.token)
        .bearer_auth(token.access_token)
        .send()
        .await
        .map_err(|error| issue("Player card request failed", error))?
        .error_for_status()
        .map_err(|error| issue("Player card request failed", error))?
        .json()
        .await
        .map_err(|_| "Riot returned an invalid player loadout".to_string())?;

    Ok(uuid(&loadout.identity.card).then_some(loadout.identity.card))
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
    let seasons = mmr
        .pointer("/QueueSkills/competitive/SeasonalInfoBySeasonID")
        .and_then(Value::as_object);
    let latest = mmr.get("LatestCompetitiveUpdate");
    let current = latest
        .and_then(|value| value.get("SeasonID"))
        .and_then(Value::as_str)
        .and_then(|id| seasons.and_then(|values| values.get(id)))
        .or_else(|| {
            seasons.and_then(|values| {
                values.values().max_by_key(|season| {
                    num(season.pointer("/LatestCompetitiveUpdate/MatchStartTime")).unwrap_or(0)
                })
            })
        });

    let season_tier = num(current.and_then(|value| value.get("CompetitiveTier")));
    let update_tier = latest
        .and_then(|value| value.get("TierAfterUpdate"))
        .and_then(|value| num(Some(value)));
    let queue_tier = num(mmr.pointer("/QueueSkills/competitive/CompetitiveTier"));
    let tier = [season_tier, update_tier, queue_tier]
        .into_iter()
        .flatten()
        .find(|tier| *tier > 0)
        .or(season_tier)
        .or(update_tier)
        .or(queue_tier);
    stats.current_tier = tier;
    stats.rating = latest
        .and_then(|value| value.get("RankedRatingAfterUpdate"))
        .and_then(|value| num(Some(value)))
        .or_else(|| num(current.and_then(|value| value.get("RankedRating"))));
    stats.games = num(current.and_then(|value| value.get("NumberOfGames")));
    stats.wins = num(current.and_then(|value| value.get("NumberOfWins")));

    let mut peak = stats.current_tier.unwrap_or(0);
    if let Some(seasons) = seasons {
        for season in seasons.values() {
            if let Some(wins) = season.get("WinsByTier").and_then(Value::as_object) {
                for (tier, count) in wins {
                    if count.as_u64().unwrap_or(0) > 0 {
                        peak = peak.max(tier.parse().unwrap_or(0));
                    }
                }
            }
        }
    }
    stats.peak_tier = (peak > 0).then_some(peak);
    stats
}

fn num(value: Option<&Value>) -> Option<u32> {
    value
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
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
        let Some(winner) = text(round.get("winningTeam").or_else(|| round.get("WinningTeam"))) else {
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
        .and_then(Value::as_i64)
        .and_then(|value| i32::try_from(value).ok())
}

async fn version() -> Result<String, String> {
    let cache = VERSION.get_or_init(|| Mutex::new(None));
    if let Some((at, value)) = cache
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .as_ref()
    {
        if at.elapsed() < CACHE {
            return Ok(value.clone());
        }
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
    {
        if cached_region == &key && at.elapsed() < CACHE {
            return Some((game.clone(), shard.clone()));
        }
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

fn issue(label: &str, error: HttpError) -> String {
    match error.status() {
        Some(status) => format!("{label} (HTTP {})", status.as_u16()),
        None => label.to_string(),
    }
}
