use super::*;

pub async fn account() -> Result<Option<Account>, String> {
    let Some(lock) = lock()? else {
        return Ok(None);
    };
    let session = match session(&lock).await {
        Ok(session) => session,
        Err(_) => return Ok(None),
    };
    let client = local()?;
    let base = format!("https://127.0.0.1:{}", lock.port);

    let player_card_id = card(client, &base, &lock, &session)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| DEFAULT.to_string());

    Ok(Some(Account {
        game_name: session.game_name,
        tag_line: session.game_tag,
        subject: session.puuid,
        player_card_id,
    }))
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
