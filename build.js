#!/usr/bin/env node
/**
 * SWAPS Pre-compile Build Script
 * Reads:  src/index.html   (JSX source — never edit the compiled output)
 * Writes: public/index.html (compiled, ready-to-serve)
 */
const fs    = require('fs');
const path  = require('path');
const babel = require('@babel/core');

const SRC  = path.join(__dirname, 'src',    'index.html');
const DIST = path.join(__dirname, 'public', 'index.html');

// Also copy logo.png from src/ to public/ if present
const SRC_LOGO  = path.join(__dirname, 'src',    'logo.png');
const DIST_LOGO = path.join(__dirname, 'public', 'logo.png');

console.log('[build] Reading', SRC);
let html = fs.readFileSync(SRC, 'utf8');

// ── 1. Remove Babel CDN script tag ──────────────────────────────
const BABEL_CDN = /<script[^>]+babel[^>]+><\/script>\r?\n?/i;
if (BABEL_CDN.test(html)) {
  html = html.replace(BABEL_CDN, '');
  console.log('[build] ✓ Removed Babel CDN script tag');
} else {
  console.warn('[build] ⚠  Babel CDN tag not found');
}

// ── 2. Extract JSX from <script type="text/babel"> ──────────────
const OPEN_TAG  = '<script type="text/babel">';
const CLOSE_TAG = '</script>';

const jsxStart = html.indexOf(OPEN_TAG);
if (jsxStart === -1) {
  console.error('[build] ✗ <script type="text/babel"> not found in', SRC);
  console.error('        Make sure you are editing src/index.html, not public/index.html');
  process.exit(1);
}

const codeStart = jsxStart + OPEN_TAG.length;
const codeEnd   = html.indexOf(CLOSE_TAG, codeStart);
const jsxCode   = html.slice(codeStart, codeEnd);
console.log(`[build] Extracted ${jsxCode.length.toLocaleString()} chars of JSX`);

// ── 3. Compile with Babel ────────────────────────────────────────
console.log('[build] Compiling JSX...');
let compiledCode;
try {
  const result = babel.transformSync(jsxCode, {
    presets: [
      ['@babel/preset-env', {
        targets: { chrome: '90', firefox: '88', safari: '14' },
        modules: false,
        useBuiltIns: false,
      }],
      ['@babel/preset-react', { runtime: 'classic' }],
    ],
    compact: false,
    comments: false,
    filename: 'app.jsx',
  });
  compiledCode = result.code;
  console.log(`[build] ✓ Compiled → ${compiledCode.length.toLocaleString()} chars`);
} catch (err) {
  console.error('[build] ✗ Babel compile error:', err.message);
  process.exit(1);
}

// ── 4. Inject compiled JS ────────────────────────────────────────
const newScript = `<script>\n${compiledCode}\n</script>`;
html = html.slice(0, jsxStart) + newScript + html.slice(codeEnd + CLOSE_TAG.length);

// ── 5. Write compiled HTML ───────────────────────────────────────
fs.mkdirSync(path.dirname(DIST), { recursive: true });
fs.writeFileSync(DIST, html, 'utf8');
const sizeKB = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`[build] ✓ Written → ${DIST} (${sizeKB} KB)`);

// ── 6. Copy logo.png if present in src/ ─────────────────────────
if (fs.existsSync(SRC_LOGO)) {
  fs.copyFileSync(SRC_LOGO, DIST_LOGO);
  console.log('[build] ✓ Copied logo.png → public/');
}

console.log('[build] Done.');
