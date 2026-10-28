import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowRight, Check, FileImage, Image as ImageIcon, ShieldCheck, Sparkles } from 'lucide-react'
import { compressImage, formatBytes, loadImage, renderImage, type Output } from './imageTools'
import PhotoEditor from './PhotoEditor'
import ImageMerger from './ImageMerger'
import UploadZone from './UploadZone'

type Tool = 'resize' | 'compress' | 'convert' | 'edit' | 'merge'
const tools: { id: Tool; title: string; path: string }[] = [
  { id: 'compress', title: 'Image compressor', path: '/image-compressor' },
  { id: 'resize', title: 'Image resize', path: '/image-resizer' },
  { id: 'convert', title: 'Image converter', path: '/image-converter' },
  { id: 'edit', title: 'Photo editor', path: '/photo-editor' },
  { id: 'merge', title: 'Image merger', path: '/image-merger' },
]
const content: Record<Tool, { title: string; subtitle: string; heading: string; description: string }> = {
  resize: { title: 'Resize an Image Online | FreeImageTools', subtitle: 'Set an image width and height, preview the result, and download it. You can resize photos or signatures.', heading: 'Resize an image', description: 'Set a width and height for a photo or signature. Keep them linked to preserve its shape.' },
  compress: { title: 'Compress an Image to a KB Size | FreeImageTools', subtitle: 'Choose a maximum file size and preview a smaller image before downloading.', heading: 'Compress an image', description: 'Choose a maximum size. We’ll shrink the file and show you the result.' },
  convert: { title: 'Convert an Image Online | FreeImageTools', subtitle: 'Convert an image to JPG, PNG, or WebP in your browser. Preview the result before downloading.', heading: 'Convert an image', description: 'Choose an output format, preview your image, and download the converted file.' },
  edit: { title: 'Photo Editor Online | FreeImageTools', subtitle: 'Edit photos in your browser with filters, crop, text, shapes, stickers, and frames.', heading: 'Photo editor', description: 'Edit your image, then save it as JPG, PNG, or WebP.' },
  merge: { title: 'Merge Images Online | FreeImageTools', subtitle: 'Combine images vertically or side by side in your browser, preview the result, and download it.', heading: 'Merge images', description: 'Combine two or more images into one file in your browser.' },
}

