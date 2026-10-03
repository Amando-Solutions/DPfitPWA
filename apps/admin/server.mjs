// Serves the built console on App Hosting (`npm start`).
//
// Node built-ins only, on purpose. App Hosting's container holds just
// `apps/admin`, while npm hoists every dependency to the repo-root
// `node_modules`, so a static-server package installed for this app is not in
// the container at run time.
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("./dist/", import.meta.url))
const port = Number(process.env.PORT) || 8080

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

async function fileSize(path) {
  try {
    const info = await stat(path)
    return info.isFile() ? info.size : null
  } catch {
    return null
  }
}

createServer(async (req, res) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname)
  } catch {
    res.writeHead(400).end()
    return
  }

  let path = join(root, pathname)
  // A decoded `%2e%2e%2f` can climb out of dist/; such a path just gets the shell.
  let size = path.startsWith(root) ? await fileSize(path) : null
  // Vite fingerprints everything under /assets/, so those files never change.
  let cacheControl = pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"

  if (size === null) {
    // Anything that isn't a file is a client-side route: serve the app shell.
    path = join(root, "index.html")
    size = await fileSize(path)
    cacheControl = "no-cache"
  }

  res.writeHead(200, {
    "Content-Type": contentTypes[extname(path)] ?? "application/octet-stream",
    "Content-Length": size,
    "Cache-Control": cacheControl,
  })
  if (req.method === "HEAD") {
    res.end()
    return
  }
  createReadStream(path).pipe(res)
}).listen(port, "0.0.0.0", () => {
  console.log(`admin console listening on ${port}`)
})
