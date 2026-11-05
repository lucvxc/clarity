mod discord;
mod valorant;

use serde::Serialize;
use std::sync::{
    Mutex,
    atomic::{AtomicU64, Ordering},
};

static RPC_REV: AtomicU64 = AtomicU64::new(0);
static RPC_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RpcDebug {
    state: String,
    game_state: String,
    presence_error: Option<String>,
}

fn set_rpc(
    rev: u64,
    status: Option<valorant::Presence>,
    update: discord::Update,
) -> Result<String, String> {
    let _guard = RPC_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    if RPC_REV.load(Ordering::SeqCst) != rev {
        return Ok("stale".to_string());
    }
    discord::set(status, update)
}

#[tauri::command]
async fn account() -> Result<Option<valorant::Account>, String> {
    valorant::account().await
}

#[tauri::command]
async fn stats(limit: Option<usize>) -> Result<valorant::Stats, String> {
    valorant::stats(limit).await
}

#[tauri::command]
async fn match_history(offset: Option<usize>) -> Result<valorant::MatchPage, String> {
    valorant::history(offset).await
}

#[tauri::command]
async fn player_history(
    subject: String,
    offset: Option<usize>,
) -> Result<valorant::MatchPage, String> {
    valorant::player_history(subject, offset).await
}

#[tauri::command]
async fn match_details(match_id: String) -> Result<valorant::MatchDetails, String> {
    valorant::match_details(match_id).await
}

#[tauri::command]
async fn current_match() -> Result<Option<valorant::MatchInfo>, String> {
    valorant::current_match().await
}

#[tauri::command]
async fn current_loadouts(
    match_id: String,
) -> Result<std::collections::HashMap<String, Vec<valorant::WeaponLoadout>>, String> {
    valorant::loadouts(match_id).await
}

#[tauri::command]
async fn player_profiles(
    subjects: Vec<String>,
) -> Result<std::collections::HashMap<String, valorant::ProfileStats>, String> {
    valorant::profiles(subjects).await
}

#[tauri::command]
async fn store() -> Result<valorant::Storefront, String> {
    valorant::store().await
}

#[tauri::command]
async fn store_asset(url: String) -> Result<String, String> {
    valorant::asset(url).await
}

#[tauri::command]
async fn sync_rpc(update: discord::Update) -> Result<RpcDebug, String> {
    let rev = RPC_REV.fetch_add(1, Ordering::SeqCst) + 1;
    if !update.enabled() {
        let state = tauri::async_runtime::spawn_blocking(move || set_rpc(rev, None, update))
            .await
            .map_err(|_| "Discord Rich Presence update failed".to_string())??;
        return Ok(RpcDebug {
            state,
            game_state: "skipped".to_string(),
            presence_error: None,
        });
    }

    let initial = update.clone();
    let result = tauri::async_runtime::spawn_blocking(move || set_rpc(rev, None, initial))
        .await
        .map_err(|_| "Discord Rich Presence update failed".to_string())??;
    if result == "stale" {
        return Ok(RpcDebug {
            state: result,
            game_state: "skipped".to_string(),
            presence_error: None,
        });
    }

    let (status, presence_error) = match valorant::presence().await {
        Ok(status) => (status, None),
        Err(error) => (None, Some(error)),
    };
    let game_state = status
        .as_ref()
        .map(|value| value.phase.clone())
        .unwrap_or_else(|| "lobby".to_string());
    let state = tauri::async_runtime::spawn_blocking(move || set_rpc(rev, status, update))
        .await
        .map_err(|_| "Discord Rich Presence update failed".to_string())??;
    Ok(RpcDebug {
        state,
        game_state,
        presence_error,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            account,
            stats,
            match_history,
            player_history,
            match_details,
            current_match,
            current_loadouts,
            player_profiles,
            store,
            store_asset,
            sync_rpc
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
