import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'

// Build a fresh "mini-version" on every commit: major.minor from package.json,
// patch = total git commit count. Vercel clones shallowly (depth 10), which
// froze the count at 10 — in that case fall back to the commit timestamp
// (minutes since 2026-01-01), which strictly increases with every commit.
function buildVersion() {
  let base = '3.2'
  try { base = JSON.parse(readFileSync('./package.json', 'utf8')).version.split('.').slice(0, 2).join('.') } catch {}
  let sha = 'dev'
  try { sha = execSync('git rev-parse --short HEAD').toString().trim() } catch {}
  let patch = '0'
  const shallow = existsSync('.git/shallow')
  try {
    if (!shallow) {
      patch = execSync('git rev-list --count HEAD').toString().trim()
    } else {
      const ts = parseInt(execSync('git log -1 --format=%ct').toString().trim(), 10) * 1000
      const EPOCH = Date.UTC(2026, 0, 1)
      patch = String(Math.max(1, Math.floor((ts - EPOCH) / 60000)))
    }
  } catch {}
  return { version: `${base}.${patch}`, sha }
}

const { version, sha } = buildVersion()

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_SHA__: JSON.stringify(sha),
  },
})
