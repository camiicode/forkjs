import { Chess } from 'chess.js'

export interface EngineLine {
  move_sequence: string
  centipawns: number
  mate_in: number | null
  depth: number
}

export interface AnalysisResult {
  best_move: string
  lines: EngineLine[]
}

const OVERLAY_ID = 'fk-overlay'
const STYLE_ID = 'fk-overlay-style'
const Z_INDEX = 2147483000

let mounted = false
let overlayEl: HTMLElement | null = null
let headerEl: HTMLElement | null = null
let bodyEl: HTMLElement | null = null

function injectStyles(): boolean {
  if (document.getElementById(STYLE_ID)) return true
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #fk-overlay {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: ${Z_INDEX};
      pointer-events: none;
      min-width: 240px;
      max-width: 360px;
      background: rgba(15, 15, 20, 0.92);
      color: #e8e8e8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.45;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 10px 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
      user-select: none;
    }
    #fk-overlay .fk-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      color: #9ecbff;
      font-size: 11px;
      text-transform: uppercase;
    }
    #fk-overlay .fk-status {
      font-weight: 400;
      color: #9a9aa5;
      text-transform: none;
    }
    #fk-overlay .fk-line {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 0;
    }
    #fk-overlay .fk-line.best {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 6px;
    }
    #fk-overlay .fk-moves {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #fk-overlay .fk-eval {
      font-weight: 700;
      color: #8df0a2;
      white-space: nowrap;
    }
    #fk-overlay .fk-eval.neg {
      color: #ff8f8f;
    }
    #fk-overlay .fk-depth {
      color: #9a9aa5;
      white-space: nowrap;
    }
    #fk-overlay .fk-error {
      color: #ffb0b0;
    }
    #fk-overlay .fk-ready {
      color: #9a9aa5;
    }
    #fk-overlay .fk-loading {
      color: #9a9aa5;
      animation: fk-blink 1s steps(2, start) infinite;
    }
    @keyframes fk-blink {
      to { visibility: hidden; }
    }
  `
  const target = document.head ?? document.documentElement
  if (!target) return false
  target.appendChild(style)
  return true
}

export function mountOverlay(): void {
  if (mounted) return
  if (!document.documentElement || !injectStyles()) {
    requestAnimationFrame(mountOverlay)
    return
  }
  mounted = true
  overlayEl = document.createElement('div')
  overlayEl.id = OVERLAY_ID
  overlayEl.style.display = 'none'
  headerEl = document.createElement('div')
  headerEl.className = 'fk-header'
  const title = document.createElement('span')
  title.textContent = 'ForkJS'
  const status = document.createElement('span')
  status.className = 'fk-status'
  headerEl.appendChild(title)
  headerEl.appendChild(status)
  bodyEl = document.createElement('div')
  overlayEl.appendChild(headerEl)
  overlayEl.appendChild(bodyEl)
  document.documentElement.appendChild(overlayEl)
}

function setStatus(text: string): void {
  if (headerEl) headerEl.querySelector('.fk-status')!.textContent = text
}

function setVisible(visible: boolean): void {
  if (overlayEl) overlayEl.style.display = visible ? 'block' : 'none'
}

function body(): HTMLElement {
  return bodyEl as HTMLElement
}

export function setReady(): void {
  mountOverlay()
  setVisible(true)
  setStatus('Listo')
  body().textContent = ''
  const ready = document.createElement('div')
  ready.className = 'fk-ready'
  ready.textContent = 'Esperando tu turno…'
  body().appendChild(ready)
}

export function setLoading(): void {
  mountOverlay()
  setVisible(true)
  setStatus('Analizando…')
  body().textContent = ''
  const loading = document.createElement('div')
  loading.className = 'fk-loading'
  loading.textContent = 'Stockfish pensando…'
  body().appendChild(loading)
}

export function showError(message: string): void {
  mountOverlay()
  setVisible(true)
  setStatus('Error')
  body().textContent = ''
  const error = document.createElement('div')
  error.className = 'fk-error'
  error.textContent = message
  body().appendChild(error)
}

export function hideOverlay(): void {
  setVisible(false)
}

function formatEval(line: EngineLine): string {
  if (line.mate_in !== null && line.mate_in !== undefined) {
    return line.mate_in > 0 ? `M${line.mate_in}` : `-M${Math.abs(line.mate_in)}`
  }
  const pawns = line.centipawns / 100
  const sign = pawns > 0 ? '+' : ''
  return `${sign}${pawns.toFixed(2)}`
}

function uciToSan(fen: string, moves: string[]): string[] | null {
  try {
    const chess = new Chess(fen)
    const sans: string[] = []
    for (const uci of moves) {
      const from = uci.slice(0, 2)
      const to = uci.slice(2, 4)
      const promotion = uci.length > 4 ? uci.slice(4) : undefined
      const move = chess.move({ from, to, promotion })
      sans.push(move.san)
    }
    return sans
  } catch {
    return null
  }
}

function renderLine(fen: string, line: EngineLine, isBest: boolean): HTMLElement {
  const row = document.createElement('div')
  row.className = isBest ? 'fk-line best' : 'fk-line'

  const movesEl = document.createElement('span')
  movesEl.className = 'fk-moves'
  const uciMoves = line.move_sequence.split(' ')
  const sans = uciToSan(fen, uciMoves)
  movesEl.textContent = sans ? sans.join(' ') : line.move_sequence
  movesEl.title = line.move_sequence

  const evalEl = document.createElement('span')
  evalEl.className = 'fk-eval'
  const evalText = formatEval(line)
  evalEl.textContent = evalText
  if (evalText.startsWith('-')) evalEl.classList.add('neg')

  const depthEl = document.createElement('span')
  depthEl.className = 'fk-depth'
  depthEl.textContent = `d${line.depth}`

  row.appendChild(movesEl)
  row.appendChild(evalEl)
  row.appendChild(depthEl)
  return row
}

export function updateAnalysis(result: AnalysisResult, fen: string): void {
  mountOverlay()
  setVisible(true)
  setStatus(`depth ${result.lines[0]?.depth ?? '?'}`)
  body().textContent = ''
  if (result.lines.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'fk-error'
    empty.textContent = 'Sin análisis disponible'
    body().appendChild(empty)
    return
  }
  result.lines.forEach((line, index) => {
    body().appendChild(renderLine(fen, line, index === 0))
  })
}
