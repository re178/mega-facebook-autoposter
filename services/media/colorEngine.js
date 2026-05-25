// colorEngine.js
const STYLE_LIBRARY = {
  modern: { primary: '#ffffff', secondary: '#2d2d2d', accent: '#ff3366', background: '#121212' },
  tech_neon: { primary: '#00d4ff', secondary: '#09121f', accent: '#00ffff', background: '#0a0f1a' },
  finance_minimal: { primary: '#00ff88', secondary: '#0a2a1a', accent: '#e0e0e0', background: '#0f0f0f' },
  luxury_elegant: { primary: '#d4af37', secondary: '#2c2c2c', accent: '#ffffff', background: '#1a1a1a' }
};

function isValidHex(color) {
  return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

function getStyle(brand) {
  const style = STYLE_LIBRARY[brand] || STYLE_LIBRARY.modern;
  // ensure all colors are valid hex, fallback if not
  for (const key of ['primary', 'secondary', 'accent', 'background']) {
    if (!isValidHex(style[key])) style[key] = STYLE_LIBRARY.modern[key];
  }
  return style;
}

function getFontFamily(style, role = 'title') {
  const fonts = { title: 'Poppins', body: 'Inter', subtitle: 'Poppins' };
  return fonts[role] || 'Inter';
}

module.exports = { getStyle, getFontFamily };
