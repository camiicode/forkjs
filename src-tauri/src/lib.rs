mod stockfish;
mod groq;

#[tauri::command]
fn get_best_moves(fen: String) -> Result<stockfish::AnalysisResult, String> {
    stockfish::analyze_position(&fen)
}

#[tauri::command]
async fn explain_move(
    fen: String,
    best_move: String,
    move_history: Vec<String>,
    api_key: String,
) -> Result<String, String> {
    groq::explain(&fen, &best_move, &move_history, &api_key).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_best_moves, explain_move])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
