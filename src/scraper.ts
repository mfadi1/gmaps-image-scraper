import puppeteer from 'puppeteer';

export interface PlaceDetails {
  name: string;
  photos: string[];
}

export interface DDGResponse {
  results?: Array<{ image: string }>;
}

export interface ImgBBUploadResponse {
  data?: { url: string };
}

export const fallbacks: Record<string, string[]> = {
  gym: [
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=800&auto=format&fit=crop",
  ],
  salon: [
    "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1519699047748-de8e457a634e?q=80&w=800&auto=format&fit=crop",
  ],
  restaurant: [
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=800&auto=format&fit=crop",
  ],
  clinic: [
    "https://images.unsplash.com/photo-1629909613654-28e377c37b09?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1579684385127-1ef15d508118?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?q=80&w=800&auto=format&fit=crop",
  ],
  retail: [
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1472851294608-062f824d29cc?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800&auto=format&fit=crop",
  ],
  default: [
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=800&auto=format&fit=crop",
  ]
};

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
  mapsUrl: string | null,
  businessName: string,
  category: string,
  imgbbKey?: string,
  limit: number = 50
): Promise<string[]> {
  const cat = category.toLowerCase();
  let fallback = fallbacks.default;
  
  if (cat.includes("gym") || cat.includes("fit")) fallback = fallbacks.gym;
  else if (cat.includes("salon") || cat.includes("beauty") || cat.includes("spa")) fallback = fallbacks.salon;
  else if (cat.includes("rest") || cat.includes("cafe") || cat.includes("food")) fallback = fallbacks.restaurant;
  else if (cat.includes("clinic") || cat.includes("doctor")) fallback = fallbacks.clinic;
  else if (cat.includes("shop") || cat.includes("store") || cat.includes("retail")) fallback = fallbacks.retail;

  let candidates: string[] = [];
  let queryName = businessName;

  // Attempt to scrape Google Maps directly if a URL is provided
  if (mapsUrl?.includes("google.com/maps")) {
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
        queryName = parsedName;
        console.log(`Detected name: ${queryName}`);
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

  // Fallback to DuckDuckGo search if no images found
  if (!candidates.length) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const query = `${queryName} ${category} photos`;
      console.log(`Searching DDG for: "${query}"`);
      
      const searchRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: controller.signal
      });
      
      if (searchRes.ok) {
        const html = await searchRes.text();
        const vqd = html.match(/vqd=["']([^"']+)["']/i)?.[1] || 
                    html.match(/vqd\s*=\s*([^;]+)/i)?.[1]?.replace(/['"]/g, "")?.trim();
        
        if (vqd) {
          const imgRes = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${vqd}&o=json`, {
            headers: {
              "User-Agent": "Mozilla/5.0",
              "Referer": "https://duckduckgo.com/"
            },
            signal: controller.signal
          });
          if (imgRes.ok) {
            const data = await imgRes.json() as DDGResponse;
            if (data?.results?.length) {
              candidates = data.results.slice(0, limit).map((r) => r.image);
              console.log(`Found ${candidates.length} images on DDG.`);
            }
          }
        }
      }
      clearTimeout(timeoutId);
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        console.error("DDG search timed out.");
      } else {
        console.error("DDG search failed:", e);
      }
    }
  }

  const photos = candidates.length ? await uploadPhotos(candidates, imgbbKey, limit) : [];

  // Provide fallback padding if minimum image count is not met
  if (photos.length < 5) {
    const extra = fallback.filter(p => !photos.includes(p)).slice(0, 5 - photos.length);
    photos.push(...extra);
    while (photos.length < 5 && fallback.length) {
      photos.push(fallback[photos.length % fallback.length]);
    }
  }

  return photos;
}
