import { Chess, validateFen } from 'chess.js'

const BOARD_SELECTORS = ['wc-chess-board.board', '#board-single', '.board']
const MOVE_LIST_SELECTORS = [
  '.move-list-component',
  '.vertical-move-list-component',
  '.game-panel-move-list',
]
const PIECE_CLASS_RE = /(?:^|\s)([wb])([pnbrqk])(?=\s|$)/
const SQUARE_CLASS_RE = /square-(\d)(\d)/
const RESULT_TOKENS = /^(1-0|0-1|1\/2-1\/2|\*)$/
const FILE_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

export interface Piece {
  square: string
  fenChar: string
}

export function findBoard(): Element | null {
  for (const selector of BOARD_SELECTORS) {
    const el = document.querySelector(selector)
    if (el) return el
  }
  return null
}

function classTokens(el: Element): string {
  if (typeof el.className === 'string') return el.className
  return el.getAttribute('class') ?? ''
}

export function readPieceMap(board: Element): Piece[] {
  const pieces: Piece[] = []
  for (const el of board.querySelectorAll('.piece')) {
    if (el.classList.contains('dragging')) continue
    const pieceMatch = classTokens(el).match(PIECE_CLASS_RE)
    const squareMatch = classTokens(el).match(SQUARE_CLASS_RE)
    if (!pieceMatch || !squareMatch) continue
    const file = Number(squareMatch[1])
    const rank = Number(squareMatch[2])
    if (file < 1 || file > 8 || rank < 1 || rank > 8) continue
    pieces.push({
      square: FILE_LETTERS[file - 1] + rank,
      fenChar: pieceMatch[1] === 'w' ? pieceMatch[2].toUpperCase() : pieceMatch[2],
    })
  }
  return pieces
}

export function buildPlacement(pieces: Piece[]): string {
  const bySquare = new Map(pieces.map((p) => [p.square, p.fenChar]))
  const ranks: string[] = []
  for (let rank = 8; rank >= 1; rank--) {
    let row = ''
    let empty = 0
    for (let file = 1; file <= 8; file++) {
      const fenChar = bySquare.get(FILE_LETTERS[file - 1] + rank)
      if (!fenChar) {
        empty++
      } else {
        if (empty > 0) {
          row += empty
          empty = 0
        }
        row += fenChar
      }
    }
    if (empty > 0) row += empty
    ranks.push(row)
  }
  return ranks.join('/')
}

function isVariationNode(el: Element): boolean {
  let node: Element | null = el
  while (node) {
    const tokens = classTokens(node).split(/\s+/)
    if (tokens.some((t) => t.includes('variation'))) return true
    node = node.parentElement
  }
  return false
}

function sanTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length > 0 &&
        !/^\d+\.+$/.test(t) &&
        !RESULT_TOKENS.test(t),
    )
}

function readMainLineMoves(): string[] {
  for (const selector of MOVE_LIST_SELECTORS) {
    const root = document.querySelector(selector)
    if (!root) continue

    const plies: string[] = []
    const moveElements = Array.from(root.querySelectorAll('wc-move'))
    for (const el of moveElements) {
      if (isVariationNode(el)) continue
      plies.push(...sanTokens(el.textContent ?? ''))
    }
    if (plies.length > 0) return plies

    const nodeElements = Array.from(root.querySelectorAll('.node'))
    for (const el of nodeElements) {
      if (isVariationNode(el)) continue
      plies.push(...sanTokens(el.textContent ?? ''))
    }
    if (plies.length > 0) return plies
  }
  return []
}

function fenFromMoves(moves: string[]): string | null {
  try {
    const chess = new Chess()
    for (const san of moves) {
      chess.move(san)
    }
    return chess.fen()
  } catch {
    return null
  }
}

function placementsEqual(fen: string, pieces: Piece[]): boolean {
  return fen.split(' ')[0] === buildPlacement(pieces)
}

export function buildFen(): string | null {
  const board = findBoard()
  if (!board) return null

  const dataFen = board.getAttribute('data-fen')
  if (dataFen && validateFen(dataFen).ok) return dataFen.trim()

  const pieces = readPieceMap(board)
  if (pieces.length === 0) return null

  const moves = readMainLineMoves()
  if (moves.length > 0) {
    const replayed = fenFromMoves(moves)
    if (replayed && placementsEqual(replayed, pieces)) return replayed
  }

  const placement = buildPlacement(pieces)
  const turn = moves.length % 2 === 0 ? 'w' : 'b'
  return `${placement} ${turn} - - 0 1`
}

export function isUserTurn(fen: string | null): boolean {
  if (!fen) return false
  const board = findBoard()
  if (!board) return false
  const userIsBlack = board.classList.contains('flipped')
  const turn = fen.split(' ')[1]
  return (userIsBlack ? 'b' : 'w') === turn
}

export function subscribeBoard(onChange: (fen: string) => void): () => void {
  let lastFen: string | null = null
  let debounceTimer: number | undefined
  let observer: MutationObserver | null = null
  let observedBoard: Element | null = null
  let recheckTimer: number | undefined

  const notify = () => {
    const fen = buildFen()
    if (fen && fen !== lastFen) {
      lastFen = fen
      onChange(fen)
    }
  }

  const detach = () => {
    if (observer) {
      observer.disconnect()
      observer = null
    }
    observedBoard = null
  }

  const attach = () => {
    const board = findBoard()
    if (!board || board === observedBoard) return
    detach()
    observedBoard = board
    observer = new MutationObserver(() => {
      window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(notify, 250)
    })
    observer.observe(board, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    notify()
  }

  attach()
  recheckTimer = window.setInterval(() => {
    const board = findBoard()
    if (board !== observedBoard) attach()
  }, 1500)

  return () => {
    window.clearTimeout(debounceTimer)
    window.clearInterval(recheckTimer)
    detach()
  }
}
