const { createCanvas, loadImage, registerFont } = require('canvas');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');

// ======================================================
// ================= CLOUDINARY CONFIG ===================
// ======================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// ======================================================
// ===================== SETTINGS ========================
// ======================================================

const WIDTH = 1080;
const HEIGHT = 1080;

const SAFE_PADDING = 60;

const TITLE_MAX_FONT = 68;
const TITLE_MIN_FONT = 34;

const BODY_MAX_FONT = 42;
const BODY_MIN_FONT = 24;

const FOOTER_FONT = 28;

const TEMPLATE_PATH = './assets/templates/q.png';

// ======================================================
// ===================== HELPERS =========================
// ======================================================

function cleanText(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim();
}

// ======================================================
// TEXT WRAPPER
// ======================================================

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];

  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine
      ? currentLine + ' ' + word
      : word;

    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) lines.push(currentLine);

  return lines;
}

// ======================================================
// DYNAMIC FONT FITTER
// ======================================================

function fitText({
  ctx,
  text,
  maxWidth,
  maxHeight,
  initialFont,
  minFont,
  weight = 'bold'
}) {

  let fontSize = initialFont;

  while (fontSize >= minFont) {

    ctx.font = `${weight} ${fontSize}px Arial`;

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
      return {
        fontSize,
        lines,
        lineHeight,
        totalHeight
      };
    }

    fontSize -= 2;
  }

  ctx.font = `${weight} ${minFont}px Arial`;

  const lines = wrapText(ctx, text, maxWidth);

  return {
    fontSize: minFont,
    lines,
    lineHeight: minFont * 1.25,
    totalHeight: lines.length * minFont * 1.25
  };
}

// ======================================================
// DOWNLOAD IMAGE BUFFER
// ======================================================

async function downloadImageBuffer(url) {
  try {

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    return Buffer.from(response.data);

  } catch (err) {

    console.error('DOWNLOAD IMAGE ERROR:', err.message);

    return null;
  }
}

// ======================================================
// SMART THEME ENGINE
// ======================================================

function getTheme(profile = {}) {

  const tone =
    (profile.tone || '').toLowerCase();

  const interests =
    (profile.audienceInterest || [])
      .join(' ')
      .toLowerCase();

  // DEFAULT
  let theme = {
    overlay: 'rgba(0,0,0,0.55)',
    accent: '#00d4ff',
    titleColor: '#ffffff',
    bodyColor: '#f2f2f2',
    footerColor: '#cccccc'
  };

  // TECH
  if (
    interests.includes('tech') ||
    interests.includes('technology') ||
    interests.includes('ai')
  ) {
    theme.accent = '#00d4ff';
  }

  // FINANCE
  if (
    interests.includes('finance') ||
    interests.includes('money') ||
    interests.includes('crypto')
  ) {
    theme.accent = '#00ff88';
  }

  // MOTIVATION
  if (
    interests.includes('motivation') ||
    interests.includes('success')
  ) {
    theme.accent = '#ffd700';
  }

  // SPORTS
  if (
    interests.includes('sports') ||
    interests.includes('football')
  ) {
    theme.accent = '#ff3b3b';
  }

  // AGGRESSIVE
  if (tone.includes('aggressive')) {
    theme.overlay = 'rgba(0,0,0,0.7)';
  }

  // FRIENDLY
  if (tone.includes('friendly')) {
    theme.overlay = 'rgba(0,0,0,0.45)';
  }

  return theme;
}

// ======================================================
// CLOUDINARY BUFFER UPLOAD
// ======================================================

async function uploadBuffer(buffer) {

  return new Promise((resolve, reject) => {

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'rendered-posts'
      },
      (err, result) => {

        if (err) {
          reject(err);
        } else {
          resolve(result.secure_url);
        }
      }
    );

    stream.end(buffer);
  });
}

// ======================================================
// ================== MAIN RENDERER =====================
// ======================================================

