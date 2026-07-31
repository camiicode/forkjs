mod stockfish;
mod groq;

use tauri::WebviewWindowBuilder;

#[tauri::command]
fn get_best_moves(fen: String) -> Result<stockfish::AnalysisResult, String> {
    let stockfish_path = stockfish::resolve_stockfish_path()?;
    stockfish::analyze_position(&fen, &stockfish_path)
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
            let window_config = &app.config().app.windows[0];
            WebviewWindowBuilder::from_config(app.handle(), window_config)?
                .initialization_script(include_str!("../../dist/board-reader.js"))
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_best_moves, explain_move])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
