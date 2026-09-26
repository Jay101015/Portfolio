/**
 * Saving files. Inside a claude.ai hosted page plain download links are
 * blocked, so use its `downloads` capability there; everywhere else (Vercel,
 * local dev) fall back to a normal download link.
 */
type Downloads = { save: (r: { filename: string; data: Blob }) => Promise<unknown> }
type ClaudeHost = { use: (name: string) => Promise<unknown> }

const host = (window as unknown as { claude?: ClaudeHost }).claude
export const hostedOnClaude = typeof host?.use === 'function'

let downloads: Promise<Downloads | null> | null = null
const getDownloads = () =>
  (downloads ??= hostedOnClaude
    ? (host!.use('downloads') as Promise<Downloads | null>).catch(() => null)
    : Promise.resolve(null))

// Resolve early so the first Save tap isn't kept waiting.
getDownloads()

export type SaveOutcome = 'saved' | 'declined' | 'failed'

export async function saveFile(filename: string, blob: Blob): Promise<SaveOutcome> {
  const d = await getDownloads()
  if (d) {
    try {
      await d.save({ filename, data: blob })
      return 'saved'
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'failed'
    }
  }
  if (hostedOnClaude) return 'failed'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'saved'
}
