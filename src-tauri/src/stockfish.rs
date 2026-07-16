use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct EngineLine {
    pub move_sequence: String,
    pub centipawns: i32,
    pub depth: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub best_move: String,
    pub lines: Vec<EngineLine>,
}

pub fn analyze_position(fen: &str) -> Result<AnalysisResult, String> {
    let stockfish_path = "stockfish";

    let mut child = Command::new(stockfish_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Stockfish: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("Failed to open stdin")?;
    use std::io::Write;
    writeln!(stdin, "uci").map_err(|e| e.to_string())?;
    writeln!(stdin, "isready").map_err(|e| e.to_string())?;
    writeln!(stdin, "position fen {}", fen).map_err(|e| e.to_string())?;
    writeln!(stdin, "go movetime 1000").map_err(|e| e.to_string())?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to read output: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_stockfish_output(&stdout)
}

fn parse_stockfish_output(output: &str) -> Result<AnalysisResult, String> {
    let mut best_move = String::new();
    let mut lines: Vec<EngineLine> = Vec::new();

    for line in output.lines() {
        if line.starts_with("info depth") {
            if let Some((pv_line, cp, depth)) = parse_info_line(line) {
                lines.push(EngineLine {
                    move_sequence: pv_line,
                    centipawns: cp,
                    depth,
                });
            }
        }
        if line.starts_with("bestmove") {
            best_move = line
                .split_whitespace()
                .nth(1)
                .unwrap_or("")
                .to_string();
        }
    }

    Ok(AnalysisResult { best_move, lines })
}

fn parse_info_line(line: &str) -> Option<(String, i32, u32)> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    let depth = parts.get(2)?.parse::<u32>().ok()?;
    let mut cp = 0;
    let mut pv_moves = Vec::new();

    let mut i = 3;
    while i < parts.len() {
        match parts[i] {
            "score" => {
                if *parts.get(i + 1)? == "cp" {
                    cp = parts.get(i + 2)?.parse::<i32>().ok()?;
                    i += 3;
                } else if *parts.get(i + 1)? == "mate" {
                    let mate_in = parts.get(i + 2)?.parse::<i32>().ok()?;
                    cp = if mate_in > 0 { 30000 - mate_in } else { -30000 - mate_in };
                    i += 3;
                } else {
                    i += 1;
                }
            }
            "pv" => {
                pv_moves = parts[i + 1..].to_vec();
                break;
            }
            _ => i += 1,
        }
    }

    Some((pv_moves.join(" "), cp, depth))
}
