use super::*;
use futures::future::join_all;

static DETAILS: OnceLock<Mutex<HashMap<String, (Instant, Value)>>> = OnceLock::new();

pub async fn stats(limit: Option<usize>) -> Result<Stats, String> {
    let limit = limit.unwrap_or(10);
    let limit = if limit == 0 { 0 } else { limit.clamp(1, 30) };
    load(limit, 0, true, None).await
}

async fn act_start() -> Result<u64, String> {
    let data: Value = api()?
        .get("https://valorant-api.com/v1/seasons")
        .send()
        .await
        .map_err(|_| "Couldn’t load the current act".to_string())?
        .json()
        .await
        .map_err(|_| "Couldn’t read the current act".to_string())?;
    let now = chrono::Utc::now();
    data.get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|season| text(season.get("type")).is_some_and(|kind| kind.ends_with("::Act")))
        .filter_map(|season| {
            let start =
                chrono::DateTime::parse_from_rfc3339(text(season.get("startTime"))?).ok()?;
            let end = chrono::DateTime::parse_from_rfc3339(text(season.get("endTime"))?).ok()?;
            (start <= now && now < end).then_some(start.timestamp_millis() as u64)
        })
        .max()
        .ok_or_else(|| "Couldn’t identify the current act".to_string())
}

pub async fn history(offset: Option<usize>) -> Result<MatchPage, String> {
    page(offset, None).await
}

pub async fn player_history(subject: String, offset: Option<usize>) -> Result<MatchPage, String> {
    if !uuid(&subject) {
        return Err("Invalid player ID".to_string());
    }
    page(offset, Some(&subject)).await
}

async fn page(offset: Option<usize>, subject: Option<&str>) -> Result<MatchPage, String> {
    let offset = offset.unwrap_or(0).min(1_000_000);
    let stats = load(HISTORY, offset, false, subject).await?;
    if let Some(error) = stats.match_error {
        return Err(error);
    }
    let count = stats.recent_games.unwrap_or(0) as usize;
    Ok(MatchPage {
        matches: stats.recent_matches,
        next_offset: offset.saturating_add(count),
        has_more: count == HISTORY,
    })
}

