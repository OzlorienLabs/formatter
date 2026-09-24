/** Small sample images for Image to ASCII (SVG data URLs plus one tiny PNG). */

const svg = (s: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);

export const SPHERE = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
<defs>
<radialGradient id="s" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#9ab"/><stop offset=".8" stop-color="#234"/><stop offset="1" stop-color="#012"/></radialGradient>
<radialGradient id="sh" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset="1" stop-color="#c9c9c9"/></linearGradient>
</defs>
<rect width="320" height="240" fill="url(#bg)"/>
<ellipse cx="175" cy="205" rx="95" ry="18" fill="url(#sh)"/>
<circle cx="160" cy="112" r="88" fill="url(#s)"/>
</svg>`);

export const SUNSET = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1446"/><stop offset=".45" stop-color="#b8386b"/><stop offset=".75" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ffd66b"/></linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a5c"/><stop offset="1" stop-color="#0c0a1e"/></linearGradient>
</defs>
<rect width="400" height="170" fill="url(#sky)"/>
<circle cx="250" cy="150" r="46" fill="#ffe9a8"/>
<path d="M0 170 L0 120 L40 95 L78 128 L120 70 L165 118 L200 100 L232 140 L270 150 L300 112 L340 138 L372 104 L400 124 L400 170 Z" fill="#241a3a"/>
<rect y="170" width="400" height="70" fill="url(#sea)"/>
<g fill="#ffd98a"><rect x="214" y="178" width="72" height="4" rx="2"/><rect x="224" y="190" width="52" height="3" rx="1.5"/><rect x="233" y="201" width="34" height="3" rx="1.5"/><rect x="241" y="212" width="18" height="2" rx="1"/></g>
</svg>`);

export const HEART = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="220" viewBox="0 0 240 220">
<rect width="240" height="220" fill="#fff"/>
<path d="M120 200 C 40 140 8 100 8 62 C 8 30 34 8 64 8 C 90 8 108 22 120 44 C 132 22 150 8 176 8 C 206 8 232 30 232 62 C 232 100 200 140 120 200 Z" fill="#d6006c"/>
<path d="M62 40 C 44 42 34 56 36 74" stroke="#fff" stroke-width="10" stroke-linecap="round" fill="none"/>
</svg>`);

export const MANDELBROT = "data:image/png;base64,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";
