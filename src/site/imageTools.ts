export type Output = { url: string; blob: Blob; width: number; height: number; quality: number; mime: string }
export function formatBytes(bytes: number) { return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB` }
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), image = new Image()
    // Keep the source URL alive while the editor uses image.src for previews.
    image.onload = () => resolve(image)
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Your browser could not open this image. Try JPG, PNG, GIF, WebP, or SVG. TIFF, PSD, HEIC, and RAW files need browser support.')) }
    image.src = url
  })
}
function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Your browser could not export this image. Try another format.')), type, quality))
}
export async function renderImage(image: HTMLImageElement, width: number, height: number, mime = 'image/jpeg', quality = .9, crop?: { x: number; y: number; width: number; height: number }): Promise<Output> {
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Your browser could not start the image editor.')
  if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  if (crop) ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height)
  else ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const blob = await canvasBlob(canvas, mime, quality)
  return { url: URL.createObjectURL(blob), blob, width: canvas.width, height: canvas.height, quality, mime: blob.type || mime }
}
export async function compressImage(image: HTMLImageElement, targetBytes: number, onProgress?: (progress: number) => void): Promise<Output & { reached: boolean }> {
  let scale = Math.min(1, Math.sqrt(16_000_000 / (image.naturalWidth * image.naturalHeight)))
  let best: Output | null = null
  for (let dimensionTry = 0; dimensionTry < 7; dimensionTry++) {
    let low = .12, high = .94
    for (let attempt = 0; attempt < 8; attempt++) {
      onProgress?.(Math.min(96, Math.round((dimensionTry * 8 + attempt + 1) / 56 * 96)))
      const quality = (low + high) / 2
      const result = await renderImage(image, image.naturalWidth * scale, image.naturalHeight * scale, 'image/jpeg', quality)
      if (!best || (result.blob.size <= targetBytes && result.blob.size > best.blob.size) || (best.blob.size > targetBytes && result.blob.size < best.blob.size)) {
        if (best) URL.revokeObjectURL(best.url); best = result
      } else URL.revokeObjectURL(result.url)
      if (result.blob.size > targetBytes) high = quality; else low = quality
    }
    if (best && best.blob.size <= targetBytes) break
    scale *= .82
  }
  if (!best) throw new Error('Could not create a compressed image. Try a smaller source image.')
  onProgress?.(100)
  return { ...best, reached: best.blob.size <= targetBytes }
}
