use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessageContent,
}

#[derive(Deserialize)]
struct ChatMessageContent {
    content: String,
}

pub async fn explain(
    fen: &str,
    best_move: &str,
    move_history: &[String],
    api_key: &str,
) -> Result<String, String> {
    let history_str = if move_history.is_empty() {
        String::from("No hay jugadas previas.")
    } else {
        move_history.iter().enumerate().map(|(i, m)| format!("{}. {}", i + 1, m)).collect::<Vec<_>>().join(", ")
    };

    let prompt = format!(
        "Eres un profesor de ajedrez experto. Analiza esta posición de ajedrez y explica en español por qué la jugada recomendada es la mejor.\n\n\
         Posición FEN: {}\n\
         Jugadas previas: {}\n\
         Mejor jugada según Stockfish: {}\n\n\
         Explica brevemente:\n\
         1. Por qué esta jugada es óptima\n\
         2. Qué amenazas o debilidades aprovecha\n\
         3. Qué principios estratégicos aplica\n\n\
         Sé conciso (máximo 3-4 oraciones). Habla directamente al estudiante.",
        fen, history_str, best_move
    );

    let request = ChatRequest {
        model: "llama-3.3-70b-versatile".to_string(),
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        temperature: 0.7,
        max_tokens: 300,
    };

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.groq.com/openai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to call Groq API: {}", e))?;

    let chat_response: ChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Groq response: {}", e))?;

    chat_response
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "No response from Groq".to_string())
}
