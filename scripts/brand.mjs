// Single source of truth for the logo artwork used by icons and store assets.

/** Full logo: gradient squircle, headphones, sound bars. `pad` = transparent margin in viewBox units (of 128). */
export function logoSvg({ size = 128, pad = 0, simple = false } = {}) {
  const inner = 128 - pad * 2;
  const s = inner / 128;
  const bars = simple
    ? '<path d="M56 86v-14M72 86v-14" stroke="#fff" stroke-width="9" stroke-linecap="round"/>'
    : '<path d="M52 83v-8M60 89v-20M68 86v-14M76 81v-4" stroke="#fff" stroke-width="6" stroke-linecap="round"/>';
  const stroke = simple ? 12 : 9;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6D5DF6"/>
      <stop offset="1" stop-color="#2BB5A8"/>
    </linearGradient>
  </defs>
  <g transform="translate(${pad} ${pad}) scale(${s})">
    <rect x="4" y="4" width="120" height="120" rx="30" fill="url(#g)"/>
    <path d="M30 74v-8a34 34 0 0 1 68 0v8" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round"/>
    <rect x="${simple ? 19 : 22}" y="68" width="${simple ? 22 : 18}" height="32" rx="9" fill="#fff"/>
    <rect x="${simple ? 87 : 88}" y="68" width="${simple ? 22 : 18}" height="32" rx="9" fill="#fff"/>
    ${bars}
  </g>
</svg>`;
}
