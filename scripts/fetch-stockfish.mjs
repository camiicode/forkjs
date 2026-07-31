import { execSync, spawn } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, copyFileSync, statSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BINARIES_DIR = join(ROOT, 'src-tauri', 'binaries')
const TMP_DIR = join(BINARIES_DIR, '.tmp')

const ASSET_PREFERENCE = [
  'stockfish-windows-x86-64-avx2.zip',
  'stockfish-windows-x86-64-sse41-popcnt.zip',
  'stockfish-windows-x86-64-bmi2.zip',
  'stockfish-windows-x86-64.zip',
]

function targetTriple() {
  try {
    const triple = execSync('rustc --print host-tuple', { encoding: 'utf8' }).trim()
    if (triple) return triple
  } catch {
    // rustc not on PATH; fall through
  }
  if (process.platform === 'win32' && process.arch === 'x64') return 'x86_64-pc-windows-msvc'
  throw new Error(`Cannot determine target triple for ${process.platform}-${process.arch}`)
}

async function latestRelease() {
  const res = await fetch('https://api.github.com/repos/official-stockfish/Stockfish/releases/latest', {
    headers: { 'User-Agent': 'forkjs-setup' },
  })
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status} ${res.statusText}`)
  }
  return res.json()
}

function pickAsset(release) {
  for (const preferred of ASSET_PREFERENCE) {
    const asset = release.assets?.find((a) => a.name === preferred)
    if (asset) return asset
  }
  const windowsZip = release.assets?.find(
    (a) => a.name.startsWith('stockfish-windows-x86-64') && a.name.endsWith('.zip'),
  )
  if (!windowsZip) throw new Error('No Windows x86-64 Stockfish asset found in latest release')
  return windowsZip
}

async function download(asset, dest) {
  process.stdout.write(`Downloading ${asset.name}...\n`)
  const res = await fetch(asset.browser_download_url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(dest), { recursive: true })
  await import('node:fs/promises').then(({ writeFile }) => writeFile(dest, buf))
  process.stdout.write(`Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB\n`)
}

function findExe(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findExe(full)
      if (found) return found
    } else if (entry.name.toLowerCase().endsWith('.exe')) {
      return full
    }
  }
  return null
}

function smokeTest(binary) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'inherit'] })
    let out = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Stockfish smoke test timed out'))
    }, 15000)
    child.stdout.on('data', (chunk) => {
      out += chunk.toString()
      if (out.includes('bestmove') && out.includes('Stockfish')) {
        clearTimeout(timer)
        child.kill()
        resolvePromise()
      }
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code !== 0 && !out.includes('Stockfish')) reject(new Error(`Stockfish exited with code ${code}`))
      else resolvePromise()
    })
    child.stdin.write('uci\nquit\n')
  })
}

async function main() {
  const triple = targetTriple()
  const destination = join(BINARIES_DIR, `stockfish-${triple}.exe`)

  if (existsSync(destination) && statSync(destination).size > 10 * 1024 * 1024) {
    process.stdout.write(`Stockfish already present: ${destination}\n`)
    return
  }

  mkdirSync(TMP_DIR, { recursive: true })

  try {
    const release = await latestRelease()
    const asset = pickAsset(release)
    const zipPath = join(TMP_DIR, asset.name)
    await download(asset, zipPath)

    process.stdout.write('Extracting...\n')
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${TMP_DIR}' -Force"`,
      { stdio: 'inherit' },
    )

    const exe = findExe(TMP_DIR)
    if (!exe) throw new Error('stockfish.exe not found inside archive')

    mkdirSync(BINARIES_DIR, { recursive: true })
    copyFileSync(exe, destination)

    process.stdout.write('Verifying binary (uci)...\n')
    await smokeTest(destination)

    process.stdout.write(`Stockfish ${release.tag_name} installed: ${destination}\n`)
  } finally {
    rmSync(TMP_DIR, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
