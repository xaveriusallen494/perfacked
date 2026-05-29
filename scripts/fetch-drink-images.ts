import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

const DRINKS_DIR = path.resolve(process.cwd(), 'public/drinks')

// Map drink names to Open Food Facts search terms and known barcodes
const DRINK_SEARCHES: Record<string, { query: string; barcode?: string }> = {
  'Stella Artois': { query: 'Stella Artois beer', barcode: '5410228142836' },
  'Duvel': { query: 'Duvel beer', barcode: '5414504000079' },
  'Westmalle Tripel': { query: 'Westmalle Tripel', barcode: '5412495000107' },
  'Leffe Blond': { query: 'Leffe Blonde', barcode: '5410228142218' },
  'La Chouffe': { query: 'La Chouffe', barcode: '5411053100058' },
  'Karmeliet Tripel': { query: 'Tripel Karmeliet', barcode: '5411053101659' },
  'Orval': { query: 'Orval trappist', barcode: '5411053100010' },
  'Kriek (Cherry)': { query: 'Kriek cherry beer', barcode: '5410228181968' },
  'Chimay Bleue': { query: 'Chimay Blue', barcode: '5410908000012' },
  'Rochefort 10': { query: 'Rochefort 10 trappist', barcode: '5412209000107' },
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function download(url: string, dest: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(dest)
    client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          file.close()
          fs.unlinkSync(dest)
          download(redirectUrl, dest).then(resolve)
          return
        }
      }
      if (response.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        resolve(false)
        return
      }
      response.pipe(file)
      file.on('finish', () => { file.close(); resolve(true) })
      file.on('error', () => { file.close(); resolve(false) })
    }).on('error', () => { file.close(); resolve(false) })
  })
}

async function fetchByBarcode(barcode: string): Promise<string | null> {
  const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 1) return null
  return data.product?.image_front_url || data.product?.image_url || null
}

async function fetchBySearch(query: string): Promise<string | null> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const products = data.products || []
  for (const p of products) {
    if (p.image_front_url) return p.image_front_url
    if (p.image_url) return p.image_url
  }
  return null
}

async function main() {
  if (!fs.existsSync(DRINKS_DIR)) {
    fs.mkdirSync(DRINKS_DIR, { recursive: true })
    console.log(`Created ${DRINKS_DIR}`)
  }

  const results: Record<string, string> = {}

  for (const [name, { query, barcode }] of Object.entries(DRINK_SEARCHES)) {
    const slug = slugify(name)
    const ext = '.jpg'
    const filename = `${slug}${ext}`
    const filepath = path.join(DRINKS_DIR, filename)

    if (fs.existsSync(filepath)) {
      console.log(`✓ ${name} — already exists`)
      results[name] = `/drinks/${filename}`
      continue
    }

    console.log(`⏳ ${name} — searching...`)

    let imageUrl: string | null = null

    // Try barcode first (more reliable)
    if (barcode) {
      imageUrl = await fetchByBarcode(barcode)
      if (imageUrl) console.log(`  Found via barcode ${barcode}`)
    }

    // Fall back to search
    if (!imageUrl) {
      imageUrl = await fetchBySearch(query)
      if (imageUrl) console.log(`  Found via search "${query}"`)
    }

    if (!imageUrl) {
      console.log(`  ✗ No image found for ${name}`)
      continue
    }

    const ok = await download(imageUrl, filepath)
    if (ok) {
      console.log(`  ✓ Downloaded → ${filename}`)
      results[name] = `/drinks/${filename}`
    } else {
      console.log(`  ✗ Download failed`)
    }

    // Be polite to the API
    await new Promise(r => setTimeout(r, 500))
  }

  console.log('\n--- Results ---')
  console.log('Add these image_url values to your seed data:\n')
  for (const [name, path] of Object.entries(results)) {
    console.log(`  '${name}' → image_url: '${path}'`)
  }

  // Also output SQL UPDATE statements
  console.log('\n--- SQL Updates ---\n')
  for (const [name, imgPath] of Object.entries(results)) {
    console.log(`UPDATE public.drink_types SET image_url = '${imgPath}' WHERE name = '${name}';`)
  }
}

main().catch(console.error)
