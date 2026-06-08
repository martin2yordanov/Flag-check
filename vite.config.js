import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

// Build a fresh "mini-version" on every push: major.minor from package.json,
// patch = total git commit count (monotonically increases with each commit/push).
function buildVersion() {
  let base = '3.2'
  try { base = JSON.parse(readFileSync('./package.json', 'utf8')).version.split('.').slice(0, 2).join('.') } catch {}
  let count = '0'
  try { count = execSync('git rev-list --count HEAD').toString().trim() } catch {}
  let sha = 'dev'
  try { sha = execSync('git rev-parse --short HEAD').toString().trim() } catch {}
  return { version: `${base}.${count}`, sha }
}

const { version, sha } = buildVersion()

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_SHA__: JSON.stringify(sha),
  },
})