function getTool(path: string): Tool { return path.includes('compress') ? 'compress' : path.includes('convert') ? 'convert' : path.includes('photo-editor') ? 'edit' : path.includes('image-merger') ? 'merge' : 'resize' }
function App() {
  const location = useLocation(), navigate = useNavigate(), isLegacyPath = location.pathname === '/' || location.pathname === '/signature-resizer', tool = getTool(location.pathname)
  const [file, setFile] = useState<File | null>(null), [image, setImage] = useState<HTMLImageElement | null>(null), [output, setOutput] = useState<Output | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [downloaded, setDownloaded] = useState(false)
  const [width, setWidth] = useState(600), [height, setHeight] = useState(800), [locked, setLocked] = useState(true), [target, setTarget] = useState('50'), [custom, setCustom] = useState(''), [convertTo, setConvertTo] = useState('image/jpeg'), [progress, setProgress] = useState(0)
  const input = useRef<HTMLInputElement>(null), sourceUrl = useRef<string | null>(null)
  useEffect(() => {
    const title = content[tool].title
    const description = content[tool].subtitle
    const canonicalPath = isLegacyPath ? '/image-resizer' : location.pathname
    document.title = title
    for (const [selector, value] of [['meta[name="description"]', description], ['meta[property="og:title"]', title], ['meta[property="og:description"]', description], ['meta[property="og:url"]', `https://formready.tools${canonicalPath}`], ['meta[name="twitter:title"]', title], ['meta[name="twitter:description"]', description]] as const) document.querySelector(selector)?.setAttribute('content', value)
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical) }
    canonical.href = `https://formready.tools${canonicalPath}`
  }, [tool, isLegacyPath, location.pathname])
  useEffect(() => () => { if (output) URL.revokeObjectURL(output.url) }, [output])
  useEffect(() => () => { if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current) }, [])
  function chooseTool(next: Tool) {
    if (next === tool) return
    reset()
    navigate(tools.find(t => t.id === next)!.path)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function goHome() { reset(); navigate('/image-resizer'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function reset() { if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); sourceUrl.current = null; setFile(null); setImage(null); setOutput(null); setError(''); setDownloaded(false); setProgress(0); if (input.current) input.current.value = '' }
  function openPicker() { if (input.current) { input.current.value = ''; input.current.click() } }
  function clearPreview() { setOutput(null); setDownloaded(false); setError('') }
  async function pick(file?: File) {
    if (!file) return
    setError(''); setDownloaded(false); setOutput(null)
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    const standardExtensions = ['jpg', 'jpeg', 'png', 'webp']
    const converterExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'tif', 'tiff', 'psd', 'heic', 'heif', 'raw', 'cr2', 'rw2', 'nef', 'arw', 'sr2', 'orf', 'pef', 'raf', 'dng']
    const standardTypes = ['image/jpeg', 'image/png', 'image/webp']
    const converterTypes = [...standardTypes, 'image/gif', 'image/svg+xml', 'image/tiff', 'image/heic', 'image/heif']
    const acceptedExtensions = tool === 'convert' ? converterExtensions : standardExtensions
    const acceptedTypes = tool === 'convert' ? converterTypes : standardTypes
    if (!acceptedTypes.includes(file.type) && !acceptedExtensions.includes(extension)) { setError(tool === 'convert' ? 'Choose a supported image file such as JPG, PNG, GIF, WebP, SVG, TIFF, PSD, HEIC, or RAW.' : 'This format isn’t supported here. Please choose a JPG, PNG, or WebP image.'); return }
    if (file.size > 30 * 1024 * 1024) { setError('This image is over 30 MB and may be too large for a smooth edit. Try a smaller copy.'); return }
    if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current)
    sourceUrl.current = null
    setBusy(true); setFile(file); setImage(null)
    try { const loaded = await loadImage(file); sourceUrl.current = loaded.src; if (loaded.naturalWidth * loaded.naturalHeight > 50_000_000) throw new Error('This image has more than 50 megapixels. Try a smaller copy so your device can edit it smoothly.'); const nextWidth = Math.min(loaded.naturalWidth, 1200); setImage(loaded); setWidth(nextWidth); setHeight(Math.max(1, Math.round(nextWidth * loaded.naturalHeight / loaded.naturalWidth))); setLocked(true) }
    catch (e) { if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); sourceUrl.current = null; setFile(null); setImage(null); setError(e instanceof Error ? e.message : 'Could not open this image.') }
    finally { setBusy(false) }
  }
  async function process() {
    if (!image) return
    setBusy(true); setError(''); setDownloaded(false); setOutput(null)
    try {
      let result: Output
      if (tool === 'compress') { const bytes = Number(custom || target) * 1024; if (!Number.isFinite(bytes) || bytes < 1024) throw new Error('Enter a file size of at least 1 KB.'); if (file && file.size <= bytes) result = { url: URL.createObjectURL(file), blob: file, width: image.naturalWidth, height: image.naturalHeight, quality: 1, mime: file.type }; else { setProgress(1); result = await compressImage(image, bytes, setProgress) } if ('reached' in result && !result.reached) setError(`Closest achievable result generated: ${result.width} × ${result.height} pixels. Further compression would significantly reduce image quality.`) }
      else if (tool === 'resize') {
        if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 10000 || height > 10000 || width * height > 50_000_000) throw new Error('Choose dimensions up to 10,000 pixels per side and 50 megapixels total.')
        result = await renderImage(image, width, height, file?.type === 'image/png' ? 'image/png' : 'image/jpeg', .92)
      } else result = await renderImage(image, image.naturalWidth, image.naturalHeight, convertTo, .92)
      setOutput(result)
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Try again.') }
    finally { setBusy(false) }
  }
  function updateWidth(value: number) { clearPreview(); value = Math.min(10000, Math.max(1, value)); setWidth(value); if (locked && image) setHeight(Math.min(10000, Math.max(1, Math.round(value * image.naturalHeight / image.naturalWidth)))) }
  function updateHeight(value: number) { clearPreview(); value = Math.min(10000, Math.max(1, value)); setHeight(value); if (locked && image) setWidth(Math.min(10000, Math.max(1, Math.round(value * image.naturalWidth / image.naturalHeight)))) }
  const typeLabel = (mime: string) => mime === 'image/png' ? 'PNG' : mime === 'image/webp' ? 'WebP' : 'JPG'
  const outputExtension = output?.mime === 'image/png' ? 'png' : output?.mime === 'image/webp' ? 'webp' : 'jpg'
  const downloadName = `${file?.name.replace(/\.[^.]+$/, '') || 'freeimagetools-image'}-${tool === 'compress' ? 'compressed' : tool === 'convert' ? 'converted' : 'resized'}.${outputExtension}`
  const download = () => { if (!output) return; const a = document.createElement('a'); a.href = output.url; a.download = downloadName; document.body.append(a); a.click(); a.remove(); setDownloaded(true) }
  const data = content[tool]
  if (isLegacyPath) return <Navigate to="/image-resizer" replace/>
  return <>
    <SeoSchema tool={tool}/>
    <Header tool={tool} onHome={goHome} onChoose={chooseTool}/>
    {tool === 'edit' ? <PhotoEditor/> : tool === 'merge' ? <ImageMerger/> : <main className={`tool-page ${file ? 'has-file' : ''} ${output ? 'has-output' : ''}`}>
      <section className="hero tool-hero"><div className="eyebrow">{tool === 'resize' ? 'IMAGE RESIZE' : tool === 'compress' ? 'IMAGE COMPRESSOR' : 'IMAGE CONVERTER'}</div><h1>{data.heading}<span>.</span></h1><p>{data.description}</p></section>
      {file && <StepProgress active={downloaded ? 4 : output ? 3 : 2} tool={tool}/>}
      <motion.section className={`workspace ${file ? 'workspace-uploaded' : 'workspace-upload-only'}`} aria-label="Image editor" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .38, ease: 'easeOut' }}>
        {!file ? <div className="upload-start-card">
          <UploadZone formats={tool === 'convert' ? 'JPG, PNG, GIF, WebP, SVG · other formats depend on your browser' : 'JPG, PNG, or WebP'} busy={busy} onChoose={files => void pick(files[0])} onBrowse={openPicker}/>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
        </div> : <div className="uploaded-workspace">
          <div className="uploaded-top">
            <section className="original-panel" aria-label="Original image">
              <div className="panel-heading"><div><span className="panel-kicker">ORIGINAL</span><span className="original-meta">{image ? `${image.naturalWidth} × ${image.naturalHeight} px · ${formatBytes(file.size)}` : 'Opening image…'}</span></div><button type="button" className="choose-another" onClick={openPicker} disabled={busy}>Choose another</button></div>
              <div className="uploaded-image-frame">{image ? <img src={image.src} alt="Original image preview"/> : <span className="spinner" aria-label="Opening image"/>}</div>
            </section>
            <section className="settings-panel" aria-label="Image settings">
              <span className="panel-kicker">SETTINGS</span>
              <h2>{tool === 'compress' ? 'Set file size' : tool === 'convert' ? 'Choose output format' : 'Set output dimensions'}</h2>
              {tool === 'compress' ? <div className="control-block"><label htmlFor="target">Maximum file size</label><div className="target-row"><select id="target" value={target} onChange={e => { clearPreview(); setTarget(e.target.value); setCustom('') }}><option value="20">20 KB</option><option value="50">50 KB</option><option value="100">100 KB</option><option value="200">200 KB</option><option value="500">500 KB</option><option value="custom">Custom size</option></select><label className="custom-input"><input aria-label="Custom maximum size in KB" type="number" min="1" placeholder="Custom KB" value={custom} onChange={e => { clearPreview(); setCustom(e.target.value); setTarget('custom') }}/><span>KB</span></label></div><p className="field-hint">We adjust quality and image size to get close to your limit.</p></div> : tool === 'convert' ? <div className="control-block converter-control"><label htmlFor="convert-to">Convert to</label><select id="convert-to" value={convertTo} onChange={e => { clearPreview(); setConvertTo(e.target.value) }}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select><p className="field-hint">TIFF, PSD, HEIC, and RAW files work only if your browser can open them.</p></div> : <>
                <div className="dimension-row"><label>Width <span>(px)</span><input type="number" min="1" max="10000" value={width} onChange={e => updateWidth(Number(e.target.value))}/></label><label>Height <span>(px)</span><input type="number" min="1" max="10000" value={height} onChange={e => updateHeight(Number(e.target.value))}/></label></div>
                <label className="ratio-checkbox"><input type="checkbox" checked={locked} onChange={e => { clearPreview(); setLocked(e.target.checked) }}/> <span>Preserve aspect ratio</span> <small>(recommended)</small></label>
              </>}
              <button className="primary-button" onClick={() => void process()} disabled={busy || !image}>{busy ? <><span className="spinner"/> Working on your image…</> : <>{output ? 'Update preview' : 'Create preview'} <ArrowRight size={17}/></>}</button>
              {busy && tool === 'compress' && <ProgressIndicator progress={progress}/>}
              {error && <div className="notice notice-error" role="alert">{error}</div>}
              {!error && !output && !busy && <p className="settings-hint">{tool === 'convert' ? 'Some formats may not open in every browser.' : 'Your original image stays unchanged.'}</p>}
            </section>
          </div>
          <section className="result-panel" aria-label="Processed image preview" aria-live="polite">
            <div className={`result-image ${output ? '' : 'result-image-empty'}`}>{output ? <img src={output.url} alt="Processed image preview"/> : <div className="result-empty-copy"><span className="placeholder-art"><ImageIcon size={24}/><span className="placeholder-spark"><Sparkles size={13}/></span></span><strong>Preview appears here</strong><span>Create a preview to check your image.</span></div>}</div>
            <div className="result-summary">
              {output ? <><span className="result-ready"><Check size={14}/>{downloaded ? 'Downloaded' : 'Preview ready'}</span><h2>Your result</h2><div className="result-stats"><div><span>Dimensions</span><strong>{output.width} × {output.height} px</strong></div><div><span>File size</span><strong>{formatBytes(output.blob.size)} · {typeLabel(output.mime)}</strong></div></div>{tool === 'compress' && <p className="quality-note">Image quality: {output.blob === file ? 'Original' : `${Math.round(output.quality * 100)}%`}</p>}<DownloadButton filename={downloadName} onDownload={download}/><button className="inline-link start-over-link" onClick={reset}>Start over with another image</button></> : <><span className="panel-kicker">PREVIEW</span><h2>Your result</h2><p>{tool === 'convert' ? 'Choose a format and create a preview of the converted image.' : 'Create a preview to check the size and image quality before downloading.'}</p></>}
            </div>
          </section>
        </div>}
        <input ref={input} type="file" accept={tool === 'convert' ? 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/tiff,image/heic,image/heif,.psd,.raw,.cr2,.rw2,.nef,.arw,.sr2,.orf,.pef,.raf,.dng' : 'image/jpeg,image/png,image/webp'} className="sr-only" aria-label={file ? 'Choose another image' : 'Choose an image'} onChange={e => void pick(e.target.files?.[0])}/>
      </motion.section>
    </main>}
  </>
}
export default App

