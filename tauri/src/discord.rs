use discord_rich_presence::{
    DiscordIpc, DiscordIpcClient,
    activity::{Activity, ActivityType, Assets, Party},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::{Mutex, OnceLock};

const APP_ID: &str = "1484765764194930811";
static CLIENT: OnceLock<Mutex<Option<DiscordIpcClient>>> = OnceLock::new();

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Update {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "yes")]
    show_party: bool,
    #[serde(default)]
    large_image: Option<String>,
    #[serde(default)]
    large_text: Option<String>,
    #[serde(default)]
    small_image: Option<String>,
    #[serde(default)]
    small_text: Option<String>,
}

impl Update {
    pub fn enabled(&self) -> bool {
        self.enabled
    }
}

fn yes() -> bool {
    true
}

pub fn set(status: Option<super::valorant::Presence>, update: Update) -> Result<String, String> {
    let client = CLIENT.get_or_init(|| Mutex::new(None));
    let mut stored = client.lock().unwrap_or_else(|error| error.into_inner());

    if !update.enabled {
        if let Some(client) = stored.as_mut() {
            let result = send(client, None);
            if let Err(error) = result {
                if let Some(mut client) = stored.take() {
                    let _ = client.close();
                }
                return Err(error);
            }
        }
        return Ok("disabled".to_string());
    }

    if stored.is_none() {
        let mut next = DiscordIpcClient::new(APP_ID);
        next.connect().map_err(|error| {
            format!(
                "Discord IPC connection failed ({error:?}). Make sure the Discord desktop app is open."
            )
        })?;
        *stored = Some(next);
    }

    let mut activity = Activity::new()
        .name("Clarity")
        .activity_type(ActivityType::Playing)
        .details("In Lobby");
    if let Some(status) = status.as_ref() {
        let text = details(status);
        activity = activity.details(text);
        if update.show_party
            && let (Some(id), Some(size)) = (&status.party_id, status.party_size)
            && size > 1
        {
            activity = activity.party(Party::new().id(id).size([i32::from(size), 5]));
        }
    }

    let mut assets = Assets::new();
    let mut has_assets = false;
    if let Some(image) = update.large_image.filter(|value| !value.is_empty()) {
        assets = assets.large_image(image);
        has_assets = true;
    }
    if let Some(text) = update.large_text.filter(|value| !value.is_empty()) {
        assets = assets.large_text(text);
        has_assets = true;
    }
    if let Some(image) = update.small_image.filter(|value| !value.is_empty()) {
        assets = assets.small_image(image);
        if let Some(text) = update.small_text.filter(|value| !value.is_empty()) {
            assets = assets.small_text(text);
        }
        has_assets = true;
    }
    if has_assets {
        activity = activity.assets(assets);
    }

    let client = stored.as_mut().expect("Discord IPC client connected");
    let result = send(client, Some(json!(activity)));
    if let Err(error) = result {
        if let Some(mut client) = stored.take() {
            let _ = client.close();
        }
        return Err(error);
    }
    Ok("connected".to_string())
}

fn send(client: &mut DiscordIpcClient, activity: Option<Value>) -> Result<(), String> {
    let nonce = uuid::Uuid::new_v4().to_string();
    client
        .send(
            json!({
                "cmd": "SET_ACTIVITY",
                "args": {
                    "pid": std::process::id(),
                    "activity": activity
                },
                "nonce": nonce
            }),
            1,
        )
        .map_err(|error| format!("Could not write Discord activity: {error:?}"))?;

    acknowledge(client, &nonce)
}

fn acknowledge(client: &mut DiscordIpcClient, nonce: &str) -> Result<(), String> {
    for _ in 0..8 {
        let (opcode, response) = client
            .recv()
            .map_err(|error| format!("Could not read Discord RPC response: {error:?}"))?;

        if opcode == 3 {
            client
                .send(response, 4)
                .map_err(|error| format!("Could not answer Discord RPC ping: {error:?}"))?;
            continue;
        }
        if opcode == 2 {
            return Err("Discord closed the Rich Presence connection".to_string());
        }
        if response.get("nonce").and_then(Value::as_str) != Some(nonce) {
            continue;
        }

        let command = response
            .get("cmd")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let event = response
            .get("evt")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if event == "ERROR" || command == "ERROR" {
            return Err(format!("Discord RPC rejected the activity: {response}"));
        }
        if opcode != 1 || command != "SET_ACTIVITY" {
            return Err(format!("Unexpected Discord RPC response: {response}"));
        }
        return Ok(());
    }

    Err("Discord did not acknowledge the Rich Presence update".to_string())
}

fn details(status: &super::valorant::Presence) -> String {
    if status.phase == "lobby" {
        return "In Lobby".to_string();
    }

    status
        .queue_id
        .as_deref()
        .or(status.mode_id.as_deref())
        .map(mode)
        .unwrap_or_else(|| "In a match".to_string())
}

fn mode(value: &str) -> String {
    let parts = value
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    let at = parts
        .iter()
        .position(|part| part.eq_ignore_ascii_case("gamemodes"));
    let raw = at
        .and_then(|index| parts.get(index + 1))
        .or_else(|| parts.last())
        .copied()
        .unwrap_or(value);
    let raw = raw.split('.').next().unwrap_or(raw);
    let raw = raw
        .trim_end_matches("_C")
        .trim_end_matches("GameMode")
        .trim_end_matches('_')
        .replace(['_', '-'], " ");
    let key = raw.to_ascii_lowercase().replace(' ', "");
    match key.as_str() {
        "competitive" | "ranked" => "Competitive".to_string(),
        "unrated" | "bomb" => "Unrated".to_string(),
        "swiftplay" => "Swiftplay".to_string(),
        "spikerush" => "Spike Rush".to_string(),
        "deathmatch" => "Deathmatch".to_string(),
        "abilitydraftarena" => "In the Range".to_string(),
        "teamdeathmatch" | "hurm" => "Team Deathmatch".to_string(),
        "skirmish" => "Skirmish".to_string(),
        "escalation" => "Escalation".to_string(),
        "replication" => "Replication".to_string(),
        "snowballfight" => "Snowball Fight".to_string(),
        _ => title(&raw),
    }
}

fn title(value: &str) -> String {
    let mut next = true;
    value
        .chars()
        .map(|ch| {
            if !ch.is_ascii_alphanumeric() {
                next = true;
                ch
            } else if next {
                next = false;
                ch.to_ascii_uppercase()
            } else {
                ch
            }
        })
        .collect()
}
