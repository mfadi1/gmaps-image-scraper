import puppeteer from 'puppeteer';

export interface PlaceDetails {
  name: string;
  photos: string[];
}

export interface ImgBBUploadResponse {
  data?: { url: string };
}

export async function resolveMapsRedirect(url: string, depth = 0): Promise<string> {
  if (!url || !url.startsWith("http") || depth > 10) return url;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      return loc ? resolveMapsRedirect(loc, depth + 1) : url;
    }
  } catch {
    // Ignore redirect errors
  }
  return url;
}

export function extractBusinessName(url: string): string | null {
  try {
    const decoded = decodeURIComponent(url);
    const match = decoded.match(/\/maps\/place\/([^/@]+)/);
    return match ? match[1].replace(/\+/g, " ") : null;
  } catch {
    // Ignore parsing errors
    return null;
  }
}

export async function uploadToImgbb(imgUrl: string, apiKey?: string): Promise<string | null> {
  if (!apiKey) return imgUrl;
  try {
    const res = await fetch(imgUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!res.ok) return null;
    
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    
    const fd = new FormData();
    fd.append("image", base64);
    
    const uploadRes = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: "POST",
      body: fd
    });
    
    if (uploadRes.ok) {
      const json = await uploadRes.json() as ImgBBUploadResponse;
      return json?.data?.url || null;
    }
  } catch (err) {
    console.error(`ImgBB upload failed:`, err);
  }
  return null;
}

export async function uploadPhotos(urls: string[], apiKey?: string, limit: number = 50): Promise<string[]> {
  if (!urls?.length) return [];
  const list = urls.slice(0, limit);
  
  if (apiKey) {
    console.log(`Re-hosting ${list.length} images to ImgBB...`);
  }
  
  // Use Promise.all for concurrent uploads
  const promises = list.map(url => {
    if (url.includes("unsplash.com") || url.includes("ibb.co") || url.includes("imgbb.com")) {
      return Promise.resolve(url);
    }
    return uploadToImgbb(url, apiKey);
  });
  
  const results = await Promise.all(promises);
  const successfulUrls = results.filter((url): url is string => !!url);
  
  if (successfulUrls.length < list.length) {
    console.warn(`Warning: Failed to upload ${list.length - successfulUrls.length} images to ImgBB.`);
  }
  
  return successfulUrls;
}

export async function scrapePhotos(
  mapsUrl: string,
  imgbbKey?: string,
  limit: number = 50
): Promise<string[]> {
  let candidates: string[] = [];

  // Attempt to scrape Google Maps directly if a URL is provided
  if (mapsUrl?.includes("google.com/maps") || mapsUrl?.includes("goo.gl")) {
    let browser;
    try {
      const redirectedUrl = await resolveMapsRedirect(mapsUrl);
      const parsedUrl = new URL(redirectedUrl);
      
      // Force english language settings for standard selectors like "Photo of"
      parsedUrl.searchParams.set("hl", "en");
      const url = parsedUrl.toString();
      console.log(`Scraping Google Maps via browser: ${url}`);
      
      const parsedName = extractBusinessName(url);
      if (parsedName) {
        console.log(`Detected name: ${parsedName}`);
      }
      
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      
      // Bypass consent modal
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      await page.setCookie({
        name: 'CONSENT',
        value: `YES+cb.${dateStr}-17-p0.en+FX+999`,
        domain: '.google.com',
        path: '/',
      });
      
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      await page.setViewport({ width: 1280, height: 800 });
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for the place title to verify we are loaded
      try {
        await page.waitForSelector('h1', { timeout: 15000 });
      } catch {
        console.log("H1 title selector timeout, page might still load.");
      }
      
      // If not already on the photos tab, try to click the hero image to open gallery
      if (!url.includes('!10e5')) {
        try {
          const heroBtn = await page.$('button[jsaction*="heroHeaderImage"], button[aria-label*="Photo of"], button[class*="aoRNLd"]');
          if (heroBtn) {
            console.log("Clicking hero header to open photo gallery...");
            await heroBtn.click();
            await page.waitForSelector('div.UL7Qtf, div[role="feed"], div[class*="m6F6fc"], div[aria-label*="Photos"]', { timeout: 10000 });
          }
        } catch (err: any) {
          console.log("Skipping hero click, maybe gallery is already open: ", err.message);
        }
      }
      
      // Wait a bit for styles and layout to calculate before detecting scrollables
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Scroll the photos container to trigger lazy loading of more photos
      console.log("Scrolling the gallery to load photos...");
      await page.evaluate(async () => {
        // Dynamically detect all scrollable divs containing our feed
        const scrollables: HTMLElement[] = [];
        document.querySelectorAll('div').forEach(div => {
          const style = window.getComputedStyle(div);
          const isScrollable = div.scrollHeight > div.clientHeight && 
                               (style.overflowY === 'scroll' || style.overflowY === 'auto' || div.className.includes('UL7Qtf'));
          if (isScrollable) {
            scrollables.push(div);
          }
        });
        
        // Scroll multiple times to load the feed
        for (let i = 0; i < 30; i++) {
          if (scrollables.length > 0) {
            scrollables.forEach(s => {
              s.scrollTop = s.scrollHeight;
            });
          } else {
            window.scrollTo(0, document.body.scrollHeight);
          }
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      });
      
      // Extract all googleusercontent and ggpht URLs from DOM
      const pageUrls = await page.evaluate(() => {
        const set = new Set<string>();
        
        // 1. Extract from img tags
        document.querySelectorAll('img').forEach(img => {
          const src = img.src || img.getAttribute('src');
          if (src) set.add(src);
        });
        
        // 2. Extract from background images
        document.querySelectorAll('*').forEach(el => {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundImage;
          if (bg && bg !== 'none') {
            const match = bg.match(/url\((['"]?)(.*?)\1\)/);
            if (match && match[2]) set.add(match[2]);
          }
          const inlineStyle = el.getAttribute('style');
          if (inlineStyle && inlineStyle.includes('background-image')) {
            const match = inlineStyle.match(/url\((['"]?)(.*?)\1\)/);
            if (match && match[2]) set.add(match[2]);
          }
        });
        
        return Array.from(set);
      });
      
      // Filter and format them
      const filtered = pageUrls.filter(u => {
        const isGoogleImg = u.includes("googleusercontent.com") || u.includes("ggpht.com");
        if (!isGoogleImg) return false;
        if (u.includes("photo.jpg")) return false; // skip reviewer avatars
        if (u.includes("/avatar/")) return false;
        // Skip tiny icons
        if (u.includes("=w24-h24") || u.includes("=w32-h32") || u.includes("=w40-h40")) return false;
        return true;
      });
      
      // Map to high res w1000-h600 suffix and add protocol if relative
      const formatted = filtered.map(u => {
        let clean = u;
        if (clean.startsWith('//')) {
          clean = `https:${clean}`;
        }
        const base = clean.split('=')[0];
        return `${base}=w1000-h600`;
      });
      
      candidates = Array.from(new Set(formatted));
      console.log(`Found ${candidates.length} Google Maps images from browser DOM.`);
      
    } catch (e) {
      console.error("Browser scraping failed: ", e);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  return candidates.length ? await uploadPhotos(candidates, imgbbKey, limit) : [];
}
