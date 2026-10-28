import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ArrowDownToLine, ImagePlus, X } from 'lucide-react'
import { formatBytes, loadImage } from './imageTools'
import UploadZone from './UploadZone'

type MergeImage = { file: File; image: HTMLImageElement }
type MergeOutput = { url: string; previewUrl: string; blob: Blob; width: number; height: number; filename: string }

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function bytes(value: string) { return new TextEncoder().encode(value) }
function joinBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}
function word16(value: number) { const result = new Uint8Array(2); new DataView(result.buffer).setUint16(0, value, true); return result }
function word32(value: number) { const result = new Uint8Array(4); new DataView(result.buffer).setUint32(0, value, true); return result }

function zipStore(entries: Array<{ name: string; data: Uint8Array }>) {
  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0 }
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = []
  let localOffset = 0
  for (const entry of entries) {
    const name = bytes(entry.name)
    let crc = 0xffffffff
    for (const byte of entry.data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    crc = (crc ^ 0xffffffff) >>> 0
    const local = joinBytes([word32(0x04034b50), word16(20), word16(0x0800), word16(0), word16(0), word16(0), word32(crc), word32(entry.data.length), word32(entry.data.length), word16(name.length), word16(0), name, entry.data])
    locals.push(local)
    centrals.push(joinBytes([word32(0x02014b50), word16(20), word16(20), word16(0x0800), word16(0), word16(0), word16(0), word32(crc), word32(entry.data.length), word32(entry.data.length), word16(name.length), word16(0), word16(0), word16(0), word16(0), word32(0), word32(localOffset), name]))
    localOffset += local.length
  }
  const centralDirectory = joinBytes(centrals)
  return joinBytes([...locals, centralDirectory, word32(0x06054b50), word16(0), word16(0), word16(entries.length), word16(entries.length), word32(centralDirectory.length), word32(localOffset), word16(0)])
}

