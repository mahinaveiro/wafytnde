import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="72" fill="#f5edd9"/>
  <rect x="64" y="64" width="384" height="384" fill="#f0c24b" stroke="#2b2118" stroke-width="24"/>
  <path d="M112 100h288v68H112z" fill="#d66b32" stroke="#2b2118" stroke-width="16"/>
  <path d="M142 206h228M142 274h184M142 342h228M142 410h132" stroke="#2b2118" stroke-width="28" stroke-linecap="square"/>
</svg>`

await mkdir('public', { recursive: true })
await writeFile('public/pwa-source.svg', svg)
await Promise.all([
  sharp(Buffer.from(svg)).resize(192, 192).png().toFile('public/pwa-192.png'),
  sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/pwa-512.png'),
])
