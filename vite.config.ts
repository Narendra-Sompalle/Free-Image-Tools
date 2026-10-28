import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const origin = 'https://formready.tools'
const pages = [
  { path: '/image-resizer', folder: '', title: 'Resize an Image Online | FreeImageTools', description: 'Set an image width and height, preview the result, and download it. You can resize photos or signatures.', name: 'Image Resize', type: 'WebApplication' },
  { path: '/image-resizer', folder: 'image-resizer', title: 'Resize an Image Online | FreeImageTools', description: 'Set an image width and height, preview the result, and download it. You can resize photos or signatures.', name: 'Image Resize', type: 'WebApplication' },
  { path: '/image-compressor', folder: 'image-compressor', title: 'Compress an Image to a KB Size | FreeImageTools', description: 'Choose a maximum file size and preview a smaller image before downloading.', name: 'Image Compressor', type: 'WebApplication' },
  { path: '/image-converter', folder: 'image-converter', title: 'Convert an Image Online | FreeImageTools', description: 'Convert an image to JPG, PNG, or WebP in your browser. Preview the result before downloading.', name: 'Image Converter', type: 'WebApplication' },
  { path: '/photo-editor', folder: 'photo-editor', title: 'Photo Editor Online | FreeImageTools', description: 'Edit photos in your browser with filters, crop, text, shapes, stickers, and frames.', name: 'Photo Editor', type: 'WebApplication' },
  { path: '/image-merger', folder: 'image-merger', title: 'Merge Images Online | FreeImageTools', description: 'Combine images vertically or side by side in your browser, preview the result, and download it.', name: 'Image Merger', type: 'WebApplication' },
]

function staticRouteMetadata(): Plugin {
  return {
    name: 'freeimagetools-static-route-metadata',
    closeBundle() {
      const dist = resolve(process.cwd(), 'dist')
      const template = readFileSync(resolve(dist, 'index.html'), 'utf8')
      for (const page of pages) {
        const url = `${origin}${page.path}`
        const schema = { '@context': 'https://schema.org', '@type': page.type, name: page.name, url, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: page.description }
        let html = template
          .replace(/<title>.*?<\/title>/, `<title>${page.title}</title>`)
          .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${page.description}" />`)
          .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${page.title}" />`)
          .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${page.description}" />`)
          .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`)
          .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${page.title}" />`)
          .replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${page.description}" />`)
        const canonical = `<link rel="canonical" href="${url}" />`
        html = html.replace('</head>', `${canonical}\n    <script id="structured-data" type="application/ld+json">${JSON.stringify(schema)}</script>\n  </head>`)
        if (page.folder) { const directory = resolve(dist, page.folder); mkdirSync(directory, { recursive: true }); writeFileSync(resolve(directory, 'index.html'), html) }
        else writeFileSync(resolve(dist, 'index.html'), html)
      }
    },
  }
}

export default defineConfig({ plugins: [react(), tailwindcss(), staticRouteMetadata()] })
