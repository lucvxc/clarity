use super::*;
use futures::future::join_all;

pub(super) async fn parties(auth: &Auth, roster: &[(String, Value)]) -> HashMap<String, String> {
    let cache = PARTIES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut subjects = roster
        .iter()
        .filter_map(|(_, player)| text(player.get("Subject")).map(str::to_string))
        .collect::<Vec<_>>();
    subjects.sort();
    subjects.dedup();

    let mut found = HashMap::new();
    let mut missing = Vec::new();
    {
        let mut cache = cache.lock().unwrap_or_else(|error| error.into_inner());
        cache.retain(|_, (at, party)| {
            at.elapsed()
                < if party.is_some() {
                    PARTY_CACHE
                } else {
                    PARTY_MISS
                }
        });
        for subject in subjects {
            if let Some((at, party)) = cache.get(&subject) {
                let lifetime = if party.is_some() {
                    PARTY_CACHE
                } else {
                    PARTY_MISS
                };
                if at.elapsed() < lifetime {
                    if let Some(party) = party {
                        found.insert(subject, party.clone());
                    }
                    continue;
                }
            }
            missing.push(subject);
        }
    }

    if missing.is_empty() {
        return found;
    }

    let root = format!("https://glz-{}-1.{}.a.pvp.net", auth.region, auth.shard);
    let token = &auth.token;
    let version = &auth.version;
    let loaded = join_all(missing.iter().map(|subject| {
        let url = format!("{root}/parties/v1/players/{subject}");
        async move {
            get::<Value>(&url, token, version)
                .await
                .ok()
                .and_then(|player| {
                    text(
                        player
                            .get("CurrentPartyID")
                            .or_else(|| player.get("currentPartyId")),
                    )
                    .map(str::to_string)
                })
        }
    }))
    .await;

    let now = Instant::now();
    let mut cache = cache.lock().unwrap_or_else(|error| error.into_inner());
    for (subject, party) in missing.into_iter().zip(loaded) {
        cache.insert(subject.clone(), (now, party.clone()));
        if let Some(party) = party {
            found.insert(subject, party);
        }
    }
    found
}

pub(super) async fn names(auth: &Auth, roster: &[(String, Value)]) -> HashMap<String, PlayerName> {
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
                    && !subject.eq_ignore_ascii_case(&auth.session.puuid)
                    && !cache.contains_key(&subject.to_ascii_lowercase())
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
        if let Ok(client) = api()
            && let Ok(response) = client
                .put(url)
                .header("X-Riot-ClientPlatform", PLATFORM)
                .header("X-Riot-ClientVersion", &auth.version)
                .header("X-Riot-Entitlements-JWT", &auth.token.token)
                .bearer_auth(&auth.token.access_token)
                .json(&missing)
                .send()
                .await
            && let Ok(response) = response.error_for_status()
            && let Ok(rows) = response.json::<Vec<Value>>().await
        {
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
                    subject.to_ascii_lowercase(),
                    PlayerName {
                        game: game.to_string(),
                        tag: tag.to_string(),
                    },
                );
            }
            while cache.len() > NAME_LIMIT {
                let Some(evict) = cache
                    .keys()
                    .find(|subject| !missing.contains(*subject))
                    .cloned()
                else {
                    break;
                };
                cache.remove(&evict);
            }
        }
    }

    let cache = cache.lock().unwrap_or_else(|error| error.into_inner());
    roster
        .iter()
        .filter_map(|(_, player)| {
            let subject = text(player.get("Subject"))?;
            let name = cache.get(&subject.to_ascii_lowercase())?.clone();
            Some((subject.to_string(), name))
        })
        .collect()
}

