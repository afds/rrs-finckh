import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const mediaDir = path.join(here, '..', 'public', 'media')
const manifestPath = path.join(here, '..', 'public', 'data', 'media-manifest.json')

async function main() {
  const entries = await fs.readdir(mediaDir)
  console.log(`Scanning ${entries.length} media files in ${mediaDir}`)
  const manifest = {}

  for (const name of entries) {
    if (!name.endsWith('.mp4')) continue
    const match = name.match(/^([a-z]\d+)_(question|answer)\.mp4$/)
    if (!match) continue
    const [, id, kind] = match
    manifest[id] = manifest[id] || []
    if (!manifest[id].includes(kind)) {
      manifest[id].push(kind)
    }
  }

  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  const missingQuestion = Object.values(manifest).filter((kinds) => !kinds.includes('question')).length
  const missingAnswer = Object.values(manifest).filter((kinds) => !kinds.includes('answer')).length
  console.log(`Generated manifest for ${Object.keys(manifest).length} situations.`)
  console.log(`Missing question videos: ${missingQuestion}, missing answer videos: ${missingAnswer}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
