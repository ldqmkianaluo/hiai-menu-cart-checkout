// 一条命令同时起「假后端 + vite 开发服务器」：npm run dev:full
// 适合没装 JDK 的机器，接口行为与真实 Spring Boot 后端保持一致。
import { spawn } from 'node:child_process'

const children = [
  spawn(process.execPath, ['mock-server.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
]

let closing = false
function shutdown(code = 0) {
  if (closing) return
  closing = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  setTimeout(() => process.exit(code), 120)
}

for (const child of children) {
  child.on('exit', code => {
    if (code && code !== 0) shutdown(code)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