async function jpegBytes(canvas: HTMLCanvasElement) {
  const flattened = document.createElement('canvas')
  flattened.width = canvas.width; flattened.height = canvas.height
  const context = flattened.getContext('2d')
  if (!context) throw new Error('Your browser could not prepare this document.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, flattened.width, flattened.height)
  context.drawImage(canvas, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => flattened.toBlob(result => result ? resolve(result) : reject(new Error('Your browser could not encode this document.')), 'image/jpeg', .92))
  return new Uint8Array(await blob.arrayBuffer())
}

async function makePdf(canvas: HTMLCanvasElement) {
  const image = await jpegBytes(canvas)
  const pageWidth = 612, pageHeight = 792
  const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
  const drawWidth = canvas.width * scale, drawHeight = canvas.height * scale
  const left = (pageWidth - drawWidth) / 2, bottom = (pageHeight - drawHeight) / 2
  const content = bytes(`q\n${drawWidth} 0 0 ${drawHeight} ${left} ${bottom} cm\n/Im0 Do\nQ\n`)
  const streams = [
    bytes('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    bytes('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
    bytes('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n'),
    joinBytes([bytes(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, bytes('\nendstream\nendobj\n')]),
    joinBytes([bytes(`5 0 obj\n<< /Length ${content.length} >>\nstream\n`), content, bytes('endstream\nendobj\n')]),
  ]
  const header = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10])
  const offsets = [0]
  let position = header.length
  for (const stream of streams) { offsets.push(position); position += stream.length }
  const xrefOffset = position
  const xref = bytes(`xref\n0 ${streams.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${streams.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)
  return new Blob([header, ...streams, xref], { type: 'application/pdf' })
}

async function makeDocx(canvas: HTMLCanvasElement) {
  const image = await jpegBytes(canvas)
  const maxWidth = 5_486_400, maxHeight = 6_858_000
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height)
  const width = Math.round(canvas.width * scale), height = Math.round(canvas.height * scale)
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="1" name="Merged image"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="merged-image.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
  const entries = [
    { name: '[Content_Types].xml', data: bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: '_rels/.rels', data: bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: 'word/document.xml', data: bytes(documentXml) },
    { name: 'word/_rels/document.xml.rels', data: bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpg"/></Relationships>') },
    { name: 'word/media/image1.jpg', data: image },
  ]
  return new Blob([zipStore(entries)], { type: DOCX_MIME })
}

export default function ImageMerger() {
  const [images, setImages] = useState<MergeImage[]>([])
  const [layout, setLayout] = useState<'vertical' | 'horizontal'>('vertical')
  const [spacing, setSpacing] = useState(32)
  const [format, setFormat] = useState('application/pdf')
  const [output, setOutput] = useState<MergeOutput | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pickerRef = useRef<HTMLInputElement>(null)
  const imageUrls = useRef(new Set<string>())
  const outputUrl = useRef<string | null>(null)
  const previewUrl = useRef<string | null>(null)
  const previewWasCreated = useRef(false)

  useEffect(() => () => {
    for (const url of imageUrls.current) URL.revokeObjectURL(url)
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current)
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
  }, [])

  function clearOutput() {
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current)
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    outputUrl.current = null
    previewUrl.current = null
    setOutput(null)
  }

  async function addImages(files: File[]) {
    if (!files.length) return
    previewWasCreated.current = false
    setError('')
    clearOutput()
    setBusy(true)
    const available = Math.max(0, 10 - images.length)
    const additions = files.slice(0, available)
    if (files.length > available) setError('You can merge up to 10 images at a time.')
    const loaded = await Promise.all(additions.map(async file => {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return { error: `${file.name}: choose a JPG, PNG, WebP, or GIF image.` }
      if (file.size > 30 * 1024 * 1024) return { error: `${file.name}: the file is over 30 MB.` }
      try {
        const image = await loadImage(file)
        if (image.naturalWidth * image.naturalHeight > 50_000_000) { URL.revokeObjectURL(image.src); return { error: `${file.name}: the image is too large to merge smoothly.` } }
        imageUrls.current.add(image.src)
        return { image: { file, image } }
      } catch { return { error: `${file.name}: your browser could not open this image.` } }
    }))
    const ready = loaded.flatMap(result => result.image ? [result.image] : [])
    const failures = loaded.flatMap(result => result.error ? [result.error] : [])
    if (ready.length) setImages(current => [...current, ...ready])
    if (failures.length) setError(failures.join(' '))
    setBusy(false)
    if (pickerRef.current) pickerRef.current.value = ''
  }

  function removeImage(index: number) {
    previewWasCreated.current = false
    setImages(current => {
      const removed = current[index]
      if (removed) { URL.revokeObjectURL(removed.image.src); imageUrls.current.delete(removed.image.src) }
      return current.filter((_, currentIndex) => currentIndex !== index)
    })
    clearOutput()
  }

  async function createPreview() {
    if (images.length < 2) { setError('Add at least two images to merge them.'); return }
    setBusy(true); setError(''); clearOutput()
    try {
      // Spacing is specified in output pixels. Keep it fixed when large source
      // images are scaled down to fit the canvas limits.
      const gap = spacing * (images.length - 1)
      const imageWidth = layout === 'vertical'
        ? Math.max(...images.map(({ image }) => image.naturalWidth))
        : images.reduce((sum, { image }) => sum + image.naturalWidth, 0)
      const imageHeight = layout === 'vertical'
        ? images.reduce((sum, { image }) => sum + image.naturalHeight, 0)
        : Math.max(...images.map(({ image }) => image.naturalHeight))
      const dimensionsAt = (scale: number) => layout === 'vertical'
        ? { width: imageWidth * scale, height: imageHeight * scale + gap }
        : { width: imageWidth * scale + gap, height: imageHeight * scale }
      let low = 0
      let high = 1
      for (let i = 0; i < 32; i += 1) {
        const candidate = (low + high) / 2
        const size = dimensionsAt(candidate)
        if (Math.max(size.width, size.height) <= 8000 && size.width * size.height <= 50_000_000) low = candidate
        else high = candidate
      }
      const scale = low
      const dimensions = dimensionsAt(scale)
      const width = Math.max(1, Math.round(dimensions.width))
      const height = Math.max(1, Math.round(dimensions.height))
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not prepare the image preview.')
      if (format !== 'image/png' && format !== 'image/webp') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height) }
      let offset = 0
      for (const [index, { image }] of images.entries()) {
        const drawWidth = image.naturalWidth * scale
        const drawHeight = image.naturalHeight * scale
        if (layout === 'vertical') context.drawImage(image, (width - drawWidth) / 2, offset, drawWidth, drawHeight)
        else context.drawImage(image, offset, (height - drawHeight) / 2, drawWidth, drawHeight)
        if (index < images.length - 1 && spacing > 0) {
          context.fillStyle = '#e7eee8'
          if (layout === 'vertical') context.fillRect(0, offset + drawHeight, width, spacing)
          else context.fillRect(offset + drawWidth, 0, spacing, height)
        }
        offset += (layout === 'vertical' ? drawHeight : drawWidth) + (index < images.length - 1 ? spacing : 0)
      }
      const imageBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Your browser could not create the image preview.')), 'image/png'))
      const blob = format === 'application/pdf' ? await makePdf(canvas)
        : format === DOCX_MIME ? await makeDocx(canvas)
          : await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Your browser could not create this image format.')), format, .92))
      const extension = format === 'application/pdf' ? 'pdf' : format === DOCX_MIME ? 'docx' : blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      const url = URL.createObjectURL(blob)
      const imageUrl = URL.createObjectURL(imageBlob)
      outputUrl.current = url
      previewUrl.current = imageUrl
      previewWasCreated.current = true
      setOutput({ url, previewUrl: imageUrl, blob, width, height, filename: `freeimagetools-merged.${extension}` })
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not merge these images. Try again.') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!previewWasCreated.current || images.length < 2) return
    const timer = window.setTimeout(() => { void createPreview() }, 180)
    return () => window.clearTimeout(timer)
  }, [spacing, layout, format])

  function download() {
    if (!output) return
    const link = document.createElement('a')
    link.href = output.url; link.download = output.filename; link.click()
  }

  const accepted = 'JPG, PNG, WebP, or GIF'
  if (!images.length) return <main className="tool-page">
    <section className="hero tool-hero"><div className="eyebrow">IMAGE MERGER</div><h1>Merge images<span>.</span></h1><p>Choose two or more images and combine them into one file.</p></section>
    <section className="workspace workspace-upload-only" aria-label="Upload images to merge">
      <div className="upload-start-card"><UploadZone formats={`${accepted} · select multiple`} busy={busy} onChoose={files => void addImages(files)} onBrowse={() => pickerRef.current?.click()}/>{error && <div className="notice notice-error" role="alert">{error}</div>}</div>
    </section>
    <input ref={pickerRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" aria-label="Choose images to merge" onChange={(event: ChangeEvent<HTMLInputElement>) => void addImages(Array.from(event.target.files || []))}/>
  </main>

  return <main className="tool-page merger-page">
    <section className="hero tool-hero"><div className="eyebrow">IMAGE MERGER</div><h1>Merge images<span>.</span></h1><p>Arrange your images, preview the combined file, and download it.</p></section>
    <section className="merger-workspace" aria-label="Image merge workspace">
      <div className="merger-settings">
        <div className="merger-section-heading"><div><span className="panel-kicker">YOUR IMAGES</span><h2>{images.length} image{images.length === 1 ? '' : 's'} selected</h2></div><label className="merger-add-button"><ImagePlus size={16}/> Add images<input ref={pickerRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple aria-label="Add images to merge" onChange={(event: ChangeEvent<HTMLInputElement>) => { const files = Array.from(event.target.files || []); event.target.value = ''; void addImages(files) }}/></label></div>
        <div className="merger-image-list">{images.map(({ file, image }, index) => <div className="merger-image-item" key={`${file.name}-${index}`}><img src={image.src} alt={`Selected image ${index + 1}`}/><span><strong>{file.name}</strong><small>{image.naturalWidth} × {image.naturalHeight} px · {formatBytes(file.size)}</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeImage(index)}><X size={16}/></button></div>)}</div>
        <div className="merger-controls">
          <fieldset><legend>Arrangement</legend><label><input type="radio" name="merge-layout" checked={layout === 'vertical'} onChange={() => { setLayout('vertical'); clearOutput() }}/> Stack vertically</label><label><input type="radio" name="merge-layout" checked={layout === 'horizontal'} onChange={() => { setLayout('horizontal'); clearOutput() }}/> Place side by side</label></fieldset>
          <label className="merger-range">Space between images <span>{spacing} px</span><input type="range" min="0" max="500" value={spacing} onChange={event => { setSpacing(Number(event.target.value)); clearOutput() }}/></label>
          <div className="merger-format-row"><label>Save as<select value={format} onChange={event => { setFormat(event.target.value); clearOutput() }}><option value="application/pdf">PDF (default)</option><option value={DOCX_MIME}>Word document (DOCX)</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label></div>
          <p className="merger-hint">Images are combined on your device. Large results may be scaled down to fit your browser.</p>
          <button className="primary-button" type="button" onClick={() => void createPreview()} disabled={busy || images.length < 2}>{busy ? 'Preparing preview…' : 'Create preview'}</button>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
        </div>
      </div>
      <div className="merger-preview-panel" aria-live="polite"><span className="panel-kicker">PREVIEW</span>{output ? <><div className="merger-output-frame"><img src={output.previewUrl} alt="Merged image preview"/></div><div className="merger-output-meta"><strong>{output.width} × {output.height} px · {formatBytes(output.blob.size)}</strong><span>{output.filename}</span></div><button className="merger-download-button" type="button" onClick={download}><ArrowDownToLine size={18}/> Download merged image</button></> : <div className="merger-preview-empty"><ImagePlus size={30}/><strong>Your combined image will appear here</strong><span>Select an arrangement, then create a preview.</span></div>}</div>
    </section>
  </main>
}
