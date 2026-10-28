# FreeImageTools

A free static site for resizing photos or signatures, compressing and converting images, merging multiple images, and editing photos for online forms. Image editing and export happen in the visitor's browser using Canvas; the site has no upload endpoint or file storage. The app uses React Router for its tool pages and Framer Motion for small interface transitions.

## Local setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm run dev` and open the local URL Vite prints.
4. Run `npm run build` to create the static `dist/` site.

## Cloudflare Pages deployment

Create a Cloudflare Pages project connected to this repository. Set the build command to `npm run build` and the build output directory to `dist`. No server or environment variables are required. `public/robots.txt` and `public/sitemap.xml` are copied into the published site.

The sitemap and canonical metadata use `https://formready.tools`; update those URLs if the production domain changes. The root URL and the old signature-resizer URL redirect to Image resize. Direct tool-page requests are served through `public/_redirects`.

## Docker deployment

Build the production image from the repository root:

```sh
docker build -t free-image-tools:latest .
```

Run it locally on port 8080:

```sh
docker run --rm -p 8080:8080 free-image-tools:latest
```

The container serves the static production build with unprivileged Nginx and supports direct requests to tool routes. Put TLS termination and the public hostname at your load balancer or hosting platform. The container exposes port 8080 and includes a health check.

## Browser behavior

The resize and compression tools accept JPG, PNG, and WebP images up to 30 MB and 50 megapixels. The converter exports JPG, PNG, or WebP and attempts to open GIF, SVG, TIFF, PSD, HEIC, and RAW inputs when the browser supports them. The photo editor supports filters, resize, crop, transforms, drawing, text, shapes, stickers, frames, rounded corners, and backgrounds. The image merger combines up to 10 JPG, PNG, WebP, or GIF files vertically or side by side. Image data is held in memory for the active tab session and is not sent to a server or saved in browser storage.
