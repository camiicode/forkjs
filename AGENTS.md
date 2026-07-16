# AGENTS.md

Contexto para agentes de IA (OpenCode u otros) trabajando en este repo.

## Qué es ForkJS

App de escritorio (Tauri, última versión) con overlay de análisis de ajedez para Chess.com. Objetivo: **educativo**, no competitivo. Muestra al usuario la mejor jugada según Stockfish antes de mover, y una explicación en lenguaje natural (vía Groq) de por qué esa jugada es buena. No está pensado para trampa en partidas en vivo/rated — ver disclaimer en README.md.

**Importante:** NO es una extensión de navegador. Es una app de escritorio cuyo WebView (Tauri/WRY) carga chess.com directamente. El usuario juega dentro de la app, no en Chrome.

## Arquitectura

```
[WebView de Tauri carga chess.com]
      │  (JS inyectado lee el DOM, mismo enfoque que un content script,
      │   pero corre dentro del WebView propio de la app)
      ▼
[FEN extraído]
      │  IPC (invoke)
      ▼
[Backend Rust]
      │
      ├──► Stockfish nativo (binario, proceso separado) ──► top 2-3 líneas + eval (centipawns)
      │
      └──► Groq API (key segura, nunca expuesta al frontend) ──► explicación en español
      │
      │  IPC (emit/event)
      ▼
[Overlay HTML/CSS inyectado en el mismo WebView, sobre chess.com]
```

## Componentes

1. **WebView + JS inyectado (extracción de tablero)**
   - El WebView de Tauri carga chess.com directamente (no hay extensión ni navegador externo).
   - Script inyectado (vía script de inicialización de Tauri o `eval`) lee el DOM, NO usa OCR ni captura de pantalla.
   - Chess.com renderiza piezas con clases CSS tipo `piece wp square-14` (color+tipo, y casilla). Confirmar estructura exacta contra el DOM real antes de asumir.
   - Debe detectar de quién es el turno para disparar el análisis automáticamente.
   - Output: FEN válido de la posición actual, enviado al backend Rust vía IPC (`invoke`).

2. **Motor (Stockfish nativo, backend Rust)**
   - Binario de Stockfish invocado como proceso desde Rust (`std::process::Command` o crate tipo `vampirc-uci` para el protocolo UCI) — no WASM, no Web Worker.
   - Input: FEN. Output: top N líneas con evaluación y profundidad.
   - Ajustar `movetime` para no bloquear el análisis (respuesta rápida, no profundidad máxima).
   - Ventaja sobre WASM: rendimiento nativo completo, sin límites del sandbox del navegador.

3. **Explicación (Groq, backend Rust)**
   - Modelo sugerido: Llama 3.3 70B (rápido, barato, suficiente para explicar ajedez en lenguaje natural).
   - Llamada HTTP a Groq hecha desde Rust (crate `reqwest`), nunca desde el frontend — así la API key no queda expuesta en el WebView.
   - Input al LLM: FEN + últimas 3-4 jugadas + top líneas de Stockfish con sus evaluaciones.
   - Output esperado: explicación breve en español de la lógica detrás de la mejor jugada (amenazas, debilidades, principios).
   - El LLM NO decide la jugada — solo la explica. Stockfish es la única fuente de verdad táctica.

4. **Overlay UI**
   - Panel flotante HTML/CSS inyectado en el mismo WebView, sobre la interfaz de chess.com.
   - Backend Rust envía los resultados al frontend vía evento IPC (`emit`); el frontend escucha y actualiza el overlay.
   - Se actualiza automáticamente en cada turno del usuario, sin necesidad de click manual.

## Convenciones de código

- **Backend:** Rust (última versión estable de Tauri). Lógica de Stockfish y Groq vive acá, no en el frontend.
- **Frontend/WebView:** TypeScript preferido sobre JavaScript plano.
- Sin dependencias innecesarias en el frontend — priorizar vanilla TS o un framework liviano sobre algo pesado, ya que corre inyectado sobre la página de chess.com.
- Nombrar claramente cualquier función que interactúe con el DOM de terceros (chess.com puede cambiar su estructura sin aviso) — aislar esa lógica en un módulo separado (ej. `board-reader.ts`) para facilitar mantenimiento cuando chess.com cambie su HTML.
- Comandos IPC (`#[tauri::command]`) bien nombrados y con un único propósito (ej. `get_best_moves(fen: String)`, `explain_move(...)`).

## Manejo de la API key de Groq

- Nunca hardcodear la key en el código fuente.
- Guardar la key del lado de Rust (backend), usando el sistema de configuración de Tauri o variables de entorno leídas al iniciar la app — nunca en el WebView/frontend.
- Confirmar que `.env` y cualquier archivo de config con secretos estén en `.gitignore` antes del primer commit.

## Binario de Stockfish

- Debe distribuirse o descargarse por separado (no versionar el binario en el repo si es pesado — considerar un script de setup que lo descargue, o `sidecar` de Tauri para empaquetarlo con la app).
- Confirmar licencia de Stockfish (GPLv3) y sus implicaciones si se empaqueta junto con la app antes de distribuir binarios compilados.

## Fuera de alcance (por ahora)

- Integración con otras plataformas (Lichess, etc.) — no es el objetivo actual.
- Modo "auto-play" o cualquier automatización que mueva piezas por el usuario — contradice el propósito educativo del proyecto.
- Analítica de uso, telemetría, o cualquier tracking — es una herramienta personal.

## Estado actual

Proyecto en fase de desarrollo activo. Backend Rust funcional (Stockfish + Groq), frontend placeholder React. Ver sección de progreso más abajo.

### Progreso

| Componente | Estado |
|---|---|
| Tauri v2 project setup | Completado |
| Backend Rust — Stockfish integration | Completado (stockfish.rs) |
| Backend Rust — Groq API integration | Completado (groq.rs) |
| IPC commands (`get_best_moves`, `explain_move`) | Completados |
| Frontend React placeholder | Completado (App.tsx básico) |
| Board reader (extraer FEN del DOM) | Pendiente |
| Overlay UI | Pendiente |
| IPC calls desde frontend | Pendiente |
| API key management | Pendiente |
| Sidecar de Stockfish | Pendiente |

## Estrategia de commits

- **Commits atómicos y modulares:** cada commit representa un cambio lógico y aislado. Si algo hay que revertir, se revierte solo ese módulo sin afectar los demás.
- **Convencional Commits:** todos los mensajes de commit siguen el formato `tipo(scope): descripción`.
  - `feat`: nueva funcionalidad
  - `fix`: corrección de bug
  - `chore`: tareas de mantenimiento (configs, dependencias, scripts)
  - `docs`: cambios en documentación
  - `refactor`: reestructuración sin cambio de comportamiento
  - `style`: formato, espacios, etc.
- **Un commit = un concern:** no mezclar cambios de backend con docs, ni configs con features.
- **Ejemplo de historial limpio:**
  ```
  chore: update .gitignore for Tauri + Vite
  docs: add AGENTS.md with conventions and commit strategy
  docs: update README.md with current progress and setup
  chore: scaffold Vite + React + TypeScript project
  feat: implement Stockfish + Groq backend in Rust
  feat: add React frontend placeholder
  chore: add dev launcher script and static assets
  ```
