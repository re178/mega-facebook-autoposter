function isValidHex(c) { return /^#([0-9A-F]{3}){1,2}$/i.test(c); }
const STYLES = {
  modern: { primary: '#ffffff', secondary: '#2d2d2d', accent: '#ff3366', background: '#121212' },
  tech_neon: { primary: '#00d4ff', secondary: '#09121f', accent: '#00ffff', background: '#0a0f1a' }
};
function getStyle(brand) {
  let s = STYLES[brand] || STYLES.modern;
  for (let k of ['primary','secondary','accent','background']) if (!isValidHex(s[k])) s[k] = STYLES.modern[k];
  return s;
}
function getFontFamily(style, role) { return 'Poppins'; }
module.exports = { getStyle, getFontFamily };