pub async fn match_details(id: String) -> Result<MatchDetails, String> {
    if !uuid(&id) {
        return Err("Invalid match ID".to_string());
    }
    let Some(lock) = lock()? else {
        return Err("Riot Client is not running".to_string());
    };
    let auth = auth(&lock).await?;
    let root = format!("https://pd.{}.a.pvp.net", auth.shard);
    let key = format!("{}:{id}", auth.shard);
    let value = detail(&key, &root, &id, &auth.token, &auth.version)
        .await
        .ok_or_else(|| "Match details are unavailable right now".to_string())?;
    let info = get_ci(Some(&value), "MatchInfo").unwrap_or(&Value::Null);
    let queue = text(get_ci(Some(info), "QueueID"));
    let mode = text(get_ci(Some(info), "ModeID")).or_else(|| text(get_ci(Some(info), "GameMode")));
    let source = get_ci(Some(&value), "Players")
        .and_then(Value::as_array)
        .ok_or_else(|| "Riot returned no player details for this match".to_string())?;
    let roster = source
        .iter()
        .filter_map(|player| {
            let subject = text(get_ci(Some(player), "Subject"))?;
            let row = player.clone();
            Some((subject.to_string(), row))
        })
        .collect::<Vec<_>>();
    let (names, ranks) =
        futures::join!(player::names(&auth, &roster), player::ranks(&auth, &roster));
    let mut match_ranks = HashMap::new();
    if queue.is_some_and(|queue| queue.eq_ignore_ascii_case("competitive")) {
        let missing = source
            .iter()
            .filter_map(|player| {
                let tier = num(get_ci(Some(player), "CompetitiveTier")).or_else(|| {
                    num(path_ci(
                        get_ci(Some(player), "PlayerIdentity"),
                        &["SeasonalBadgeInfo", "Rank"],
                    ))
                });
                (tier.unwrap_or(0) < 3)
                    .then(|| text(get_ci(Some(player), "Subject")))
                    .flatten()
            })
            .collect::<Vec<_>>();
        let rank_root = root.as_str();
        let token = &auth.token;
        let version = &auth.version;
        let match_id = id.as_str();
        for batch in missing.chunks(2) {
            let loaded = futures::future::join_all(batch.iter().map(|subject| {
                let subject = *subject;
                async move {
                let url = format!("{rank_root}/mmr/v1/players/{subject}/competitiveupdates?startIndex=0&endIndex=19&queue=competitive");
                let tier = rank_data(&url, token, version)
                    .await
                    .ok()
                    .and_then(|data| get_ci(Some(&data), "Matches").and_then(Value::as_array).cloned())
                    .and_then(|games| games.into_iter().find(|game| {
                        text(get_ci(Some(game), "MatchID")).is_some_and(|value| value.eq_ignore_ascii_case(match_id))
                    }))
                    .and_then(|game| num(get_ci(Some(&game), "TierBeforeUpdate"))
                        .or_else(|| num(get_ci(Some(&game), "TierAfterUpdate"))))
                    .filter(|tier| *tier >= 3);
                (subject.to_string(), tier)
            }})).await;
            match_ranks.extend(
                loaded
                    .into_iter()
                    .filter_map(|(subject, tier)| tier.map(|tier| (subject, tier))),
            );
        }
    }
    let rounds = get_ci(Some(&value), "RoundResults")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let teams = get_ci(Some(&value), "Teams")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let team_for = |id: Option<&str>| {
        teams
            .iter()
            .find(|team| text(get_ci(Some(team), "TeamID")) == id)
    };
    let players = source
        .iter()
        .map(|player| {
            let subject = text(get_ci(Some(player), "Subject")).unwrap_or_default();
            let identity = get_ci(Some(player), "PlayerIdentity");
            let hidden = path_ci(identity, &["Incognito"]).and_then(Value::as_bool) == Some(true);
            let own = subject.eq_ignore_ascii_case(&auth.session.puuid);
            let name = if hidden && !own {
                "Anonymous".to_string()
            } else if own {
                auth.session.game_name.clone()
            } else {
                text(get_ci(Some(player), "GameName"))
                    .or_else(|| text(get_ci(Some(player), "Name")))
                    .map(str::to_string)
                    .or_else(|| names.get(subject).map(|name| name.game.clone()))
                    .unwrap_or_else(|| "Unknown player".to_string())
            };
            let tag_line = if own {
                Some(auth.session.game_tag.clone())
            } else if hidden {
                None
            } else {
                text(get_ci(Some(player), "TagLine"))
                    .map(str::to_string)
                    .or_else(|| names.get(subject).map(|name| name.tag.clone()))
            };
            let stats = get_ci(Some(player), "Stats");
            let team_id = text(get_ci(Some(player), "TeamID"));
            let team_name = team_id
                .map(|team| match team.to_ascii_lowercase().as_str() {
                    "red" => "Red",
                    "blue" => "Blue",
                    _ => team,
                })
                .unwrap_or("Unknown")
                .to_string();
            let shots = hit_counts(&value, subject);
            MatchDetailPlayer {
                subject: subject.to_string(),
                name,
                tag_line,
                player_card_id: text(get_ci(Some(player), "PlayerCard"))
                    .or_else(|| text(get_ci(identity, "PlayerCardID")))
                    .filter(|value| uuid(value))
                    .map(str::to_string),
                you: own,
                hidden,
                team: team_name,
                agent_id: text(get_ci(Some(player), "CharacterID"))
                    .filter(|id| uuid(id))
                    .map(str::to_string),
                tier: num(get_ci(Some(player), "CompetitiveTier"))
                    .or_else(|| num(path_ci(identity, &["SeasonalBadgeInfo", "Rank"])))
                    .filter(|tier| *tier >= 3)
                    .or_else(|| match_ranks.get(subject).copied())
                    .or_else(|| ranks.get(subject).copied()),
                level: num(path_ci(identity, &["AccountLevel"])),
                kills: num(get_ci(stats, "Kills")).unwrap_or(0),
                deaths: num(get_ci(stats, "Deaths")).unwrap_or(0),
                assists: num(get_ci(stats, "Assists")).unwrap_or(0),
                score: num(get_ci(stats, "Score")).unwrap_or(0),
                rounds: num(get_ci(stats, "RoundsPlayed"))
                    .or_else(|| num(get_ci(Some(info), "RoundsPlayed")))
                    .unwrap_or(rounds.len() as u32),
                headshots: shots.0,
                bodyshots: shots.1,
                legshots: shots.2,
            }
        })
        .collect::<Vec<_>>();
    let own = source.iter().find(|player| {
        text(get_ci(Some(player), "Subject"))
            .is_some_and(|id| id.eq_ignore_ascii_case(&auth.session.puuid))
    });
    let own_team = own.and_then(|player| team_for(text(get_ci(Some(player), "TeamID"))));
    let score = own_team.and_then(|team| {
        Some((
            num(get_ci(Some(team), "RoundsWon"))?,
            num(get_ci(Some(team), "RoundsLost"))?,
        ))
    });

    Ok(MatchDetails {
        match_id: text(get_ci(Some(info), "MatchID"))
            .unwrap_or(&id)
            .to_string(),
        map_id: text(get_ci(Some(info), "MapID"))
            .unwrap_or_default()
            .to_string(),
        queue: queue.map(str::to_string),
        mode: mode.map(str::to_string),
        started: get_ci(Some(info), "GameStartMillis").and_then(Value::as_u64),
        duration: get_ci(Some(info), "GameLengthMillis").and_then(Value::as_u64),
        rounds_won: score.map(|value| value.0),
        rounds_lost: score.map(|value| value.1),
        players,
    })
}

