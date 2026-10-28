import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import { ArrowDownToLine, Crop, Frame, ImagePlus, Pencil, RotateCcw, Shapes, SlidersHorizontal, Smile, Square, Type, Undo2, Upload, WandSparkles } from 'lucide-react'
import { loadImage } from './imageTools'
import UploadZone from './UploadZone'

type EditorTool = 'filter' | 'resize' | 'crop' | 'transform' | 'draw' | 'text' | 'shapes' | 'stickers' | 'frame' | 'corners' | 'background'
type Stroke = { points: { x: number; y: number }[]; color: string; size: number }
type SourceImage = { file: File; image: HTMLImageElement }
type EditorSnapshot = {
  width: number; height: number; keepRatio: boolean; crop: { left: number; top: number; width: number; height: number }
  rotation: number; flipX: boolean; flipY: boolean; brightness: number; contrast: number; saturation: number
  strokes: Stroke[]; text: string; textColor: string; textSize: number; shape: string; shapeColor: string
  sticker: string; frame: string; cornerRadius: number; background: string; customBackground: string
}

const editorTools: { id: EditorTool; label: string; icon: typeof SlidersHorizontal }[] = [
  { id: 'filter', label: 'Filter & light', icon: SlidersHorizontal },
  { id: 'resize', label: 'Resize', icon: Square },
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'transform', label: 'Transform', icon: RotateCcw },
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'shapes', label: 'Shapes', icon: Shapes },
  { id: 'stickers', label: 'Stickers', icon: Smile },
  { id: 'frame', label: 'Frame', icon: Frame },
  { id: 'corners', label: 'Corners', icon: Square },
  { id: 'background', label: 'Background', icon: WandSparkles },
]

