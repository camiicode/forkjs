# ForkJS

Aplicación de escritorio (Tauri) con overlay de análisis de ajedez para Chess.com, potenciado por Stockfish (motor nativo) y Groq (explicaciones en lenguaje natural). Pensado para estudiar posiciones y entender el _por qué_ detrás de cada jugada recomendada, no para jugar por ti.

ForkJS **no es una extensión de navegador**: es una app de escritorio que carga chess.com en su propio WebView (Tauri/WRY) y superpone el análisis directamente ahí.

## ¿Qué hace?

- Carga Chess.com dentro de su propio WebView y lee el estado del tablero directamente del DOM (sin OCR, sin captura de pantalla).
- Calcula las mejores líneas con Stockfish corriendo como proceso nativo en el backend (Rust).
- Usa un LLM vía Groq para traducir esas líneas en explicaciones legibles: qué amenaza, qué debilidad explota, qué principio aplica.
- Se activa antes de que muevas, para que puedas comparar tu idea con la del motor y aprender de la diferencia.

## Disclaimer

ForkJS fue desarrollado con fines exclusivamente educativos, para ayudar a analizar posiciones y aprender de las decisiones de un motor de ajedez. No está diseñado ni destinado para hacer trampa en partidas en vivo, clasificadas o de streaming.

El uso de asistencia externa durante partidas en Chess.com (u otras plataformas) puede violar sus términos de servicio y resultar en sanciones de cuenta. El autor no se hace responsable del mal uso de esta herramienta por parte de terceros.

Uso bajo tu propio riesgo.

## Stack

- **App shell:** Tauri (última versión) — el WebView carga chess.com directamente, no hay navegador externo de por medio.
- **Extracción de tablero:** JavaScript inyectado en el WebView leyendo el DOM de Chess.com.
- **Motor:** Stockfish nativo (binario), invocado desde el backend en Rust — no WASM.
- **Explicaciones:** Groq API (Llama 3.3 70B u otro modelo compatible), llamada desde Rust para no exponer la API key al frontend.
- **Comunicación:** IPC de Tauri entre el WebView (frontend) y el backend Rust.

## Estructura del proyecto

```
forkjs/
├── src-tauri/              # Backend Rust (Tauri)
│   ├── src/
│   │   ├── main.rs         # Entry point de Tauri
│   │   ├── lib.rs          # Registro de IPC commands
│   │   ├── stockfish.rs    # Integración con Stockfish (UCI)
│   │   └── groq.rs         # Integración con Groq API
│   ├── Cargo.toml          # Dependencias Rust
│   ├── tauri.conf.json     # Configuración de Tauri
│   └── capabilities/       # Permisos de Tauri
├── src/                    # Frontend (React + TypeScript)
│   ├── App.tsx             # Placeholder principal
│   ├── main.tsx            # Entry point React
│   └── assets/             # SVGs, imágenes
├── public/                 # Assets estáticos (favicon, icons)
├── index.html              # Entry point de Vite
├── dev.bat                 # Lanzador de desarrollo (Windows)
├── package.json            # Dependencias Node/pnpm
└── vite.config.ts          # Configuración de Vite
```

## Instalación

### Requisitos

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (v10+)
- [Rust](https://www.rust-lang.org/tools/install) (v1.77+)
- [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) con el componente "Trabajos de carga de trabajo de C++ de Windows"
- [Stockfish](https://stockfishchess.org/download/) (binario en el PATH del sistema)

### Desarrollo

```bash
# Instalar dependencias Node
pnpm install

# Ejecutar en modo desarrollo (Windows)
dev.bat

# O manualmente desde una terminal con entorno MSVC configurado
pnpm tauri dev
```

### Construcción

```bash
pnpm tauri build
```

## Estado actual

| Componente | Estado |
|---|---|
| Tauri v2 project setup | Completado |
| Backend Rust — Stockfish | Completado |
| Backend Rust — Groq API | Completado |
| IPC commands | Completados |
| Frontend React | Placeholder básico |
| Board reader (FEN del DOM) | Pendiente |
| Overlay UI | Pendiente |
| IPC calls desde frontend | Pendiente |
| API key management | Pendiente |
| Sidecar de Stockfish | Pendiente |

## Licencia

MIT — ver [LICENSE](./LICENSE).
