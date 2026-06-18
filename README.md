# Google Maps Image Scraper

A lightweight, automated Node.js/TypeScript utility to scrape high-resolution images from Google Maps listings **without needing a Google Maps Places API key**. 

By leveraging browser automation with Puppeteer, this tool opens a headless browser, bypasses cookie consent windows, clicks to open the photo gallery, scrolls the photo feeds to trigger lazy-loading, and extracts image URLs directly from the rendered DOM.

---

## Features

- 🌐 **No API Keys Required:** Bypass official Google Places API restrictions, billing setups, and rate limits.
- 🤖 **Puppeteer Driven:** Uses headless Chrome to fully execute Google's dynamic JavaScript client and render the photos pane.
- 🍪 **Bypass Consent Walls:** Pre-injects cookie authorizations to automatically skip Google Maps' terms/consent popup modals.
- 🇬🇧 **Forced English Localization:** Automatically appends query parameters to load pages in English, ensuring DOM button and aria-label selectors are highly predictable and reliable.
- 📜 **Dynamic Scrolling:** Auto-detects active scrollable DOM containers and scrolls them sequentially to trigger Google's thumbnail lazy-loading.
- 🎨 **Deep Image Extraction:** Scrapes image paths from standard `<img>` tags and CSS `background-image` attributes of all elements in the DOM.
- 📐 **High-Res Sizing:** Automatically strips Google's thumbnail resize suffixes (e.g. `=w100-h100`) and requests high-resolution variants (`=w1000-h600`).
- 💾 **Local Downloader:** Simple CLI flags allow downloading and saving the images directly to a local `./scraped_images/` folder.
- 🔗 **Optional CDN Re-hosting:** Built-in parallel re-hosting to ImgBB CDN to bypass hotlink protection.
- 🦆 **Fallback Pipeline:** If no Google Maps URL is specified or if maps extraction fails, it falls back to a DuckDuckGo image search query.

---

## 🚀 Usage (Zero-Install)

The easiest way to use this tool is to run it directly from GitHub using `npx`. This requires zero installation, and the tool will automatically compile and run in a temporary environment.

```bash
# Basic search & scrape (runs in headless mode and lists image links)
npx github:mfadi1/gmaps-image-scraper --name "Habib Bakery" --category "Bakery"

# Scrape and download images locally to './scraped_images/'
npx github:mfadi1/gmaps-image-scraper --name "Habib Bakery" --category "Bakery" --url "https://maps.app.goo.gl/dsyyKTns3o9JXENJ9" --download

# Scrape and limit search results (e.g., up to 20 images)
npx github:mfadi1/gmaps-image-scraper --name "Gold Gym" --category "Gym" --limit 20 --download
```

> [!NOTE]
> Since this package uses `puppeteer` as a standard dependency, the first time you run this command it will download a Chromium binary (~170MB). This is required for the headless browser to correctly render Google Maps.

---

## 💻 Local Development

If you'd like to run it locally or modify the code:

1. Clone or download this folder to your machine.
2. Open a terminal in the folder and install dependencies:
   ```bash
   npm install
   ```
3. Compile the TypeScript source code:
   ```bash
   npm run build
   ```
4. Run the scraper locally:
   ```bash
   npm run scrape -- --name "Habib Bakery" --category "Bakery"
   ```

### Options

| Flag | Description | Required | Default |
| --- | --- | --- | --- |
| `--name` | The name of the local business. | **Yes** | - |
| `--category` | The business category (e.g., `Bakery`, `Gym`, `Restaurant`, `Clinic`). | **Yes** | - |
| `--url` | Direct Google Maps short link (`maps.app.goo.gl`) or redirected URL. | No | `null` |
| `--limit` | Maximum number of images to return/download. | No | `50` |
| `--download` | Save the scraped images locally as `.jpg`/`.png` files. | No | `false` |

---

## Programmatic API Usage

You can import the core scraping function directly into your own TypeScript or Node.js applications:

```typescript
import { scrapePhotos } from './src/scraper';

async function run() {
  const businessName = "Habib Bakery";
  const category = "Bakery";
  const mapsUrl = "https://maps.app.goo.gl/dsyyKTns3o9JXENJ9"; // optional
  const imgbbApiKey = process.env.IMGBB_API_KEY; // optional
  const imageLimit = 50;

  // returns an array of direct high-resolution image URLs
  const photos = await scrapePhotos(mapsUrl, businessName, category, imgbbApiKey, imageLimit);
  console.log("Scraped Photos:", photos);
}

run();
```

---

## How It Works Under the Hood

1. **Redirect Resolution:** If a short-link URL (like `https://maps.app.goo.gl/...`) is provided, it is resolved to its full Google Maps coordinates path.
2. **Launch & Localization:** Puppeteer launches a headless Chrome browser. The URL is processed to ensure the query parameter `hl=en` is present, forcing the page language to English so the element selectors remain constant.
3. **Modal Bypass:** A pre-approved Google `CONSENT` cookie is loaded into the browser context to bypass consent modal dialogs.
4. **Hero Header Click:** The script checks if the page is on the default info panel. If so, it clicks the hero cover photo (which starts with class `aoRNLd` or has `jsaction` properties for `heroHeaderImage`) to open the photo gallery list.
5. **Feed Scrolling:** It waits for the photo gallery feed panel (`div.UL7Qtf`) to load, detects all scrollable divs, and scrolls them to the bottom multiple times to trigger the lazy-loading of photo assets.
6. **Harvest & Filter:** It scans standard images and CSS background-images, skips user avatars and small icons, prepends protocols to relative paths, strips image-sizing suffixes, and replaces them with a high-resolution `=w1000-h600` sizing parameter.

---

## Configuration (Optional CDN Re-hosting)

If you plan to embed these images directly into a website, hotlinking directly to Google Maps CDN can occasionally cause broken image icons due to referrer/hotlinking restrictions.

To bypass this, copy `.env.example` to `.env` and add your **ImgBB API Key** (you can get a free one at [imgbb.com](https://imgbb.com/)):

```env
IMGBB_API_KEY=your_imgbb_api_key_here
```

When this key is present, the scraper will automatically upload the scraped images to ImgBB and return clean, permanent URLs.

---

## Legal Disclaimer

> [!WARNING]
> This scraper is intended for educational, research, and local data collection purposes only. Extracting Google Maps data through automated scrapers violates Google's official Terms of Service. Use this utility responsibly and at your own risk.
