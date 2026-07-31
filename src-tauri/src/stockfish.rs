use serde::{Deserialize, Serialize};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, ChildStdout, Command, Stdio};

const MULTIPV: usize = 3;
const MOVETIME_MS: u32 = 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineLine {
    pub move_sequence: String,
    pub centipawns: i32,
    pub mate_in: Option<i32>,
    pub depth: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub best_move: String,
    pub lines: Vec<EngineLine>,
}

pub fn analyze_position(fen: &str, stockfish_path: &Path) -> Result<AnalysisResult, String> {
    let mut child = Command::new(stockfish_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to start Stockfish: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;

    if let Err(e) = write_commands(&mut stdin, fen) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(e);
    }

    let lines = match read_until_bestmove(stdout) {
        Ok(lines) => lines,
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(e);
        }
    };
    let result = build_analysis(&lines);

    let _ = writeln!(stdin, "quit");
    let _ = stdin.flush();
    let _ = child.wait();

    Ok(result)
}

pub fn resolve_stockfish_path() -> Result<PathBuf, String> {
    let exe = env::current_exe().map_err(|e| format!("Cannot locate app binary: {}", e))?;
    let exe_suffix = env::consts::EXE_SUFFIX;

    let next_to_app = exe
        .parent()
        .unwrap_or(&exe)
        .join(format!("stockfish{}", exe_suffix));
    if next_to_app.exists() {
        return Ok(next_to_app);
    }

    let triple = tauri::utils::platform::target_triple()
        .map_err(|e| format!("Cannot determine target triple: {}", e))?;
    let in_src = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!("stockfish-{}{}", triple, exe_suffix));
    if in_src.exists() {
        return Ok(in_src);
    }

    Err(
        "No se encontró el binario de Stockfish. Ejecutá `pnpm setup:stockfish` y reiniciá la app."
            .to_string(),
    )
}

fn write_commands(stdin: &mut ChildStdin, fen: &str) -> Result<(), String> {
    let commands = [
        "uci".to_string(),
        format!("setoption name MultiPV value {}", MULTIPV),
        "isready".to_string(),
        format!("position fen {}", fen),
        format!("go movetime {}", MOVETIME_MS),
    ];
    for command in &commands {
        writeln!(stdin, "{}", command)
            .map_err(|e| format!("Failed to write to Stockfish: {}", e))?;
    }
    stdin
        .flush()
        .map_err(|e| format!("Failed to flush Stockfish stdin: {}", e))?;
    Ok(())
}

fn read_until_bestmove(stdout: ChildStdout) -> Result<Vec<String>, String> {
    let reader = BufReader::new(stdout);
    let mut lines = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read Stockfish output: {}", e))?;
        lines.push(line.clone());
        if line.starts_with("bestmove") {
            break;
        }
    }
    Ok(lines)
}

fn build_analysis(lines: &[String]) -> AnalysisResult {
    let mut best_lines: Vec<Option<EngineLine>> = vec![None; MULTIPV];
    let mut best_move = String::new();

    for line in lines {
        if line.starts_with("bestmove") {
            best_move = line.split_whitespace().nth(1).unwrap_or("").to_string();
            continue;
        }
        if let Some((multipv, depth, centipawns, mate_in, moves)) = parse_info_line(line) {
            if multipv < 1 || multipv > MULTIPV {
                continue;
            }
            let idx = multipv - 1;
            let should_replace = match &best_lines[idx] {
                None => true,
                Some(existing) => depth > existing.depth,
            };
            if should_replace {
                best_lines[idx] = Some(EngineLine {
                    move_sequence: moves.join(" "),
                    centipawns,
                    mate_in,
                    depth,
                });
            }
        }
    }

    AnalysisResult {
        best_move,
        lines: best_lines.into_iter().flatten().collect(),
    }
}