function Header({ tool, onHome, onChoose }: { tool: Tool; onHome: () => void; onChoose: (tool: Tool) => void }) {
  return <header className="topbar topbar-tool-page"><a className="brand" href="/image-resizer" onClick={e => { e.preventDefault(); onHome() }}><span className="brand-icon"><FileImage size={20}/></span><span>FreeImageTools</span></a><nav aria-label="Image tools">{tools.map(t => <a key={t.id} href={t.path} className={tool === t.id ? 'nav-link active' : 'nav-link'} aria-current={tool === t.id ? 'page' : undefined} onClick={e => { e.preventDefault(); onChoose(t.id) }}>{t.title}</a>)}</nav><details className="privacy-disclosure"><summary className="local-pill"><ShieldCheck size={15}/> Private · Browser only</summary><div className="privacy-popover"><strong>Your images stay on your device</strong><p>Image processing and previews happen in this browser. This tool does not upload or store your image files on a server.</p></div></details></header>
}

function StepProgress({ active, tool }: { active: number; tool: Tool }) {
  const steps = ['Choose image', tool === 'convert' ? 'Choose format' : 'Set size', 'Preview', 'Download']
  return <nav className="signature-progress" aria-label="Image preparation steps">{steps.map((step, index) => <div className={`signature-step ${active > index + 1 ? 'complete' : active === index + 1 ? 'current' : ''}`} key={step}><span>{active > index + 1 ? <Check size={14}/> : index + 1}</span><small>{step}</small>{index < steps.length - 1 && <i/>}</div>)}</nav>
}

function ProgressIndicator({ progress }: { progress: number }) {
  return <div className="progress-wrap" role="status"><div className="progress-label"><span>Finding a good quality and size balance</span><span>{progress}%</span></div><progress max="100" value={progress} aria-label="Compression progress"/></div>
}

function DownloadButton({ filename, onDownload }: { filename: string; onDownload: () => void }) {
  return <button className="download-button" onClick={onDownload}><ArrowDown size={17}/><span><strong>Download image</strong><small>{filename}</small></span></button>
}

function SeoSchema({ tool }: { tool: Tool }) {
  const jsonLd = { '@context': 'https://schema.org', '@type': 'WebApplication', name: content[tool].title.split(' | ')[0], url: `https://formready.tools${tools.find(t => t.id === tool)?.path}`, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: content[tool].subtitle }
  const serialized = JSON.stringify(jsonLd)
  useEffect(() => {
    let script = document.querySelector<HTMLScriptElement>('#structured-data')
    if (!script) { script = document.createElement('script'); script.id = 'structured-data'; script.type = 'application/ld+json'; document.head.append(script) }
    script.textContent = serialized
  }, [serialized])
  return null
}

