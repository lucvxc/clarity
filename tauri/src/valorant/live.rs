use super::player;
use super::*;

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
        let queue_id = text(
            game.get("QueueID")
                .or_else(|| game.pointer("/MatchmakingData/QueueID")),
        )
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
        let (names, ranks, parties) = futures::join!(
            player::names(&auth, &roster),
            player::ranks(&auth, &roster),
            player::parties(&auth, &roster),
        );
        let groups = party_groups(&roster, &parties);
        let players = roster
            .iter()
            .map(|(team, player)| {
                let subject = text(player.get("Subject")).unwrap_or_default();
                player::match_player(
                    player,
                    team,
                    &auth,
                    &names,
                    &ranks,
                    groups.get(subject).copied(),
                )
            })
            .collect();

        return Ok(Some(MatchInfo {
            match_id: id,
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

pub async fn loadouts(id: String) -> Result<HashMap<String, Vec<WeaponLoadout>>, String> {
    if !uuid(&id) {
        return Err("Invalid match ID".to_string());
    }
    let lock = lock()?.ok_or_else(|| "Riot Client is not running".to_string())?;
    let auth = auth(&lock).await?;
    let root = format!("https://glz-{}-1.{}.a.pvp.net", auth.region, auth.shard);
    let url = format!("{root}/core-game/v1/matches/{id}/loadouts");
    let value: Value = get(&url, &auth.token, &auth.version).await?;
    let Some(entries) = get_ci(Some(&value), "Loadouts").and_then(Value::as_array) else {
        return Err("VALORANT returned no player loadouts".to_string());
    };
    Ok(read_loadouts(entries))
}

fn read_loadouts(entries: &[Value]) -> HashMap<String, Vec<WeaponLoadout>> {
    entries
        .iter()
        .filter_map(|entry| {
            let loadout = get_ci(Some(entry), "Loadout")?;
            let subject = text(get_ci(Some(loadout), "Subject"))?.to_lowercase();
            let items = get_ci(Some(loadout), "Items")?.as_object()?;
            let weapons = items
                .iter()
                .filter_map(|(key, item)| {
                    let sockets = get_ci(Some(item), "Sockets")?.as_object()?;
                    let item_ids = sockets
                        .values()
                        .filter_map(|socket| {
                            text(path_ci(Some(socket), &["Item", "ID"]))
                                .filter(|id| !id.eq_ignore_ascii_case(EMPTY))
                                .map(str::to_string)
                        })
                        .collect::<Vec<_>>();
                    (!item_ids.is_empty()).then(|| WeaponLoadout {
                        weapon_id: text(get_ci(Some(item), "ID")).unwrap_or(key).to_string(),
                        item_ids,
                    })
                })
                .collect::<Vec<_>>();
            Some((subject, weapons))
        })
        .collect()
}

pub async fn presence() -> Result<Option<Presence>, String> {
    let Some(lock) = lock()? else {
        return Ok(None);
    };
    let auth = auth(&lock).await?;
    let root = format!("https://glz-{}-1.{}.a.pvp.net", auth.region, auth.shard);
    let puuid = &auth.session.puuid;
    let mut phase = "lobby".to_string();
    let mut mode_id = None;
    let mut queue_id = None;

    for (name, player_path, match_path) in [
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
        phase = name.to_string();
        mode_id = text(game.get("ModeID").or_else(|| game.get("Mode"))).map(str::to_string);
        queue_id = text(
            game.get("QueueID")
                .or_else(|| game.pointer("/MatchmakingData/QueueID")),
        )
        .map(str::to_string);
        break;
    }

    let (party_id, party_size, party_queue) = party_info(&auth).await;
    if queue_id.is_none() {
        queue_id = party_queue;
    }

    Ok(Some(Presence {
        phase,
        mode_id,
        queue_id,
        party_id,
        party_size,
    }))
}

async fn party_info(auth: &Auth) -> (Option<String>, Option<u8>, Option<String>) {
    let root = format!("https://glz-{}-1.{}.a.pvp.net", auth.region, auth.shard);
    let subject = &auth.session.puuid;
    let player = get::<Value>(
        &format!("{root}/parties/v1/players/{subject}"),
        &auth.token,
        &auth.version,
    )
    .await
    .ok();
    let party = player.as_ref().and_then(|value| {
        text(
            value
                .get("CurrentPartyID")
                .or_else(|| value.get("currentPartyId")),
        )
    });
    let Some(party) = party else {
        return (None, None, None);
    };
    let info = get::<Value>(
        &format!("{root}/parties/v1/parties/{party}"),
        &auth.token,
        &auth.version,
    )
    .await
    .ok();
    let Some(info) = info else {
        return (None, None, None);
    };
    let size = get_ci(Some(&info), "Members")
        .and_then(Value::as_array)
        .map(|members| members.len().clamp(1, 5) as u8);
    let queue = text(
        path_ci(Some(&info), &["MatchmakingData", "QueueID"])
            .or_else(|| path_ci(Some(&info), &["MatchmakingData", "queueId"])),
    )
    .map(str::to_string);
    (Some(party.to_string()), size, queue)
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
        let mut stored = cache.lock().unwrap_or_else(|error| error.into_inner());
        stored.retain(|_, (at, queue)| {
            at.elapsed()
                < if queue.is_some() {
                    QUEUE_CACHE
                } else {
                    QUEUE_MISS
                }
        });
        if let Some((at, queue)) = stored.get(subject) {
            let lifetime = if queue.is_some() {
                QUEUE_CACHE
            } else {
                QUEUE_MISS
            };
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
        let party = text(
            player
                .get("CurrentPartyID")
                .or_else(|| player.get("currentPartyId")),
        )?;
        let info = get::<Value>(
            &format!("{root}/parties/v1/parties/{party}"),
            &auth.token,
            &auth.version,
        )
        .await
        .ok()?;
        text(
            info.pointer("/MatchmakingData/QueueID")
                .or_else(|| info.pointer("/MatchmakingData/queueId")),
        )
        .map(str::to_string)
    }
    .await;

    save_queue(subject, queue.clone());
    queue
}

fn save_queue(subject: &str, queue: Option<String>) {
    let cache = QUEUES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut cache = cache.lock().unwrap_or_else(|error| error.into_inner());
    cache.retain(|_, (at, old)| {
        at.elapsed()
            < if old.is_some() {
                QUEUE_CACHE
            } else {
                QUEUE_MISS
            }
    });
    cache.insert(subject.to_string(), (Instant::now(), queue));
}

fn missing(error: &str) -> bool {
    error.ends_with("(HTTP 404)")
}

fn party_groups(
    roster: &[(String, Value)],
    parties: &HashMap<String, String>,
) -> HashMap<String, u8> {
    let mut groups = HashMap::<String, Vec<String>>::new();
    for (_, player) in roster {
        let Some(subject) = text(player.get("Subject")) else {
            continue;
        };
        let Some(party) = parties.get(subject) else {
            continue;
        };
        groups
            .entry(party.clone())
            .or_default()
            .push(subject.to_string());
    }

    let mut groups = groups
        .into_values()
        .filter(|players| players.len() > 1)
        .collect::<Vec<_>>();
    groups.sort_by(|a, b| a[0].cmp(&b[0]));

    groups
        .into_iter()
        .enumerate()
        .flat_map(|(index, players)| {
            players
                .into_iter()
                .map(move |subject| (subject, index as u8 + 1))
        })
        .collect()
}

fn live_roster(game: &Value, puuid: &str) -> Vec<(String, Value)> {
    let Some(players) = game.get("Players").and_then(Value::as_array) else {
        return Vec::new();
    };
    let own_team = players
        .iter()
        .find(|player| text(player.get("Subject")).is_some_and(|id| id.eq_ignore_ascii_case(puuid)))
        .and_then(|player| text(player.get("TeamID")));

    players
        .iter()
        .filter_map(|player| {
            let team = text(player.get("TeamID"))?;
            Some((
                if own_team.is_some_and(|own| team.eq_ignore_ascii_case(own)) {
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
            .any(|player| {
                text(player.get("Subject")).is_some_and(|id| id.eq_ignore_ascii_case(puuid))
            })
            .then(|| text(team.get("TeamID")))
            .flatten()
    });

    for team in teams {
        let Some(team_id) = text(team.get("TeamID")) else {
            continue;
        };
        let label = if own_team.is_some_and(|own| team_id.eq_ignore_ascii_case(own)) {
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