export default function PhotoEditor() {
  const [source, setSource] = useState<SourceImage | null>(null)
  const [activeTool, setActiveTool] = useState<EditorTool>('filter')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [format, setFormat] = useState('image/jpeg')
  const [zoom, setZoom] = useState(100)
  const [width, setWidth] = useState(900)
  const [height, setHeight] = useState(600)
  const [keepRatio, setKeepRatio] = useState(true)
  const [crop, setCrop] = useState({ left: 0, top: 0, width: 100, height: 100 })
  const [cropDraft, setCropDraft] = useState({ left: 0, top: 0, width: 100, height: 100 })
  const [rotation, setRotation] = useState(0)
  const [flipX, setFlipX] = useState(false)
  const [flipY, setFlipY] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [brushColor, setBrushColor] = useState('#18764f')
  const [brushSize, setBrushSize] = useState(8)
  const [text, setText] = useState('')
  const [textColor, setTextColor] = useState('#ffffff')
  const [textSize, setTextSize] = useState(48)
  const [shape, setShape] = useState('none')
  const [shapeColor, setShapeColor] = useState('#16734e')
  const [sticker, setSticker] = useState('')
  const [frame, setFrame] = useState('none')
  const [cornerRadius, setCornerRadius] = useState(0)
  const [background, setBackground] = useState('white')
  const [customBackground, setCustomBackground] = useState('#ffffff')
  const [canUndo, setCanUndo] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const sourceUrl = useRef<string | null>(null)
  const drawingIndex = useRef<number | null>(null)
  const cropDrag = useRef<{ x: number; y: number; base: typeof crop } | null>(null)
  const historySource = useRef<SourceImage | null>(null)
  const currentSnapshot = useRef<EditorSnapshot | null>(null)
  const pendingSnapshot = useRef<EditorSnapshot | null>(null)
  const undoHistory = useRef<EditorSnapshot[]>([])
  const historyTimer = useRef<number | null>(null)
  const snapshot: EditorSnapshot = { width, height, keepRatio, crop, rotation, flipX, flipY, brightness, contrast, saturation, strokes, text, textColor, textSize, shape, shapeColor, sticker, frame, cornerRadius, background, customBackground }

  useEffect(() => () => {
    if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current)
  }, [])

  useEffect(() => {
    if (historySource.current !== source) {
      if (historyTimer.current !== null) window.clearTimeout(historyTimer.current)
      historySource.current = source
      currentSnapshot.current = source ? snapshot : null
      pendingSnapshot.current = null
      undoHistory.current = []
      setCanUndo(false)
      return
    }
    if (!source) return
    const previous = currentSnapshot.current
    if (!previous) { currentSnapshot.current = snapshot; return }
    if (JSON.stringify(previous) === JSON.stringify(snapshot)) return
    if (!pendingSnapshot.current) pendingSnapshot.current = previous
    setCanUndo(true)
    if (historyTimer.current !== null) window.clearTimeout(historyTimer.current)
    historyTimer.current = window.setTimeout(() => {
      const before = pendingSnapshot.current
      if (before) undoHistory.current = [...undoHistory.current, before].slice(-50)
      currentSnapshot.current = snapshot
      pendingSnapshot.current = null
      historyTimer.current = null
      setCanUndo(undoHistory.current.length > 0)
    }, 250)
    return () => { if (historyTimer.current !== null) window.clearTimeout(historyTimer.current) }
  }, [source, width, height, keepRatio, crop, rotation, flipX, flipY, brightness, contrast, saturation, strokes, text, textColor, textSize, shape, shapeColor, sticker, frame, cornerRadius, background, customBackground])

  useEffect(() => {
    if (!source || !canvasRef.current) return
    const canvas = canvasRef.current
    const cropX = Math.min(99, Math.max(0, crop.left))
    const cropY = Math.min(99, Math.max(0, crop.top))
    const cropW = Math.max(1, Math.min(100 - cropX, crop.width))
    const cropH = Math.max(1, Math.min(100 - cropY, crop.height))
    const sourceX = source.image.naturalWidth * cropX / 100
    const sourceY = source.image.naturalHeight * cropY / 100
    const sourceW = source.image.naturalWidth * cropW / 100
    const sourceH = source.image.naturalHeight * cropH / 100
    const baseWidth = Math.max(1, Math.min(10000, Math.round(width)))
    const baseHeight = Math.max(1, Math.min(10000, Math.round(height)))
    const sideways = Math.abs(rotation % 180) === 90
    const canvasWidth = sideways ? baseHeight : baseWidth
    const canvasHeight = sideways ? baseWidth : baseHeight
    if (canvasWidth * canvasHeight > 50_000_000) return
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    if (background !== 'transparent') {
      ctx.fillStyle = background === 'custom' ? customBackground : background
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)
    }
    ctx.save()
    ctx.translate(canvasWidth / 2, canvasHeight / 2)
    ctx.rotate(rotation * Math.PI / 180)
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1)
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
    ctx.drawImage(source.image, sourceX, sourceY, sourceW, sourceH, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight)
    ctx.restore()
    ctx.filter = 'none'


    for (const stroke of strokes) {
      if (stroke.points.length < 1) continue
      ctx.beginPath()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = Math.max(1, stroke.size * canvasWidth / 900)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.moveTo(stroke.points[0].x * canvasWidth, stroke.points[0].y * canvasHeight)
      for (const point of stroke.points.slice(1)) ctx.lineTo(point.x * canvasWidth, point.y * canvasHeight)
      ctx.stroke()
    }

    if (shape !== 'none') {
      const boxW = canvasWidth * .36, boxH = canvasHeight * .28
      ctx.save()
      ctx.strokeStyle = shapeColor
      ctx.fillStyle = `${shapeColor}22`
      ctx.lineWidth = Math.max(2, canvasWidth / 150)
      if (shape === 'circle') { ctx.beginPath(); ctx.ellipse(canvasWidth / 2, canvasHeight / 2, boxW / 2, boxH / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
      else if (shape === 'line') { ctx.beginPath(); ctx.moveTo(canvasWidth * .32, canvasHeight * .5); ctx.lineTo(canvasWidth * .68, canvasHeight * .5); ctx.stroke() }
      else { ctx.fillRect((canvasWidth - boxW) / 2, (canvasHeight - boxH) / 2, boxW, boxH); ctx.strokeRect((canvasWidth - boxW) / 2, (canvasHeight - boxH) / 2, boxW, boxH) }
      ctx.restore()
    }

    if (sticker) {
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `${Math.round(Math.min(canvasWidth, canvasHeight) * .18)}px system-ui, sans-serif`
      ctx.fillText(sticker, canvasWidth / 2, canvasHeight / 2)
      ctx.restore()
    }
    if (text.trim()) {
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = textColor
      ctx.font = `700 ${Math.max(12, Math.round(textSize * canvasWidth / 900))}px system-ui, sans-serif`
      ctx.shadowColor = '#0008'
      ctx.shadowBlur = 4
      ctx.fillText(text, canvasWidth / 2, canvasHeight * .85, canvasWidth * .88)
      ctx.restore()
    }
    if (frame !== 'none') {
      const frameColor = frame === 'dark' ? '#14221b' : frame === 'green' ? '#16734e' : '#ffffff'
      ctx.save()
      ctx.strokeStyle = frameColor
      ctx.lineWidth = Math.max(8, Math.min(canvasWidth, canvasHeight) * .035)
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, canvasWidth - ctx.lineWidth, canvasHeight - ctx.lineWidth)
      ctx.restore()
    }
    if (cornerRadius > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-in'
      roundedRect(ctx, 0, 0, canvasWidth, canvasHeight, Math.min(canvasWidth, canvasHeight) * cornerRadius / 200)
      ctx.fill()
      ctx.restore()
    }
  }, [source, width, height, crop, rotation, flipX, flipY, brightness, contrast, saturation, strokes, shape, shapeColor, sticker, text, textColor, textSize, frame, cornerRadius, background, customBackground])

  async function openImage(event: ChangeEvent<HTMLInputElement> | File) {
    const file = event instanceof File ? event : event.target.files?.[0]
    if (!(event instanceof File)) event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type)) { setError('Choose a JPG, PNG, WebP, GIF, or SVG image that your browser can open.'); return }
    if (file.size > 30 * 1024 * 1024) { setError('This image is over 30 MB. Choose a smaller image.'); return }
    setError('')
    setBusy(true)
    try {
      const image = await loadImage(file)
      if (image.naturalWidth * image.naturalHeight > 50_000_000) { URL.revokeObjectURL(image.src); throw new Error('This image is too large to edit smoothly. Choose a smaller image.') }
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current)
      sourceUrl.current = image.src
      setSource({ file, image })
      const nextWidth = Math.min(1200, image.naturalWidth)
      setWidth(nextWidth)
      setHeight(Math.max(1, Math.round(nextWidth * image.naturalHeight / image.naturalWidth)))
      setCrop({ left: 0, top: 0, width: 100, height: 100 })
      setStrokes([])
      setRotation(0)
      setFlipX(false)
      setFlipY(false)
      setShape('none')
      setSticker('')
      setText('')
      setFrame('none')
      setCornerRadius(0)
      setSaved(false)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not open this image.') }
    finally { setBusy(false) }
  }

  function resetEdits() {
    if (!source) return
    const nextWidth = Math.min(1200, source.image.naturalWidth)
    setWidth(nextWidth); setHeight(Math.max(1, Math.round(nextWidth * source.image.naturalHeight / source.image.naturalWidth)))
    setKeepRatio(true); setCrop({ left: 0, top: 0, width: 100, height: 100 }); setRotation(0); setFlipX(false); setFlipY(false)
    setBrightness(100); setContrast(100); setSaturation(100); setStrokes([]); setText(''); setShape('none'); setSticker(''); setFrame('none'); setCornerRadius(0); setBackground('white'); setSaved(false)
  }

  function undoEdits() {
    if (!source) return
    let previous: EditorSnapshot | undefined
    if (pendingSnapshot.current) {
      previous = pendingSnapshot.current
      pendingSnapshot.current = null
      if (historyTimer.current !== null) window.clearTimeout(historyTimer.current)
      historyTimer.current = null
    } else previous = undoHistory.current.pop()
    if (!previous) return
    currentSnapshot.current = previous
    setCanUndo(undoHistory.current.length > 0)
    setWidth(previous.width); setHeight(previous.height); setKeepRatio(previous.keepRatio); setCrop(previous.crop)
    setRotation(previous.rotation); setFlipX(previous.flipX); setFlipY(previous.flipY)
    setBrightness(previous.brightness); setContrast(previous.contrast); setSaturation(previous.saturation)
    setStrokes(previous.strokes); setText(previous.text); setTextColor(previous.textColor); setTextSize(previous.textSize)
    setShape(previous.shape); setShapeColor(previous.shapeColor); setSticker(previous.sticker); setFrame(previous.frame)
    setCornerRadius(previous.cornerRadius); setBackground(previous.background); setCustomBackground(previous.customBackground)
    setSaved(false); setError('')
  }

  function drawStart(event: PointerEvent<HTMLCanvasElement>) {
    if (activeTool !== 'draw') return
    const point = canvasPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingIndex.current = strokes.length
    setStrokes(current => [...current, { points: [point], color: brushColor, size: brushSize }])
    setSaved(false)
  }
  function drawMove(event: PointerEvent<HTMLCanvasElement>) {
    if (activeTool !== 'draw' || drawingIndex.current === null || (event.buttons & 1) !== 1) return
    const point = canvasPoint(event)
    const index = drawingIndex.current
    setStrokes(current => current.map((stroke, i) => i === index ? { ...stroke, points: [...stroke.points, point] } : stroke))
    setSaved(false)
  }
  function canvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) }
  }

  async function saveImage() {
    const canvas = canvasRef.current
    if (!canvas) return
    setBusy(true); setError(''); setSaved(false)
    try {
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = canvas.width; exportCanvas.height = canvas.height
      const ctx = exportCanvas.getContext('2d')
      if (!ctx) throw new Error('Your browser could not prepare the download.')
      if (format === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height) }
      ctx.drawImage(canvas, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) => exportCanvas.toBlob(result => result ? resolve(result) : reject(new Error('Your browser could not save this format.')), format, .92))
      const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      const name = `${source?.file.name.replace(/\.[^.]+$/, '') || 'photo'}-edited.${extension}`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setSaved(true)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save this image.') }
    finally { setBusy(false) }
  }

  const ratio = source ? source.image.naturalWidth / source.image.naturalHeight : 1
  function setEditWidth(value: number) {
    const nextWidth = Math.max(1, Math.min(10000, value))
    const nextHeight = keepRatio && source ? Math.max(1, Math.min(10000, Math.round(nextWidth / ratio))) : height
    if (nextWidth * nextHeight > 50_000_000) { setError('Choose dimensions under 50 megapixels so your browser can edit the image smoothly.'); return }
    setWidth(nextWidth); if (keepRatio) setHeight(nextHeight); setSaved(false); setError('')
  }
  function setEditHeight(value: number) {
    const nextHeight = Math.max(1, Math.min(10000, value))
    const nextWidth = keepRatio && source ? Math.max(1, Math.min(10000, Math.round(nextHeight * ratio))) : width
    if (nextWidth * nextHeight > 50_000_000) { setError('Choose dimensions under 50 megapixels so your browser can edit the image smoothly.'); return }
    setHeight(nextHeight); if (keepRatio) setWidth(nextWidth); setSaved(false); setError('')
  }
  function updateCrop(key: keyof typeof crop, value: number) { setCrop(current => ({ ...current, [key]: Math.max(0, Math.min(key === 'width' || key === 'height' ? 100 : 95, value)) })); setSaved(false) }
  function cropPoint(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) }
  }
  function cropPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const point = cropPoint(event)
    cropDrag.current = { ...point, base: crop }
    event.currentTarget.setPointerCapture(event.pointerId)
    setCropDraft({ left: point.x * 100, top: point.y * 100, width: .1, height: .1 })
  }
  function cropPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!cropDrag.current) return
    const point = cropPoint(event), start = cropDrag.current
    setCropDraft({ left: Math.min(start.x, point.x) * 100, top: Math.min(start.y, point.y) * 100, width: Math.max(.1, Math.abs(point.x - start.x) * 100), height: Math.max(.1, Math.abs(point.y - start.y) * 100) })
  }
  function cropPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!cropDrag.current) return
    const point = cropPoint(event), start = cropDrag.current
    const selection = { left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }
    cropDrag.current = null
    if (selection.width < .01 || selection.height < .01) { setCropDraft({ left: 0, top: 0, width: 100, height: 100 }); return }
    setCrop({
      left: start.base.left + selection.left * start.base.width,
      top: start.base.top + selection.top * start.base.height,
      width: selection.width * start.base.width,
      height: selection.height * start.base.height,
    })
    setSaved(false)
    setActiveTool('filter')
  }

  if (!source) return <main className="tool-page">
    <section className="hero tool-hero"><div className="eyebrow">PHOTO EDITOR</div><h1>Edit an image<span>.</span></h1><p>Choose a photo to open the editing tools.</p></section>
    <section className="workspace workspace-upload-only" aria-label="Photo editor upload">
      <div className="upload-start-card">
        <UploadZone formats="JPG, PNG, WebP, GIF, or SVG" busy={busy} onChoose={files => { if (files[0]) void openImage(files[0]) }} onBrowse={() => uploadRef.current?.click()}/>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
      </div>
    </section>
    <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" className="sr-only" aria-label="Choose an image to edit" onChange={event => void openImage(event)}/>
  </main>

  return <main className="photo-editor-page">
    <div className="photo-editor-shell">
      <nav className="photo-editor-toolbar" aria-label="Photo editing tools">{editorTools.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeTool === id ? 'selected' : ''} aria-pressed={activeTool === id} disabled={!source} onClick={() => { setActiveTool(id); if (id === 'crop') setCropDraft({ left: 0, top: 0, width: 100, height: 100 }) }}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="photo-editor-layout">
        <section className="photo-canvas-area" aria-label="Image canvas">
          {source ? <div className="photo-canvas-stage">
            <div className="photo-canvas-wrap" style={{ width: `${zoom}%` }}><canvas ref={canvasRef} className={activeTool === 'draw' ? 'draw-enabled' : ''} onPointerDown={drawStart} onPointerMove={drawMove} onPointerUp={() => { drawingIndex.current = null }} onPointerCancel={() => { drawingIndex.current = null }} aria-label="Edited image preview"/>{activeTool === 'crop' && <div className="photo-crop-overlay" role="application" aria-label="Drag on the image to select a crop area" onPointerDown={cropPointerDown} onPointerMove={cropPointerMove} onPointerUp={cropPointerUp} onPointerCancel={() => { cropDrag.current = null }}><div className="photo-crop-selection" style={{ left: `${cropDraft.left}%`, top: `${cropDraft.top}%`, width: `${cropDraft.width}%`, height: `${cropDraft.height}%` }}/></div>}</div>
          </div> : <div className="photo-empty"><div className="upload-icon"><Upload size={22}/></div><strong>Open a photo to start editing</strong><span>JPG, PNG, WebP, GIF, or SVG · up to 30 MB</span><button className="photo-open-button" onClick={() => uploadRef.current?.click()}><ImagePlus size={18}/> Open image</button></div>}
        </section>
        <aside className="photo-editor-sidebar" aria-label="Editing controls">
          <div className="photo-sidebar-actions"><div className="photo-sidebar-file-actions"><button className="photo-open-button" onClick={() => uploadRef.current?.click()}><ImagePlus size={17}/> Open another</button>{source && <div className="photo-sidebar-history-actions"><button className="photo-secondary-button photo-undo-button" onClick={undoEdits} disabled={!canUndo} aria-label="Undo last edit"><Undo2 size={14}/> Undo</button><button className="photo-secondary-button photo-reset-inline" onClick={resetEdits}><RotateCcw size={14}/> Reset edits</button></div>}</div><div className="photo-sidebar-zoom-actions"><button className="photo-icon-button" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(25, value - 10))}>−</button><span>Zoom {zoom}%</span><button className="photo-icon-button" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(200, value + 10))}>+</button></div></div>
          {source ? <div className="photo-tool-controls">{activeTool === 'filter' && <><h2>Filter & light</h2><RangeControl label="Brightness" min={40} max={180} value={brightness} onChange={value => { setBrightness(value); setSaved(false) }}/><RangeControl label="Contrast" min={40} max={180} value={contrast} onChange={value => { setContrast(value); setSaved(false) }}/><RangeControl label="Saturation" min={0} max={200} value={saturation} onChange={value => { setSaturation(value); setSaved(false) }}/></>}
            {activeTool === 'resize' && <><h2>Resize</h2><div className="photo-dimensions"><label>Width (px)<input type="number" min="1" max="10000" value={width} onChange={e => setEditWidth(Number(e.target.value))}/></label><label>Height (px)<input type="number" min="1" max="10000" value={height} onChange={e => setEditHeight(Number(e.target.value))}/></label></div><label className="photo-check"><input type="checkbox" checked={keepRatio} onChange={e => setKeepRatio(e.target.checked)}/> Keep proportions</label><p className="photo-control-hint">Original: {source.image.naturalWidth} × {source.image.naturalHeight} px</p></>}
            {activeTool === 'crop' && <><h2>Crop</h2><p className="photo-control-hint">Drag across the image to select and apply a crop, or enter percentages below.</p><div className="photo-dimensions">{(['left', 'top', 'width', 'height'] as const).map(key => <label key={key}>{key[0].toUpperCase() + key.slice(1)} (%)<input type="number" min="0" max="100" value={crop[key]} onChange={e => updateCrop(key, Number(e.target.value))}/></label>)}</div><button className="photo-secondary-button" onClick={() => { setCrop({ left: 0, top: 0, width: 100, height: 100 }); setCropDraft({ left: 0, top: 0, width: 100, height: 100 }); setSaved(false) }}>Reset crop</button></>}
            {activeTool === 'transform' && <><h2>Transform</h2><div className="photo-control-buttons"><button onClick={() => { setRotation(value => (value + 270) % 360); setSaved(false) }}>Rotate left</button><button onClick={() => { setRotation(value => (value + 90) % 360); setSaved(false) }}>Rotate right</button><button onClick={() => { setFlipX(value => !value); setSaved(false) }}>Flip horizontal</button><button onClick={() => { setFlipY(value => !value); setSaved(false) }}>Flip vertical</button></div></>}
            {activeTool === 'draw' && <><h2>Draw</h2><label className="photo-color-control">Brush color<input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)}/></label><RangeControl label="Brush size" unit=" px" min={1} max={30} value={brushSize} onChange={setBrushSize}/><button className="photo-secondary-button" onClick={() => { setStrokes([]); setSaved(false) }}>Clear drawing</button><p className="photo-control-hint">Draw directly on the image with your mouse or finger.</p></>}
            {activeTool === 'text' && <><h2>Add text</h2><label className="photo-field-label">Text<input value={text} onChange={e => { setText(e.target.value); setSaved(false) }} placeholder="Type something" maxLength={80}/></label><label className="photo-color-control">Text color<input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}/></label><RangeControl label="Text size" unit=" px" min={16} max={120} value={textSize} onChange={setTextSize}/></>}
            {activeTool === 'shapes' && <><h2>Shapes</h2><label className="photo-field-label">Shape<select value={shape} onChange={e => { setShape(e.target.value); setSaved(false) }}><option value="none">None</option><option value="rectangle">Rectangle</option><option value="circle">Circle</option><option value="line">Line</option></select></label><label className="photo-color-control">Shape color<input type="color" value={shapeColor} onChange={e => setShapeColor(e.target.value)}/></label></>}
            {activeTool === 'stickers' && <><h2>Stickers</h2><div className="photo-sticker-list">{['', '⭐', '❤️', '😊', '✨', '👍', '🎉'].map(item => <button key={item || 'none'} className={sticker === item ? 'selected' : ''} onClick={() => { setSticker(item); setSaved(false) }}>{item || 'None'}</button>)}</div></>}
            {activeTool === 'frame' && <><h2>Frame</h2><label className="photo-field-label">Frame style<select value={frame} onChange={e => { setFrame(e.target.value); setSaved(false) }}><option value="none">No frame</option><option value="white">White</option><option value="dark">Dark</option><option value="green">Green</option></select></label></>}
            {activeTool === 'corners' && <><h2>Rounded corners</h2><RangeControl label="Corner roundness" min={0} max={45} value={cornerRadius} onChange={value => { setCornerRadius(value); setSaved(false) }}/><p className="photo-control-hint">Rounded corners are transparent in PNG and WebP. JPG uses a white background.</p></>}
            {activeTool === 'background' && <><h2>Background</h2><label className="photo-field-label">Background color<select value={background} onChange={e => { setBackground(e.target.value); setSaved(false) }}><option value="white">White</option><option value="#f1f4f2">Light gray</option><option value="#e7f1ff">Pale blue</option><option value="transparent">Transparent</option><option value="custom">Custom color</option></select></label>{background === 'custom' && <label className="photo-color-control">Custom color<input type="color" value={customBackground} onChange={e => setCustomBackground(e.target.value)}/></label>}</>}
          </div> : <div className="photo-no-image"><strong>Open an image to enable the tools.</strong><span>Your files stay in this browser.</span></div>}
          <div className="photo-save-area"><label htmlFor="photo-output-format">Save as</label><select id="photo-output-format" value={format} onChange={e => { setFormat(e.target.value); setSaved(false) }}><option value="image/jpeg">JPG (default)</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select><button className="photo-save-button" onClick={() => void saveImage()} disabled={!source || busy}><ArrowDownToLine size={20}/>{busy ? 'Working…' : 'Save image'}</button>{saved && <p className="photo-saved-message" role="status">Image saved to your downloads.</p>}{error && <p className="photo-error" role="alert">{error}</p>}</div>
        </aside>
      </div>
      <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" className="sr-only" aria-label="Open an image" onChange={event => void openImage(event)}/>
    </div>
  </main>
}

function RangeControl({ label, unit = '%', min, max, value, onChange }: { label: string; unit?: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return <label className="photo-range-control"><span>{label}<output>{value}{unit}</output></span><input type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))}/></label>
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}