pub(super) async fn ranks(auth: &Auth, roster: &[(String, Value)]) -> HashMap<String, u32> {
    let cache = RANKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut found = HashMap::new();
    let mut missing = Vec::new();
    {
        let mut stored = cache.lock().unwrap_or_else(|error| error.into_inner());
        stored.retain(|_, (time, tier)| {
            time.elapsed()
                < if tier.is_some() {
                    RANK_TTL
                } else {
                    RANK_MISS_TTL
                }
        });
        for (_, player) in roster {
            let Some(subject) = text(player.get("Subject")) else {
                continue;
            };
            if player
                .pointer("/PlayerIdentity/Incognito")
                .and_then(Value::as_bool)
                == Some(true)
                && !subject.eq_ignore_ascii_case(&auth.session.puuid)
            {
                continue;
            }
            if num(player.get("CompetitiveTier")).is_some_and(|tier| tier >= 3)
                || num(player.pointer("/SeasonalBadgeInfo/Rank")).is_some_and(|tier| tier >= 3)
            {
                continue;
            }
            if let Some((_, tier)) = stored.get(subject) {
                // Cache missing ranks too, so live-match polling doesn't retry rate-limited lookups every few seconds.
                if let Some(tier) = tier {
                    found.insert(subject.to_string(), *tier);
                }
                continue;
            }
            if !missing.iter().any(|id| id == subject) {
                missing.push(subject.to_string());
            }
        }
    }

    for batch in missing.chunks(2) {
        let results = join_all(batch.iter().map(|subject| async move {
            let url = format!(
                "https://pd.{}.a.pvp.net/mmr/v1/players/{subject}",
                auth.shard
            );
            let mmr = rank_data(&url, &auth.token, &auth.version).await.ok();
            let current = mmr.as_ref().and_then(|value| rank(value).current_tier);
            let tier = if current.is_some_and(|tier| tier >= 3) {
                current
            } else {
                let updates =
                    format!("{url}/competitiveupdates?startIndex=0&endIndex=19&queue=competitive");
                let recent = rank_data(&updates, &auth.token, &auth.version)
                    .await
                    .ok()
                    .and_then(|value| {
                        get_ci(Some(&value), "Matches")
                            .and_then(Value::as_array)
                            .cloned()
                    })
                    .and_then(|games| {
                        games
                            .into_iter()
                            .filter_map(|game| {
                                Some((
                                    num(get_ci(Some(&game), "MatchStartTime")).unwrap_or(0),
                                    num(get_ci(Some(&game), "TierAfterUpdate"))?,
                                ))
                            })
                            .max_by_key(|(time, _)| *time)
                            .map(|(_, tier)| tier)
                    });
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
    }
    found
}

pub(super) async fn profiles(auth: &Auth, subjects: &[String]) -> HashMap<String, ProfileStats> {
    let cache = PROFILES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut found = HashMap::new();
    let mut missing = Vec::new();
    {
        let mut stored = cache.lock().unwrap_or_else(|error| error.into_inner());
        stored.retain(|_, (time, profile)| {
            time.elapsed()
                < if profile.is_some() {
                    PROFILE_TTL
                } else {
                    PROFILE_MISS_TTL
                }
        });
        for subject in subjects {
            if !uuid(subject) {
                continue;
            }
            if let Some((_, profile)) = stored.get(subject.as_str()) {
                if let Some(profile) = profile {
                    found.insert(subject.clone(), profile.clone());
                }
                continue;
            }
            if !missing.contains(subject) {
                missing.push(subject.clone());
            }
        }
    }

    for batch in missing.chunks(2) {
        let results = join_all(
            batch
                .iter()
                .map(|subject| async move { (subject.clone(), profile(auth, subject).await) }),
        )
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
        async { rank_data(&mmr_url, &auth.token, &auth.version).await.ok() },
        get::<Value>(&history_url, &auth.token, &auth.version),
    );
    let mut profile = mmr
        .map(|value| {
            let ranked = rank(&value);
            ProfileStats {
                current_tier: ranked.current_tier,
                peak_tier: ranked.peak_tier,
                peak_act_id: ranked.peak_act_id,
                rating: ranked.rating,
                games: ranked.games,
                wins: ranked.wins,
                ..ProfileStats::default()
            }
        })
        .unwrap_or_default();
    if profile.current_tier.is_none_or(|tier| tier < 3) {
        let updates =
            format!("{mmr_url}/competitiveupdates?startIndex=0&endIndex=19&queue=competitive");
        if let Ok(value) = rank_data(&updates, &auth.token, &auth.version).await {
            let latest = get_ci(Some(&value), "Matches")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|game| {
                    Some((
                        num(get_ci(Some(game), "MatchStartTime")).unwrap_or(0),
                        num(get_ci(Some(game), "TierAfterUpdate"))?,
                    ))
                })
                .max_by_key(|(time, _)| *time)
                .map(|(_, tier)| tier);
            if latest.is_some_and(|tier| tier >= 3) {
                profile.current_tier = latest;
            }
        }
    }
    let ids = history
        .ok()
        .and_then(|value| value.get("History").and_then(Value::as_array).cloned())
        .unwrap_or_default()
        .into_iter()
        .take(PROFILE_MATCHES)
        .filter_map(|game| {
            game.get("MatchID")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect::<Vec<_>>();
    let root = root.as_str();
    let details = join_all(ids.iter().map(|id| {
        let key = format!("{}:{id}", auth.shard);
        async move { stats::detail(&key, root, id, &auth.token, &auth.version).await }
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
                    text(get_ci(Some(player), "Subject"))
                        .is_some_and(|id| id.eq_ignore_ascii_case(subject))
                })
            })
        else {
            continue;
        };
        if profile.player_card_id.is_none() {
            profile.player_card_id = text(get_ci(Some(player), "PlayerCard"))
                .or_else(|| {
                    text(get_ci(
                        get_ci(Some(player), "PlayerIdentity"),
                        "PlayerCardID",
                    ))
                })
                .filter(|value| uuid(value))
                .map(str::to_string);
        }
        if profile.level.is_none() {
            let identity = get_ci(Some(player), "PlayerIdentity");
            let hidden = get_ci(identity, "HideAccountLevel")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            if !hidden {
                profile.level = num(get_ci(identity, "AccountLevel"));
            }
        }
        let values = player.get("stats").or_else(|| player.get("Stats"));
        kills += num(values.and_then(|values| values.get("kills").or_else(|| values.get("Kills"))))
            .unwrap_or(0);
        deaths +=
            num(values.and_then(|values| values.get("deaths").or_else(|| values.get("Deaths"))))
                .unwrap_or(0);
        if let Some(game_score) =
            num(values.and_then(|values| values.get("score").or_else(|| values.get("Score"))))
        {
            let game_rounds = num(values.and_then(|values| {
                values
                    .get("roundsPlayed")
                    .or_else(|| values.get("RoundsPlayed"))
            }))
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
        let hits = hit_counts(&detail, subject);
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
    (profile.player_card_id.is_some()
        || profile.level.is_some()
        || profile.current_tier.is_some()
        || profile.peak_tier.is_some()
        || profile.peak_act_id.is_some()
        || profile.rating.is_some()
        || profile.games.is_some()
        || profile.kd.is_some()
        || profile.headshot_pct.is_some()
        || profile.acs.is_some())
    .then_some(profile)
}

pub(super) fn match_player(
    player: &Value,
    team: &str,
    auth: &Auth,
    names: &HashMap<String, PlayerName>,
    ranks: &HashMap<String, u32>,
    party_group: Option<u8>,
) -> MatchPlayer {
    let subject = text(player.get("Subject")).unwrap_or_default();
    let identity = player.get("PlayerIdentity").unwrap_or(&Value::Null);
    let hidden = identity
        .get("Incognito")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let you = subject.eq_ignore_ascii_case(&auth.session.puuid);
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
    MatchPlayer {
        subject: subject.to_string(),
        name,
        tag_line,
        player_card_id: text(identity.get("PlayerCardID"))
            .filter(|value| uuid(value))
            .map(str::to_string),
        agent_id: agent,
        team: team.to_string(),
        tier: rank,
        level: (!level_hidden)
            .then(|| num(identity.get("AccountLevel")))
            .flatten(),
        games: None,
        wins: None,
        kd: None,
        headshot_pct: None,
        acs: None,
        selection: text(player.get("CharacterSelectionState")).map(str::to_string),
        party_group,
        you,
        hidden,
    }
}
