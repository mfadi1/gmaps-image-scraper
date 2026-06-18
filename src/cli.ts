#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { scrapePhotos } from "./scraper";

// Load environment variables
dotenv.config();

function showHelp() {
  console.log(`
GMaps Image Scraper CLI
-----------------------
Usage:
  npx gmaps-scrape --name "<name>" --category "<category>" [--url "<url>"] [--download] [--output "<dir>"] [--limit <number>]

Options:
  --name       Name of the business (required)
  --category   Category of the business (required)
  --url        Google Maps URL (optional)
  --download   Download the images locally
  --output     Directory to save images (default: ./scraped_images)
  --limit      Maximum number of images to scrape (default: 50)

Example:
  npx gmaps-scrape --name "Saudi Broast" --category "Restaurant" --download --limit 10
  `);
}

// Parse command line arguments
function getArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, any> = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--download") {
      parsed.download = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const val = args[i + 1];
      if (val && !val.startsWith("--")) {
        parsed[key] = val;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

async function saveImage(url: string, destDir: string, index: number) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    
    const buf = Buffer.from(await res.arrayBuffer());
    
    // Determine the file extension from the content type
    let ext = "jpg";
    const mime = res.headers.get("content-type");
    if (mime?.includes("png")) ext = "png";
    else if (mime?.includes("webp")) ext = "webp";
    
    const file = path.join(destDir, `image_${index}.${ext}`);
    fs.writeFileSync(file, buf);
    console.log(`  Saved: ${file}`);
  } catch (err: any) {
    console.error(`  Failed to download image ${index}:`, err.message || err);
  }
}

async function start() {
  const args = getArgs();
  
  if (args.help || !args.name || !args.category) {
    showHelp();
    process.exit(args.help ? 0 : 1);
  }

  const name = args.name;
  const category = args.category;
  const url = args.url || null;
  const download = !!args.download;
  const outputDir = args.output || "scraped_images";
  
  const parsedLimit = parseInt(args.limit, 10);
  const limit = !isNaN(parsedLimit) ? parsedLimit : 50;
  
  const key = process.env.IMGBB_API_KEY;

  console.log(`Scraping "${name}" (${category})...`);

  try {
    const urls = await scrapePhotos(url, name, category, key, limit);
    
    console.log("\nResults:");
    urls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));

    if (download) {
      console.log("\nDownloading images...");
      const dir = path.join(process.cwd(), outputDir);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      // Batch download in chunks of 5 for basic concurrency control
      const chunkSize = 5;
      for (let i = 0; i < urls.length; i += chunkSize) {
        const chunk = urls.slice(i, i + chunkSize);
        await Promise.all(chunk.map((imgUrl, idx) => saveImage(imgUrl, dir, i + idx + 1)));
      }
      console.log(`\nFinished. Downloaded images saved to: ${dir}`);
    }
  } catch (err: any) {
    console.error("Scraping failed:", err.message || err);
    process.exit(1);
  }
}

start();
