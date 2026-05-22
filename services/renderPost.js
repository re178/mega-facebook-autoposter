const { createCanvas, loadImage, registerFont } = require('canvas');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Vibrant = require("node-vibrant/node"); // Added for real color extraction

// Optional mongoose for persistent layout memory
let mongoose = null;
try {
  mongoose = require('mongoose');
} catch (e) {
  console.warn('Mongoose not available, layout memory will be in-memory only');
}

// ======================================================
// ================= CLOUDINARY CONFIG ==================
// ======================================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// ======================================================
// ================= GLOBAL SETTINGS ====================
// ======================================================
const FORMATS = {
  instagram_post: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  youtube_thumbnail: { width: 1280, height: 720 },
  facebook_post: { width: 1080, height: 1080 },
  linkedin_banner: { width: 1200, height: 627 },
  blog_cover: { width: 1200, height: 630 }
};
const DEFAULT_FORMAT = 'instagram_post';
const SAFE_PADDING = 60;
const TEMPLATE_PATH = './assets/templates/q.png';

// ======================================================
// ================ FONT REGISTRATION ===================
// ======================================================
const FONT_DIR = './assets/fonts';
const FONTS = {
  Orbitron: 'Orbitron.ttf',
  Inter: 'Inter.ttf',
  'Bebas Neue': 'BebasNeue.ttf',
  Montserrat: 'Montserrat.ttf',
  Poppins: 'Poppins.ttf',
  Oswald: 'Oswald.ttf',
  'Playfair Display': 'PlayfairDisplay.ttf'
};

for (const [family, file] of Object.entries(FONTS)) {
  const fontPath = path.join(FONT_DIR, file);
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family });
  }
}

// ======================================================
// ================= PERSISTENT MEMORY ==================
// ======================================================
let LayoutMemoryModel = null;
if (mongoose && mongoose.connection && mongoose.connection.readyState === 1) {
  try {
    LayoutMemoryModel = mongoose.model('LayoutMemory');
  } catch {
    const layoutMemorySchema = new mongoose.Schema({
      pageId: { type: String, required: true, unique: true },
      recentLayouts: { type: [String], default: [] },
      updatedAt: { type: Date, default: Date.now }
    });
    LayoutMemoryModel = mongoose.model('LayoutMemory', layoutMemorySchema);
  }
}

// In-memory fallback
const inMemoryVariation = new Map();

async function getRecentLayouts(pageId) {
  if (LayoutMemoryModel) {
    const doc = await LayoutMemoryModel.findOne({ pageId }).lean();
    return doc?.recentLayouts || [];
  }
  return inMemoryVariation.get(pageId) || [];
}

async function pushLayout(pageId, layoutName) {
  let recent = await getRecentLayouts(pageId);
  recent = [layoutName, ...recent.slice(0, 2)];
  if (LayoutMemoryModel) {
    await LayoutMemoryModel.findOneAndUpdate(
      { pageId },
      { recentLayouts: recent, updatedAt: new Date() },
      { upsert: true }
    );
  } else {
    inMemoryVariation.set(pageId, recent);
  }
}

// ======================================================
// ===================== HELPERS ========================
// ======================================================
function cleanText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (ctx.measureText(testLine).width > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function fitText({ ctx, text, maxWidth, maxHeight, initialFont, minFont, weight = 'normal', fontFamily = 'Arial' }) {
  let fontSize = initialFont;
  while (fontSize >= minFont) {
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = fontSize * 1.25;
    const totalHeight = lines.length * lineHeight;
    let tooWide = false;
    for (const line of lines) {
      if (ctx.measureText(line).width > maxWidth) {
        tooWide = true;
        break;
      }
    }
    if (!tooWide && totalHeight <= maxHeight) {
      return { fontSize, lines, lineHeight, totalHeight };
    }
    fontSize -= 2;
  }
  ctx.font = `${weight} ${minFont}px ${fontFamily}`;
  const lines = wrapText(ctx, text, maxWidth);
  return { fontSize: minFont, lines, lineHeight: minFont * 1.25, totalHeight: lines.length * minFont * 1.25 };
}

async function downloadImageBuffer(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(response.data);
  } catch (err) {
    console.error('DOWNLOAD IMAGE ERROR:', err.message);
    return null;
  }
}

