import { invoke } from '@tauri-apps/api/core'
import { findBoard, isUserTurn, subscribeBoard } from './board-reader'
import {
  mountOverlay,
  setLoading,
  setReady,
  updateAnalysis,
  showError,
  type AnalysisResult,
} from './overlay'

function boot(): void {
  if (window.top !== window.self) return

  const start = (): void => {
    console.info('[forkjs] board reader active')
    mountOverlay()
    setReady()

    let hadBoard: boolean | null = null
    const logBoardState = (): void => {
      const found = findBoard() !== null
      if (found === hadBoard) return
      hadBoard = found
      console.info(`[forkjs] board ${found ? 'found' : 'not found'}`)
    }
    logBoardState()
    window.setInterval(logBoardState, 2000)

    subscribeBoard((fen) => {
      console.info(`[forkjs] position changed: ${fen} (user turn: ${isUserTurn(fen)})`)
      if (!isUserTurn(fen)) return
      console.debug('[forkjs] analyzing FEN:', fen)
      setLoading()
      invoke<AnalysisResult>('get_best_moves', { fen })
        .then((result) => {
          console.info('[forkjs] analysis:', result)
          updateAnalysis(result, fen)
        })
        .catch((err) => {
          console.error('[forkjs] get_best_moves failed:', err)
          showError(String(err))
        })
    })
  }

  if (document.documentElement) {
    start()
  } else {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  }
}

boot()