fn parse_info_line(line: &str) -> Option<(usize, u32, i32, Option<i32>, Vec<&str>)> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.get(1)? != &"depth" {
        return None;
    }
    let depth = parts.get(2)?.parse::<u32>().ok()?;
    let mut multipv = 1usize;
    let mut centipawns = 0i32;
    let mut mate_in = None;
    let mut pv_moves = Vec::new();

    let mut i = 3;
    while i < parts.len() {
        match parts[i] {
            "multipv" => {
                multipv = parts.get(i + 1)?.parse::<usize>().ok()?;
                i += 2;
            }
            "score" => {
                if *parts.get(i + 1)? == "cp" {
                    centipawns = parts.get(i + 2)?.parse::<i32>().ok()?;
                    i += 3;
                } else if *parts.get(i + 1)? == "mate" {
                    let mate = parts.get(i + 2)?.parse::<i32>().ok()?;
                    mate_in = Some(mate);
                    centipawns = if mate > 0 {
                        30000 - mate
                    } else {
                        -30000 - mate
                    };
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

    if pv_moves.is_empty() {
        return None;
    }

    Some((multipv, depth, centipawns, mate_in, pv_moves))
}

#[cfg(test)]
mod tests {
    use super::*;

    const TRANSCRIPT: &[&str] = &[
        "info string NNUE evaluation using nn-5af11540bbfe.nnue enabled",
        "info depth 1 seldepth 1 multipv 1 score cp 10 nodes 30 nps 30000 time 1 pv e2e4 e7e5",
        "info depth 2 seldepth 2 multipv 1 score cp 8 nodes 90 nps 45000 time 2 pv e2e4 e7e5 g1f3",
        "info depth 3 seldepth 3 multipv 1 score cp 25 nodes 300 nps 60000 time 5 pv e2e4 e7e5 g1f3 b8c6",
        "info depth 1 seldepth 1 multipv 2 score cp 0 nodes 30 nps 30000 time 1 pv d2d4 d7d5",
        "info depth 2 seldepth 2 multipv 2 score cp -5 nodes 90 nps 45000 time 2 pv d2d4 d7d5 c2c4",
        "info depth 3 seldepth 3 multipv 2 score cp 12 nodes 300 nps 60000 time 5 pv d2d4 d7d5 c2c4 e7e6",
        "info depth 1 seldepth 1 multipv 3 score cp -15 nodes 30 nps 30000 time 1 pv c2c4 c7c5",
        "info depth 2 seldepth 2 multipv 3 score cp -20 nodes 90 nps 45000 time 2 pv c2c4 c7c5 g1f3",
        "info depth 3 seldepth 3 multipv 3 score cp -30 nodes 300 nps 60000 time 5 pv c2c4 c7c5 g1f3 g8f6",
        "bestmove e2e4 ponder e7e5",
    ];

    fn transcript_lines() -> Vec<String> {
        TRANSCRIPT.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn builds_top_lines_from_transcript() {
        let analysis = build_analysis(&transcript_lines());
        assert_eq!(analysis.best_move, "e2e4");
        assert_eq!(analysis.lines.len(), 3);
        assert_eq!(analysis.lines[0].move_sequence, "e2e4 e7e5 g1f3 b8c6");
        assert_eq!(analysis.lines[0].centipawns, 25);
        assert_eq!(analysis.lines[0].mate_in, None);
        assert_eq!(analysis.lines[0].depth, 3);
        assert_eq!(analysis.lines[1].move_sequence, "d2d4 d7d5 c2c4 e7e6");
        assert_eq!(analysis.lines[1].centipawns, 12);
        assert_eq!(analysis.lines[2].move_sequence, "c2c4 c7c5 g1f3 g8f6");
        assert_eq!(analysis.lines[2].centipawns, -30);
    }

    #[test]
    fn keeps_highest_depth_per_pv() {
        let analysis = build_analysis(&transcript_lines());
        assert_eq!(analysis.lines.len(), 3);
        for line in &analysis.lines {
            assert_eq!(line.depth, 3);
        }
    }

    #[test]
    fn parses_mate_score() {
        let line = "info depth 10 seldepth 14 multipv 1 score mate 3 nodes 1000 nps 100000 time 10 pv g1f3 e7e5 f3g5 h7h6 g5e4";
        let (multipv, depth, centipawns, mate_in, moves) =
            parse_info_line(line).expect("should parse");
        assert_eq!(multipv, 1);
        assert_eq!(depth, 10);
        assert_eq!(centipawns, 30000 - 3);
        assert_eq!(mate_in, Some(3));
        assert_eq!(moves, vec!["g1f3", "e7e5", "f3g5", "h7h6", "g5e4"]);
    }

    #[test]
    fn parses_negative_mate_score() {
        let line = "info depth 8 seldepth 12 multipv 1 score mate -4 nodes 500 nps 50000 time 10 pv e2e4 d7d5 e4d5 d8d5";
        let (_, _, centipawns, mate_in, _) = parse_info_line(line).expect("should parse");
        assert_eq!(centipawns, -30000 - (-4));
        assert_eq!(mate_in, Some(-4));
    }

    #[test]
    fn skips_lines_without_pv() {
        let line = "info depth 1 seldepth 0 nodes 10 nps 10000 time 1";
        assert!(parse_info_line(line).is_none());
    }

    #[test]
    fn ignores_info_string_lines() {
        let line = "info string NNUE evaluation using nn-5af11540bbfe.nnue enabled";
        assert!(parse_info_line(line).is_none());
    }
}
