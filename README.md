# ForkJS

Overlay de análisis de ajedez para Chess.com, potenciado por Stockfish (motor local) y Groq (explicaciones en lenguaje natural). Pensado para estudiar posiciones y entender el *por qué* detrás de cada jugada recomendada, no para jugar por ti.

## ¿Qué hace?

- Lee el estado del tablero directamente del DOM de Chess.com (sin OCR, sin captura de pantalla).
- Calcula las mejores líneas con Stockfish corriendo localmente en tu navegador.
- Usa un LLM vía Groq para traducir esas líneas en explicaciones legibles: qué amenaza, qué debilidad explota, qué principio aplica.
- Se activa antes de que muevas, para que puedas comparar tu idea con la del motor y aprender de la diferencia.

## Disclaimer

ForkJS fue desarrollado con fines exclusivamente educativos, para ayudar a analizar posiciones y aprender de las decisiones de un motor de ajedez. No está diseñado ni destinado para hacer trampa en partidas en vivo, clasificadas o de streaming.

El uso de asistencia externa durante partidas en Chess.com (u otras plataformas) puede violar sus términos de servicio y resultar en sanciones de cuenta. El autor no se hace responsable del mal uso de esta herramienta por parte de terceros.

Uso bajo tu propio riesgo.

## Stack

- **Extracción de tablero:** content script (extensión de navegador) leyendo el DOM de Chess.com.
- **Motor:** Stockfish.wasm en Web Worker, local, sin costo.
- **Explicaciones:** Groq API (Llama 3.3 70B u otro modelo compatible).

## Instalación

*(pendiente de completar a medida que avance el desarrollo)*

## Licencia

MIT — ver [LICENSE](./LICENSE).
