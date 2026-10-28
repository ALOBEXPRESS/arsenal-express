import JSZip from 'jszip'

const MAX_FILE = 50 * 1024 * 1024
const MAX_TOTAL = 500 * 1024 * 1024
const mime = (name: string) => /\.mp4$/i.test(name) ? 'video/mp4' : /\.webm$/i.test(name) ? 'video/webm' : /\.mov$/i.test(name) ? 'video/quicktime' : ''
const filename = (name: string) => name.split(/[\\/]/).pop() || name

/** Extract supported videos in memory, preserving archive modification timestamps. */
export async function extractVideoArchive(archive: File): Promise<File[]> {
  if (archive.size > MAX_TOTAL) throw new Error('Arquivo compactado acima de 500 MB.')
  const data = await archive.arrayBuffer()
  const result: File[] = []
  if (/\.rar$/i.test(archive.name)) {
    const { createExtractorFromData } = await import('node-unrar-js')
    const response = await fetch('/unrar.wasm')
    if (!response.ok) throw new Error('Não foi possível carregar o leitor RAR.')
    const extractor = await createExtractorFromData({ data, wasmBinary: await response.arrayBuffer() })
    const headers = [...extractor.getFileList().fileHeaders]
    const selected = headers.filter(h => !h.flags.directory && mime(h.name))
    if (selected.some(h => h.flags.encrypted)) throw new Error('Arquivos protegidos por senha não são suportados.')
    if (selected.some(h => h.unpSize > MAX_FILE) || selected.reduce((n, h) => n + h.unpSize, 0) > MAX_TOTAL) throw new Error('Vídeo acima de 50 MB ou conteúdo acima de 500 MB.')
    if (selected.length) {
      for (const entry of extractor.extract({ files: selected.map(h => h.name) }).files) {
        if (!entry.extraction) continue
        const h = entry.fileHeader
        const bytes = Uint8Array.from(entry.extraction)
        result.push(new File([bytes.buffer], filename(h.name), { type: mime(h.name), lastModified: Date.parse(h.time) || archive.lastModified }))
      }
    }
  } else {
    const zip = await JSZip.loadAsync(data)
    const entries = Object.values(zip.files).filter(e => !e.dir && mime(e.name))
    let total = 0
    for (const entry of entries) {
      const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
      if (size == null || size > MAX_FILE || (total += size) > MAX_TOTAL) throw new Error('Vídeo acima de 50 MB ou conteúdo acima de 500 MB.')
      const bytes = await entry.async('arraybuffer')
      result.push(new File([bytes], filename(entry.name), { type: mime(entry.name), lastModified: entry.date?.getTime() || archive.lastModified }))
    }
  }
  if (!result.length) throw new Error('Nenhum vídeo MP4, WebM ou MOV encontrado no arquivo.')
  return result.sort((a, b) => a.lastModified - b.lastModified)
}