async function renderPost({
  title,
  text,
  rawImage = null,
  pageProfile = {},
  pageName = 'Anonymous Page',
  logoUrl = null
}) {

  try {

    // ==================================================
    // CLEAN INPUTS
    // ==================================================

    title = cleanText(title || '');
    text = cleanText(text || '');

    // ==================================================
    // LOAD TEMPLATE
    // ==================================================

    const canvas = createCanvas(WIDTH, HEIGHT);

    const ctx = canvas.getContext('2d');

    // ==================================================
    // DRAW BASE TEMPLATE
    // ==================================================

    try {

      const template = await loadImage(TEMPLATE_PATH);

      ctx.drawImage(template, 0, 0, WIDTH, HEIGHT);

    } catch {

      // fallback background
      ctx.fillStyle = '#101010';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // ==================================================
    // LOAD THEME
    // ==================================================

    const theme = getTheme(pageProfile);

    // ==================================================
    // DETERMINE LAYOUT MODE
    // ==================================================

    const hasImage =
      rawImage &&
      typeof rawImage === 'string';

    // ==================================================
    // IMAGE MODE
    // ==================================================

    if (hasImage) {

      try {

        const imgBuffer =
          await downloadImageBuffer(rawImage);

        if (imgBuffer) {

          const img =
            await loadImage(imgBuffer);

          // ==============================================
          // SMART IMAGE CROPPING
          // ==============================================

          const imageArea = {
            x: 80,
            y: 180,
            width: 920,
            height: 470
          };

          const imgRatio =
            img.width / img.height;

          const boxRatio =
            imageArea.width / imageArea.height;

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

          ctx.drawImage(
            img,
            sx,
            sy,
            sw,
            sh,
            imageArea.x,
            imageArea.y,
            imageArea.width,
            imageArea.height
          );

          // ==============================================
          // DARK OVERLAY FOR READABILITY
          // ==============================================

          ctx.fillStyle = theme.overlay;

          ctx.fillRect(
            imageArea.x,
            imageArea.y,
            imageArea.width,
            imageArea.height
          );
        }

      } catch (err) {

        console.error(
          'IMAGE RENDER ERROR:',
          err.message
        );
      }
    }

    // ==================================================
    // TITLE SECTION
    // ==================================================

    const titleBox = {
      x: SAFE_PADDING,
      y: 40,
      width: WIDTH - (SAFE_PADDING * 2),
      height: 120
    };

    const titleFit = fitText({
      ctx,
      text: title,
      maxWidth: titleBox.width,
      maxHeight: titleBox.height,
      initialFont: TITLE_MAX_FONT,
      minFont: TITLE_MIN_FONT,
      weight: 'bold'
    });

    ctx.fillStyle = theme.titleColor;

    ctx.font =
      `bold ${titleFit.fontSize}px Arial`;

    ctx.textAlign = 'left';

    let titleY =
      titleBox.y + titleFit.fontSize;

    for (const line of titleFit.lines) {

      ctx.fillText(
        line,
        titleBox.x,
        titleY
      );

      titleY += titleFit.lineHeight;
    }

    // ==================================================
    // ACCENT LINE
    // ==================================================

    ctx.fillStyle = theme.accent;

    ctx.fillRect(
      SAFE_PADDING,
      titleY + 10,
      220,
      8
    );

    // ==================================================
    // BODY AREA
    // ==================================================

    let bodyY;
    let bodyHeight;

    if (hasImage) {
      bodyY = 700;
      bodyHeight = 240;
    } else {
      bodyY = 260;
      bodyHeight = 560;
      // No dark rectangle – template is not bright
    }

    const bodyBox = {
      x: 90,
      y: bodyY,
      width: WIDTH - 180,
      height: bodyHeight
    };

    const bodyFit = fitText({
      ctx,
      text,
      maxWidth: bodyBox.width,
      maxHeight: bodyBox.height,
      initialFont: BODY_MAX_FONT,
      minFont: BODY_MIN_FONT,
      weight: 'normal'
    });

    ctx.fillStyle = theme.bodyColor;

    ctx.font =
      `${bodyFit.fontSize}px Arial`;

    ctx.textAlign = 'left';

    let bodyTextY =
      bodyBox.y + bodyFit.fontSize;

    for (const line of bodyFit.lines) {

      ctx.fillText(
        line,
        bodyBox.x,
        bodyTextY
      );

      bodyTextY += bodyFit.lineHeight;
    }

    // ==================================================
    // FOOTER
    // ==================================================

    ctx.fillStyle = theme.footerColor;

    ctx.font =
      `${FOOTER_FONT}px Arial`;

    ctx.textAlign = 'center';

    ctx.fillText(
      pageName,
      WIDTH / 2,
      HEIGHT - 40
    );

    // ==================================================
    // EXPORT BUFFER
    // ==================================================

    const buffer =
      canvas.toBuffer('image/png');

    // ==================================================
    // UPLOAD FINAL IMAGE
    // ==================================================

    const finalUrl =
      await uploadBuffer(buffer);

    return finalUrl;

  } catch (err) {

    console.error(
      'RENDER POST ERROR:',
      err.message
    );

    return null;
  }
}

// ======================================================
// ===================== EXPORTS =========================
// ======================================================

module.exports = {
  renderPost
};