async fn load(
    limit: usize,
    offset: usize,
    with_rank: bool,
    subject: Option<&str>,
) -> Result<Stats, String> {
    let Some(lock) = lock()? else {
        return Err("Riot Client is not running".to_string());
    };
    let auth = auth(&lock).await?;
    let subject = subject.unwrap_or(&auth.session.puuid);
    let root = format!("https://pd.{}.a.pvp.net", auth.shard);
    let start = if with_rank && limit == 0 {
        Some(act_start().await?)
    } else {
        None
    };
    let mmr = if with_rank {
        Some(
            rank_data(
                &format!("{root}/mmr/v1/players/{subject}"),
                &auth.token,
                &auth.version,
            )
            .await,
        )
    } else {
        None
    };
    let mut stats = mmr
        .as_ref()
        .and_then(|result| result.as_ref().ok())
        .map(rank)
        .unwrap_or_default();

    let mut updates = rank_data(
        &format!(
            "{root}/mmr/v1/players/{}/competitiveupdates?startIndex=0&endIndex={}&queue=competitive",
            subject,
            offset.saturating_add(HISTORY)
        ),
        &auth.token,
        &auth.version,
    )
    .await;
    if with_rank
        && limit > HISTORY
        && let Ok(first) = &mut updates
        && first
            .get("Matches")
            .and_then(Value::as_array)
            .is_some_and(|items| items.len() == HISTORY)
    {
        let more = rank_data(
            &format!(
                "{root}/mmr/v1/players/{subject}/competitiveupdates?startIndex={HISTORY}&endIndex={}&queue=competitive",
                limit
            ),
            &auth.token,
            &auth.version,
        )
        .await;
        if let Ok(more) = more
            && let Some(items) = more.get("Matches").and_then(Value::as_array)
            && let Some(list) = first.get_mut("Matches").and_then(Value::as_array_mut)
        {
            list.extend(items.iter().cloned());
        }
    }
    if with_rank && let Ok(updates) = &updates {
        rank_updates(&mut stats, updates);
    }
    let rr_changes = updates
        .as_ref()
        .ok()
        .and_then(|value| get_ci(Some(value), "Matches"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|game| {
            let before = num(get_ci(Some(game), "TierBeforeUpdate"));
            let after = num(get_ci(Some(game), "TierAfterUpdate"));
            Some((
                text(get_ci(Some(game), "MatchID"))?.to_ascii_lowercase(),
                (
                    signed(get_ci(Some(game), "RankedRatingEarned"))
                        .or_else(|| signed(get_ci(Some(game), "MmrChangeToLastGame")))
                        .or_else(|| {
                            let after = num(get_ci(Some(game), "RankedRatingAfterUpdate"))? as i32;
                            let before =
                                num(get_ci(Some(game), "RankedRatingBeforeUpdate"))? as i32;
                            Some(after - before)
                        }),
                    before
                        .filter(|tier| *tier >= 3)
                        .or_else(|| after.filter(|tier| *tier >= 3)),
                    before.zip(after).map(|(before, after)| {
                        if after > before {
                            1
                        } else if after < before {
                            -1
                        } else {
                            0
                        }
                    }),
                ),
            ))
        })
        .collect::<HashMap<_, _>>();
    if with_rank && stats.current_tier.is_none() {
        let mmr_error = mmr.as_ref().and_then(|result| result.as_ref().err());
        let update_error = updates.as_ref().err();
        stats.rank_error = Some(match (mmr_error, update_error) {
            (Some(mmr_error), Some(update_error)) => {
                format!("MMR request: {mmr_error}; competitive updates: {update_error}")
            }
            (Some(error), _) | (_, Some(error)) => error.clone(),
            (None, None) => {
                "Riot returned no competitive rank entries for this account".to_string()
            }
        });
    }

    let history: Value = match get(
        &format!(
            "{root}/match-history/v1/history/{}?startIndex={offset}&endIndex={}",
            subject,
            offset.saturating_add(HISTORY)
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

    let Some(first) = history.get("History").and_then(Value::as_array) else {
        return Ok(stats);
    };
    let mut matches = first.clone();
    let target = if start.is_some() { usize::MAX } else { limit };
    while with_rank
        && matches.len() < target
        && !matches.is_empty()
        && (start.is_none()
            || matches.last().is_some_and(|game| {
                get_ci(Some(game), "GameStartTime")
                    .and_then(Value::as_u64)
                    .is_none_or(|time| time >= start.unwrap_or_default())
            }))
    {
        let next = matches.len();
        let page: Value = get(
            &format!(
                "{root}/match-history/v1/history/{subject}?startIndex={next}&endIndex={}",
                next + HISTORY
            ),
            &auth.token,
            &auth.version,
        )
        .await?;
        let Some(items) = page.get("History").and_then(Value::as_array) else {
            break;
        };
        if items.is_empty() {
            break;
        }
        matches.extend(items.iter().cloned());
        if items.len() < HISTORY {
            break;
        }
    }
    if let Some(start) = start {
        matches.retain(|game| {
            get_ci(Some(game), "GameStartTime")
                .and_then(Value::as_u64)
                .is_none_or(|time| time >= start)
        });
    }
    let limit = if start.is_some() {
        matches.len()
    } else {
        limit
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
    let root = root.as_str();
    let detail_count = if with_rank { limit.max(5) } else { HISTORY };
    let ids = matches
        .iter()
        .take(detail_count)
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
            let key = format!("{}:{id}", auth.shard);
            async move { (index, detail(&key, root, id, token, version).await) }
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
                    text(get_ci(Some(player), "Subject"))
                        .is_some_and(|id| id.eq_ignore_ascii_case(subject))
                })
            })
        else {
            continue;
        };

        let values = player.get("stats").or_else(|| player.get("Stats"));
        let game_kills =
            num(values.and_then(|values| values.get("kills").or_else(|| values.get("Kills"))))
                .unwrap_or(0);
        let game_deaths =
            num(values.and_then(|values| values.get("deaths").or_else(|| values.get("Deaths"))))
                .unwrap_or(0);
        let game_assists =
            num(values.and_then(|values| values.get("assists").or_else(|| values.get("Assists"))));
        if match_index < limit {
            kills += game_kills;
            deaths += game_deaths;
        }
        let shots = hit_counts(&detail, subject);
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
        if match_index < limit
            && let Some(agent) = agent_id.as_ref()
        {
            *agents.entry(agent.to_string()).or_default() += 1;
        }
        let history_game = matches.get(match_index);
        let info = detail.get("matchInfo").or_else(|| detail.get("MatchInfo"));
        let match_id =
            text(info.and_then(|info| info.get("matchId").or_else(|| info.get("MatchID"))))
                .or_else(|| {
                    text(
                        history_game
                            .and_then(|game| game.get("MatchID").or_else(|| game.get("matchId"))),
                    )
                });
        let map_id = text(info.and_then(|info| info.get("mapId").or_else(|| info.get("MapID"))))
            .unwrap_or_default()
            .to_string();
        let started = info
            .and_then(|info| {
                info.get("gameStartMillis")
                    .or_else(|| info.get("GameStartMillis"))
            })
            .and_then(Value::as_u64);
        let queue =
            text(history_game.and_then(|game| game.get("QueueID").or_else(|| game.get("queueId"))))
                .or_else(|| {
                    text(info.and_then(|info| info.get("queueId").or_else(|| info.get("QueueID"))))
                })
                .map(str::to_string);
        let mode = text(info.and_then(|info| info.get("gameMode").or_else(|| info.get("ModeID"))))
            .map(str::to_string);
        let team_id = text(player.get("teamId").or_else(|| player.get("TeamID")));
        let team = detail
            .get("teams")
            .or_else(|| detail.get("Teams"))
            .and_then(Value::as_array)
            .and_then(|teams| {
                teams
                    .iter()
                    .find(|team| text(team.get("teamId").or_else(|| team.get("TeamID"))) == team_id)
            });
        let won = team
            .and_then(|team| team.get("won").or_else(|| team.get("Won")))
            .and_then(Value::as_bool);
        let round_score = round_score(&detail, team_id);
        let rounds_won = team
            .and_then(|team| num(team.get("roundsWon").or_else(|| team.get("RoundsWon"))))
            .or_else(|| round_score.map(|score| score.0));
        let rounds_lost = team
            .and_then(|team| num(team.get("roundsLost").or_else(|| team.get("RoundsLost"))))
            .or_else(|| round_score.map(|score| score.1));
        let played = num(values.and_then(|values| {
            values
                .get("roundsPlayed")
                .or_else(|| values.get("RoundsPlayed"))
        }))
        .unwrap_or(0);
        let score =
            num(values.and_then(|values| values.get("score").or_else(|| values.get("Score"))));
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
        let (team_score, other_scores) = detail
            .get("players")
            .or_else(|| detail.get("Players"))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .fold(
                (None, Vec::new()),
                |(team_score, mut other_scores), candidate| {
                    let candidate_score = num(candidate
                        .get("stats")
                        .or_else(|| candidate.get("Stats"))
                        .and_then(|stats| stats.get("score").or_else(|| stats.get("Score"))));
                    let candidate_team =
                        text(candidate.get("teamId").or_else(|| candidate.get("TeamID")));
                    let team_score = if team_id.is_some_and(|team| {
                        candidate_team.is_some_and(|candidate| team.eq_ignore_ascii_case(candidate))
                    }) {
                        team_score.max(candidate_score)
                    } else {
                        team_score
                    };
                    let candidate_id = text(
                        candidate
                            .get("subject")
                            .or_else(|| candidate.get("Subject")),
                    );
                    if !candidate_id.is_some_and(|id| id.eq_ignore_ascii_case(subject)) {
                        other_scores.push(candidate_score);
                    }
                    (team_score, other_scores)
                },
            );
        stats.recent_matches.push(RecentMatch {
            match_id: match_id.unwrap_or_default().to_string(),
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
            acs: (played.max(rounds_won.unwrap_or(0) + rounds_lost.unwrap_or(0)) > 0).then(|| {
                score.unwrap_or(0) / played.max(rounds_won.unwrap_or(0) + rounds_lost.unwrap_or(0))
            }),
            score,
            headshots: (shots.0 + shots.1 + shots.2 > 0).then_some(shots.0),
            bodyshots: (shots.0 + shots.1 + shots.2 > 0).then_some(shots.1),
            legshots: (shots.0 + shots.1 + shots.2 > 0).then_some(shots.2),
            mvp: score.is_some() && score == team_score,
            match_mvp: score.is_some_and(|score| {
                !other_scores.is_empty()
                    && other_scores
                        .iter()
                        .all(|other| other.is_some_and(|other| score > other))
            }),
            competitive,
            rr: rr_match.and_then(|(rr, _, _)| *rr),
            tier: if competitive {
                rr_match.and_then(|(_, tier, _)| *tier).or_else(|| {
                    num(get_ci(Some(player), "CompetitiveTier")).filter(|tier| *tier >= 3)
                })
            } else {
                None
            },
            rank_change: rr_match.and_then(|(_, _, change)| *change),
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

pub(super) async fn detail(
    key: &str,
    root: &str,
    id: &str,
    token: &Token,
    version: &str,
) -> Option<Value> {
    let cache = DETAILS.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some((at, value)) = cache
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(key)
        && at.elapsed()
            < if has_hits(value) {
                CACHE
            } else {
                Duration::from_secs(30)
            }
    {
        return Some(value.clone());
    }

    let value = get::<Value>(
        &format!("{root}/match-details/v1/matches/{id}"),
        token,
        version,
    )
    .await
    .ok()?;
    let mut cache = cache.lock().unwrap_or_else(|error| error.into_inner());
    cache.retain(|_, (at, _)| at.elapsed() < CACHE);
    if cache.len() >= HISTORY
        && let Some(oldest) = cache
            .iter()
            .min_by_key(|(_, (at, _))| *at)
            .map(|(key, _)| key.clone())
    {
        cache.remove(&oldest);
    }
    cache.insert(key.to_string(), (Instant::now(), value.clone()));
    Some(value)
}

fn has_hits(detail: &Value) -> bool {
    get_ci(Some(detail), "RoundResults")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|round| get_ci(Some(round), "PlayerStats").and_then(Value::as_array))
        .flatten()
        .any(|player| {
            get_ci(Some(player), "Damage")
                .and_then(Value::as_array)
                .is_some_and(|damage| !damage.is_empty())
        })
}

fn rank_updates(stats: &mut Stats, updates: &Value) {
    let Some(matches) = get_ci(Some(updates), "Matches").and_then(Value::as_array) else {
        return;
    };
    let latest = matches
        .iter()
        .max_by_key(|game| num(get_ci(Some(game), "MatchStartTime")).unwrap_or(0));
    if stats.current_tier.is_none() {
        stats.current_tier = latest.and_then(|game| num(get_ci(Some(game), "TierAfterUpdate")));
    }
    if stats.rating.is_none() {
        stats.rating = latest.and_then(|game| num(get_ci(Some(game), "RankedRatingAfterUpdate")));
    }
    if stats.peak_tier.is_none() {
        stats.peak_tier = matches
            .iter()
            .filter_map(|game| num(get_ci(Some(game), "TierAfterUpdate")))
            .filter(|tier| *tier > 0)
            .max();
    }
}