async function uploadBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: 'rendered-posts' }, (err, result) => {
      if (err) reject(err);
      else resolve(result.secure_url);
    });
    stream.end(buffer);
  });
}

// ======================================================
// ================ DIRECTIVE PARSER ====================
// ======================================================
function parseBlocks(text = '') {
  const blocks = {};
  const regex = /\[(.*?)\]([\s\S]*?)(?=\n\[|$)/g;
  let match;
  while ((match = regex.exec(text))) {
    const blockName = match[1].trim().toUpperCase();
    const content = match[2].trim();
    const lines = content.split('\n');
    const parsed = {};
    for (const line of lines) {
      if (!line.includes('=')) continue;
      const [key, value] = line.split('=');
      parsed[key.trim()] = value.trim();
    }
    blocks[blockName] = parsed;
  }
  return blocks;
}

// ======================================================
// ================== PAGE DNA BUILDER ==================
// ======================================================
function buildPageDNA(pageProfile = {}) {
  const directives = parseBlocks(pageProfile.extraNotes || '');
  const design = directives.DESIGN || {};
  return {
    pageName: pageProfile.pageName || 'Anonymous Page',
    brand: design.brand || 'modern',
    layoutPreference: design.layout || 'dynamic',
    logoMode: design.logo || 'auto',
    verified: design.verified === 'true',
    watermark: design.watermark === 'true',
    variation: design.variation || 'medium',
    mood: design.mood || 'modern',
    imageStyle: design.imageStyle || 'clean',
    headlineStyle: design.headline || 'standard',
    backgroundMode: design.background || 'adaptive'
  };
}

// ======================================================
// =================== STYLE LIBRARY ====================
// ======================================================
const STYLE_LIBRARY = {
  tech_neon: {
    fonts: { title: 'Orbitron', body: 'Inter', subtitle: 'Orbitron', meta: 'Inter' },
    colors: { primary: '#00d4ff', secondary: '#09121f', accent: '#00ffff', background: '#0a0f1a' },
    layouts: ['split', 'headlineFocus', 'cinematic'],
    logoStyle: 'neon',
    effects: ['glow', 'blur', 'gradient'],
    backgroundMode: 'neon'
  },
  sports_energy: {
    fonts: { title: 'Bebas Neue', body: 'Montserrat', subtitle: 'Bebas Neue', meta: 'Montserrat' },
    colors: { primary: '#ff3b30', secondary: '#111111', accent: '#ffffff', background: '#1a1a1a' },
    layouts: ['headline', 'poster', 'action'],
    logoStyle: 'shield',
    backgroundMode: 'cinematic'
  },
  finance_minimal: {
    fonts: { title: 'Montserrat', body: 'Open Sans', subtitle: 'Montserrat', meta: 'Open Sans' },
    colors: { primary: '#00ff88', secondary: '#0a2a1a', accent: '#e0e0e0', background: '#0f0f0f' },
    layouts: ['split', 'editorial'],
    logoStyle: 'minimal',
    backgroundMode: 'minimal'
  },
  luxury_elegant: {
    fonts: { title: 'Playfair Display', body: 'Poppins', subtitle: 'Playfair Display', meta: 'Poppins' },
    colors: { primary: '#d4af37', secondary: '#2c2c2c', accent: '#ffffff', background: '#1a1a1a' },
    layouts: ['cinematic', 'quoteCentered'],
    logoStyle: 'monogram',
    backgroundMode: 'glassmorphism'
  },
  modern: {
    fonts: { title: 'Poppins', body: 'Inter', subtitle: 'Poppins', meta: 'Inter' },
    colors: { primary: '#ffffff', secondary: '#2d2d2d', accent: '#ff3366', background: '#121212' },
    layouts: ['split', 'editorial'],
    logoStyle: 'circle',
    backgroundMode: 'gradient'
  }
};

function getStyle(brand) {
  return STYLE_LIBRARY[brand] || STYLE_LIBRARY.modern;
}

// ======================================================
// ================== TYPOGRAPHY ENGINE =================
// ======================================================
function getFontFamily(style, role) {
  const fontName = style.fonts[role] || (role === 'title' ? 'Poppins' : 'Inter');
  return fontName;
}

// ======================================================
// ================== LAYOUT ENGINE ====================
// ======================================================
const LAYOUTS = {
  split: {
    imageArea: { x: 80, y: 200, width: 450, height: 500 },
    titleArea: { x: 560, y: 200, width: 460, height: 120 },
    subtitleArea: { x: 560, y: 330, width: 460, height: 60 },
    bodyArea: { x: 560, y: 400, width: 460, height: 300 },
    footerOffset: 40
  },
  cinematic: {
    imageArea: { x: 80, y: 180, width: 920, height: 460 },
    titleArea: { x: 100, y: 680, width: 880, height: 100 },
    subtitleArea: { x: 100, y: 790, width: 880, height: 50 },
    bodyArea: { x: 100, y: 850, width: 880, height: 140 },
    footerOffset: 40
  },
  editorial: {
    imageArea: { x: 80, y: 200, width: 920, height: 400 },
    titleArea: { x: 100, y: 640, width: 880, height: 100 },
    subtitleArea: { x: 100, y: 750, width: 880, height: 60 },
    bodyArea: { x: 100, y: 820, width: 880, height: 170 },
    footerOffset: 40
  },
  quoteCentered: {
    imageArea: null,
    titleArea: { x: 100, y: 300, width: 880, height: 200 },
    subtitleArea: null,
    bodyArea: { x: 150, y: 550, width: 780, height: 400 },
    footerOffset: 40
  },
  headlineFocus: {
    imageArea: { x: 80, y: 200, width: 920, height: 300 },
    titleArea: { x: 100, y: 540, width: 880, height: 150 },
    subtitleArea: { x: 100, y: 700, width: 880, height: 60 },
    bodyArea: { x: 100, y: 770, width: 880, height: 220 },
    footerOffset: 40
  }
};

// Enhanced layout selection with composition rules
async function chooseLayout(pageDNA, postAnalysis, pageId, title, imageBuffer = null) {
  const style = getStyle(pageDNA.brand);
  let candidateLayouts = style.layouts;
  if (pageDNA.layoutPreference !== 'dynamic' && LAYOUTS[pageDNA.layoutPreference]) {
    candidateLayouts = [pageDNA.layoutPreference];
  }

  // Get recent layouts from persistent memory
  const recent = await getRecentLayouts(pageId);
  let available = candidateLayouts.filter(l => !recent.includes(l));
  if (available.length === 0) available = candidateLayouts;

  let selected = available[0];

  // Composition rules
  if (postAnalysis.isQuote && available.includes('quoteCentered')) selected = 'quoteCentered';
  if (postAnalysis.urgency > 7 && available.includes('headlineFocus')) selected = 'headlineFocus';
  if (postAnalysis.mood === 'cinematic' && available.includes('cinematic')) selected = 'cinematic';
  if (title && title.length < 40 && available.includes('split')) selected = 'split';
  if (imageBuffer && title && title.length > 80 && available.includes('editorial')) selected = 'editorial';

  await pushLayout(pageId, selected);
  return LAYOUTS[selected];
}

// ======================================================
// ================= POST ANALYZER ======================
// ======================================================
function detectMood(text) {
  if (text.includes('breaking') || text.includes('urgent')) return 'urgent';
  if (text.includes('inspiring') || text.includes('dream')) return 'inspirational';
  if (text.includes('cinematic') || text.includes('epic')) return 'cinematic';
  if (text.includes('funny') || text.includes('hilarious')) return 'humorous';
  return 'neutral';
}

function detectTopicEmotion(text) {
  const lower = text.toLowerCase();
  if (lower.includes('crypto') || lower.includes('bitcoin') || lower.includes('web3')) return 'futuristic';
  if (lower.includes('politics') || lower.includes('election') || lower.includes('government')) return 'serious';
  if (lower.includes('sports') || lower.includes('game') || lower.includes('match')) return 'energetic';
  if (lower.includes('luxury') || lower.includes('expensive') || lower.includes('diamond')) return 'elegant';
  return 'neutral';
}

function detectVisualIntent(text) {
  // Simple heuristics for future AI direction
  return {
    energy: text.includes('urgent') ? 'high' : (text.includes('calm') ? 'low' : 'medium'),
    focus: text.includes('quote') ? 'text' : 'balanced'
  };
}

function analyzePost(post = {}) {
  const combined = `${post.title || ''} ${post.text || ''}`.toLowerCase();
  return {
    isBreaking: combined.includes('breaking') || combined.includes('urgent'),
    isQuote: (post.text || '').includes('"') || (post.title || '').includes('"'),
    urgency: combined.includes('urgent') ? 10 : (combined.includes('breaking') ? 8 : 4),
    mood: detectMood(combined),
    emotion: detectTopicEmotion(combined),
    visualIntent: detectVisualIntent(combined)
  };
}

// ======================================================
// ================== COLOR ENGINE ======================
// ======================================================
async function extractDominantColor(imageBuffer) {
  if (!imageBuffer) return null;
  try {
    const palette = await Vibrant.from(imageBuffer).getPalette();
    return palette.Vibrant?.hex || palette.Muted?.hex || null;
  } catch (err) {
    console.error('Vibrant extraction error:', err.message);
    return null;
  }
}

async function generatePalette(style, imageBuffer = null, pageDNA = null) {
  let primary = style.colors.primary;
  let secondary = style.colors.secondary;
  let accent = style.colors.accent;
  let overlayColor = 'rgba(0,0,0,0.55)';
  let vignetteStrength = 0.6;
  let lighting = 'standard';

  if (imageBuffer) {
    const dominant = await extractDominantColor(imageBuffer);
    if (dominant) {
      // Use dominant for primary if it creates better contrast
      primary = dominant;
      // Adaptive overlay: dark image gets lighter overlay
      const r = parseInt(dominant.slice(1,3),16);
      const g = parseInt(dominant.slice(3,5),16);
      const b = parseInt(dominant.slice(5,7),16);
      const brightness = (r*0.299 + g*0.587 + b*0.114);
      if (brightness < 100) overlayColor = 'rgba(0,0,0,0.7)';
      else overlayColor = 'rgba(0,0,0,0.45)';
      vignetteStrength = brightness < 80 ? 0.8 : 0.5;
    }
  }

  // Adjust based on pageDNA mood
  if (pageDNA && pageDNA.mood === 'cinematic') {
    vignetteStrength = 0.8;
    lighting = 'dramatic';
  }

  return { primary, secondary, accent, overlayColor, vignetteStrength, lighting, background: style.colors.background };
}

// ======================================================
// ================== BACKGROUND ENGINE =================
// ======================================================
async function drawBackground(ctx, width, height, backgroundMode, style, pageDNA) {
  const mode = backgroundMode || style.backgroundMode || pageDNA.backgroundMode || 'adaptive';
  const w = width, h = height;

  if (mode === 'minimal') {
    ctx.fillStyle = style.colors.background;
    ctx.fillRect(0, 0, w, h);
  } else if (mode === 'glassmorphism') {
    ctx.fillStyle = style.colors.background;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 200; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 3, 0, Math.PI*2);
      ctx.fill();
    }
  } else if (mode === 'neon') {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0a0f1a');
    grad.addColorStop(1, '#001133');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // neon grid lines
    ctx.strokeStyle = style.colors.primary;
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
  } else if (mode === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, style.colors.background);
    grad.addColorStop(1, style.colors.secondary);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else if (mode === 'noise') {
    ctx.fillStyle = style.colors.background;
    ctx.fillRect(0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = Math.random() * 30;
      data[i] = Math.min(255, data[i] + noise);
      data[i+1] = Math.min(255, data[i+1] + noise);
      data[i+2] = Math.min(255, data[i+2] + noise);
    }
    ctx.putImageData(imageData, 0, 0);
  } else if (mode === 'mesh') {
    ctx.fillStyle = style.colors.background;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 40 + 10, 0, Math.PI*2);
      ctx.fillStyle = `rgba(${parseInt(style.colors.primary.slice(1,3),16)}, ${parseInt(style.colors.primary.slice(3,5),16)}, ${parseInt(style.colors.primary.slice(5,7),16)}, 0.03)`;
      ctx.fill();
    }
  } else if (mode === 'cinematic') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0.8)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else {
    // adaptive or fallback to template loading later
    ctx.fillStyle = style.colors.background;
    ctx.fillRect(0, 0, w, h);
  }
}

