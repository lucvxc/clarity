// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod valorant;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn get_valorant_account() -> Result<Option<valorant::Account>, String> {
    valorant::account().await
}

#[tauri::command]
async fn get_valorant_stats(limit: Option<usize>) -> Result<valorant::Stats, String> {
    valorant::stats(limit).await
}

#[tauri::command]
async fn get_valorant_current_match() -> Result<Option<valorant::MatchInfo>, String> {
    valorant::current_match().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_valorant_account,
            get_valorant_stats,
            get_valorant_current_match
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