// ======================================================
// ================== LOGO GENERATOR ====================
// ======================================================
async function generateLogo({ pageName, colors, style, brand, mood }) {
  const canvas = createCanvas(200, 200);
  const ctx = canvas.getContext('2d');
  const initials = pageName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Map brand to logo style
  let logoStyle = style.logoStyle || 'circle';
  if (brand === 'tech_neon') logoStyle = 'neon';
  if (brand === 'sports_energy') logoStyle = 'shield';
  if (brand === 'luxury_elegant') logoStyle = 'monogram';
  if (brand === 'finance_minimal') logoStyle = 'minimal';
  if (mood === 'futuristic') logoStyle = 'neon';

  ctx.clearRect(0, 0, 200, 200);

  if (logoStyle === 'circle') {
    ctx.fillStyle = colors.primary;
    ctx.beginPath();
    ctx.arc(100, 100, 90, 0, Math.PI * 2);
    ctx.fill();
  } else if (logoStyle === 'neon') {
    ctx.fillStyle = colors.primary;
    ctx.shadowBlur = 15;
    ctx.shadowColor = colors.accent;
    ctx.beginPath();
    ctx.arc(100, 100, 85, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (logoStyle === 'shield') {
    ctx.fillStyle = colors.primary;
    ctx.beginPath();
    ctx.moveTo(100, 20);
    ctx.lineTo(170, 50);
    ctx.lineTo(170, 130);
    ctx.lineTo(100, 180);
    ctx.lineTo(30, 130);
    ctx.lineTo(30, 50);
    ctx.fill();
  } else if (logoStyle === 'monogram') {
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0,0,200,200);
    ctx.fillStyle = colors.primary;
    ctx.font = `bold 100px ${getFontFamily(style, 'title')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 100, 100);
  } else {
    // minimal
    ctx.fillStyle = colors.primary;
    ctx.fillRect(20, 20, 160, 160);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 72px ${getFontFamily(style, 'title')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 100, 100);
  }

  if (logoStyle !== 'monogram') {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 72px ${getFontFamily(style, 'title')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 100, 100);
  }

  return canvas.toBuffer();
}

// ======================================================
// ================= BADGE ENGINE =======================
// ======================================================
function drawBadges(ctx, pageDNA, postAnalysis, width, padding) {
  let yOffset = 20;
  if (pageDNA.verified) {
    ctx.fillStyle = '#1da1f2';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('✓ VERIFIED', padding, yOffset + 25);
    yOffset += 35;
  }
  if (postAnalysis.isBreaking) {
    ctx.fillStyle = '#ff3b30';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('🔴 BREAKING', padding, yOffset + 25);
    yOffset += 35;
  }
  if (postAnalysis.urgency > 7) {
    ctx.fillStyle = '#ff9500';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('⚡ URGENT', padding, yOffset + 25);
  }
}

// ======================================================
// ================= HIGHLIGHT WORDS ====================
// ======================================================
function drawHighlightedText(ctx, text, highlightWords, x, y, maxWidth, fontFamily, fontSize, color, highlightColor) {
  if (!highlightWords || highlightWords.length === 0) {
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    return;
  }
  const words = text.split(' ');
  let currentX = x;
  const spaceWidth = ctx.measureText(' ').width;
  for (const word of words) {
    const isHighlight = highlightWords.some(hw => word.toLowerCase().includes(hw.toLowerCase()));
    ctx.fillStyle = isHighlight ? highlightColor : color;
    const wordWidth = ctx.measureText(word).width;
    if (currentX + wordWidth > x + maxWidth) {
      // wrap not implemented for simplicity in highlights
    }
    ctx.fillText(word, currentX, y);
    currentX += wordWidth + spaceWidth;
  }
}

// ======================================================
// ================= MAIN RENDER ENGINE =================
// ======================================================
async function renderPost({
  title,
  text,
  rawImage = null,
  pageProfile = {},
  pageName = 'Anonymous Page',
  logoUrl = null,  // kept for compatibility
  subtitle = null,
  meta = null,
  highlightWords = [],
  format = DEFAULT_FORMAT
}) {
  try {
    // Clean inputs
    title = cleanText(title || '');
    text = cleanText(text || '');
    const pageId = pageProfile.id || pageProfile.pageId || pageProfile.pageName || pageName;

    // Format dimensions
    const dims = FORMATS[format] || FORMATS[DEFAULT_FORMAT];
    const WIDTH = dims.width;
    const HEIGHT = dims.height;

    // 1. Build Page DNA
    const pageDNA = buildPageDNA({ ...pageProfile, pageName });

    // 2. Analyze post
    const postAnalysis = analyzePost({ title, text });

    // 3. Get style from library
    const style = getStyle(pageDNA.brand);

    // 4. Download image buffer for analysis
    let imageBuffer = null;
    if (rawImage && typeof rawImage === 'string') {
      imageBuffer = await downloadImageBuffer(rawImage);
    }

    // 5. Choose layout (dynamic)
    const layout = await chooseLayout(pageDNA, postAnalysis, pageId, title, imageBuffer);

    // 6. Create canvas
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // 7. Draw background (layer 1)
    await drawBackground(ctx, WIDTH, HEIGHT, pageDNA.backgroundMode, style, pageDNA);

    // 8. Try to overlay template if exists and background is adaptive
    if (pageDNA.backgroundMode === 'adaptive') {
      try {
        const template = await loadImage(TEMPLATE_PATH);
        ctx.drawImage(template, 0, 0, WIDTH, HEIGHT);
      } catch {}
    }

    // 9. Process image (layer 2)
    if (imageBuffer && layout.imageArea) {
      try {
        const img = await loadImage(imageBuffer);
        const area = layout.imageArea;
        const imgRatio = img.width / img.height;
        const boxRatio = area.width / area.height;
        let sx, sy, sw, sh;
        if (imgRatio > boxRatio) {
          sh = img.height;
          sw = sh * boxRatio;
          sx = (img.width - sw) / 2;
          sy = 0;
        } else {
          sw = img.width;
          sh = sw / boxRatio;
          sx = 0;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, area.x, area.y, area.width, area.height);
      } catch (e) {
        console.error('Image draw error:', e);
      }
    }

    // 10. Generate color palette
    const palette = await generatePalette(style, imageBuffer, pageDNA);

    // 11. Apply overlay + cinematic gradient (layer 3)
    if (layout.imageArea && imageBuffer) {
      ctx.fillStyle = palette.overlayColor;
      ctx.fillRect(layout.imageArea.x, layout.imageArea.y, layout.imageArea.width, layout.imageArea.height);

      // Vignette effect
      const vignetteGrad = ctx.createRadialGradient(WIDTH/2, HEIGHT/2, 0, WIDTH/2, HEIGHT/2, WIDTH/0.8);
      vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vignetteGrad.addColorStop(1, `rgba(0,0,0,${palette.vignetteStrength})`);
      ctx.fillStyle = vignetteGrad;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Depth gradient (cinematic)
      const depthGrad = ctx.createLinearGradient(0, HEIGHT*0.6, 0, HEIGHT);
      depthGrad.addColorStop(0, 'rgba(0,0,0,0)');
      depthGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = depthGrad;
      ctx.fillRect(0, HEIGHT*0.6, WIDTH, HEIGHT*0.4);
    }

    // 12. Light FX layer (optional)
    if (postAnalysis.mood === 'cinematic' || pageDNA.mood === 'cinematic') {
      ctx.fillStyle = 'rgba(255,200,100,0.05)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // 13. Draw title (layer 4)
    if (layout.titleArea && title) {
      const titleFont = getFontFamily(style, 'title');
      const titleFit = fitText({
        ctx,
        text: title,
        maxWidth: layout.titleArea.width,
        maxHeight: layout.titleArea.height,
        initialFont: 68,
        minFont: 34,
        weight: 'bold',
        fontFamily: titleFont
      });
      ctx.font = `bold ${titleFit.fontSize}px ${titleFont}`;
      ctx.textAlign = 'left';
      let y = layout.titleArea.y + titleFit.fontSize;
      for (const line of titleFit.lines) {
        if (highlightWords && highlightWords.length) {
          drawHighlightedText(ctx, line, highlightWords, layout.titleArea.x, y, layout.titleArea.width, titleFont, titleFit.fontSize, palette.primary, palette.accent);
        } else {
          ctx.fillStyle = palette.primary;
          ctx.fillText(line, layout.titleArea.x, y);
        }
        y += titleFit.lineHeight;
      }
      // Accent line
      ctx.fillStyle = palette.accent;
      ctx.fillRect(layout.titleArea.x, y + 5, Math.min(220, layout.titleArea.width), 6);
    }

    // 14. Draw subtitle (if provided)
    if (layout.subtitleArea && subtitle) {
      const subFont = getFontFamily(style, 'subtitle');
      const subFit = fitText({
        ctx,
        text: subtitle,
        maxWidth: layout.subtitleArea.width,
        maxHeight: layout.subtitleArea.height,
        initialFont: 36,
        minFont: 22,
        weight: 'normal',
        fontFamily: subFont
      });
      ctx.font = `${subFit.fontSize}px ${subFont}`;
      ctx.fillStyle = palette.secondary;
      let y = layout.subtitleArea.y + subFit.fontSize;
      for (const line of subFit.lines) {
        ctx.fillText(line, layout.subtitleArea.x, y);
        y += subFit.lineHeight;
      }
    }

    // 15. Draw body text
    if (layout.bodyArea && text) {
      const bodyFont = getFontFamily(style, 'body');
      const bodyFit = fitText({
        ctx,
        text,
        maxWidth: layout.bodyArea.width,
        maxHeight: layout.bodyArea.height,
        initialFont: 42,
        minFont: 24,
        weight: 'normal',
        fontFamily: bodyFont
      });
      ctx.font = `${bodyFit.fontSize}px ${bodyFont}`;
      ctx.fillStyle = palette.secondary;
      let y = layout.bodyArea.y + bodyFit.fontSize;
      for (const line of bodyFit.lines) {
        ctx.fillText(line, layout.bodyArea.x, y);
        y += bodyFit.lineHeight;
      }
    }

    // 16. Draw meta (if provided)
    if (meta && layout.subtitleArea) {
      ctx.font = `24px ${getFontFamily(style, 'meta')}`;
      ctx.fillStyle = palette.accent;
      ctx.fillText(meta, layout.subtitleArea.x, layout.subtitleArea.y - 20);
    }

    // 17. Draw badges
    drawBadges(ctx, pageDNA, postAnalysis, WIDTH, SAFE_PADDING);

    // 18. Generate and draw logo (layer 5)
    let logoBuffer = null;
    if (pageDNA.logoMode !== 'none') {
      logoBuffer = await generateLogo({
        pageName: pageDNA.pageName,
        colors: palette,
        style,
        brand: pageDNA.brand,
        mood: postAnalysis.emotion
      });
      const logoImg = await loadImage(logoBuffer);
      ctx.drawImage(logoImg, WIDTH - 120, 40, 80, 80);
    }

    // 19. Footer (layer 6)
    ctx.fillStyle = '#aaaaaa';
    ctx.font = `28px ${getFontFamily(style, 'body')}`;
    ctx.textAlign = 'center';
    ctx.fillText(`© ${pageDNA.pageName}`, WIDTH / 2, HEIGHT - 35);

    // 20. Watermark (layer 7)
    if (pageDNA.watermark) {
      ctx.globalAlpha = 0.2;
      ctx.font = `bold 36px ${getFontFamily(style, 'title')}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(pageDNA.pageName, WIDTH / 2, HEIGHT - 100);
      ctx.globalAlpha = 1;
    }

    // 21. Final texture layer (optional)
    if (pageDNA.mood === 'cinematic') {
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      for (let i = 0; i < 500; i++) {
        ctx.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, 2, 2);
      }
    }

    // 22. Upload
    const buffer = canvas.toBuffer('image/png');
    const finalUrl = await uploadBuffer(buffer);
    return finalUrl;

  } catch (err) {
    console.error('RENDER POST ERROR:', err.message);
    return null;
  }
}

module.exports = { renderPost };
