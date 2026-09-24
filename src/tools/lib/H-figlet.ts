/**
 * FIGlet with bundled fonts. Every font is its own lazily imported chunk
 * (figlet/importable-fonts/*.js), parsed once; figlet is told never to fetch.
 */

type FigletMod = {
  parseFont: (name: string, data: string) => unknown;
  textSync: (text: string, o?: Record<string, unknown>) => string;
  defaults: (o?: Record<string, unknown>) => unknown;
};

type Loader = () => Promise<{ default: string }>;

/* Explicit imports so the bundler emits one small chunk per font (no 660-font context). */
export const FONTS: Record<string, Loader> = {
  Standard: () => import("figlet/importable-fonts/Standard.js"),
  Big: () => import("figlet/importable-fonts/Big.js"),
  Slant: () => import("figlet/importable-fonts/Slant.js"),
  Small: () => import("figlet/importable-fonts/Small.js"),
  "Small Slant": () => import("figlet/importable-fonts/Small Slant.js"),
  Mini: () => import("figlet/importable-fonts/Mini.js"),
  Banner: () => import("figlet/importable-fonts/Banner.js"),
  Block: () => import("figlet/importable-fonts/Block.js"),
  Bubble: () => import("figlet/importable-fonts/Bubble.js"),
  Digital: () => import("figlet/importable-fonts/Digital.js"),
  Doom: () => import("figlet/importable-fonts/Doom.js"),
  Epic: () => import("figlet/importable-fonts/Epic.js"),
  Isometric1: () => import("figlet/importable-fonts/Isometric1.js"),
  "Larry 3D": () => import("figlet/importable-fonts/Larry 3D.js"),
  "3-D": () => import("figlet/importable-fonts/3-D.js"),
  Lean: () => import("figlet/importable-fonts/Lean.js"),
  Script: () => import("figlet/importable-fonts/Script.js"),
  Shadow: () => import("figlet/importable-fonts/Shadow.js"),
  "Small Shadow": () => import("figlet/importable-fonts/Small Shadow.js"),
  Speed: () => import("figlet/importable-fonts/Speed.js"),
  "Star Wars": () => import("figlet/importable-fonts/Star Wars.js"),
  Ogre: () => import("figlet/importable-fonts/Ogre.js"),
  Rectangles: () => import("figlet/importable-fonts/Rectangles.js"),
  "ANSI Shadow": () => import("figlet/importable-fonts/ANSI Shadow.js"),
  "ANSI Regular": () => import("figlet/importable-fonts/ANSI Regular.js"),
  "Calvin S": () => import("figlet/importable-fonts/Calvin S.js"),
  Colossal: () => import("figlet/importable-fonts/Colossal.js"),
  Graffiti: () => import("figlet/importable-fonts/Graffiti.js"),
  Ghost: () => import("figlet/importable-fonts/Ghost.js"),
  "DOS Rebel": () => import("figlet/importable-fonts/DOS Rebel.js"),
  Roman: () => import("figlet/importable-fonts/Roman.js"),
  Thin: () => import("figlet/importable-fonts/Thin.js"),
  Elite: () => import("figlet/importable-fonts/Elite.js"),
  Cyberlarge: () => import("figlet/importable-fonts/Cyberlarge.js"),
  Bloody: () => import("figlet/importable-fonts/Bloody.js"),
  "Sub-Zero": () => import("figlet/importable-fonts/Sub-Zero.js"),
  "The Edge": () => import("figlet/importable-fonts/The Edge.js"),
  Stop: () => import("figlet/importable-fonts/Stop.js"),
};

export const FONT_NAMES = Object.keys(FONTS);

/** Short, reliable fonts for small places (code comments). */
export const COMMENT_FONTS = ["Standard", "Small", "Mini", "Slant", "Small Slant", "Big", "Calvin S", "ANSI Regular", "ANSI Shadow", "Doom", "Rectangles", "Thin"];

let figP: Promise<FigletMod> | null = null;
const loaded = new Map<string, Promise<void>>();

async function figlet(): Promise<FigletMod> {
  if (!figP)
    figP = import("figlet").then((m) => {
      const f = ((m as { default?: FigletMod }).default ?? m) as FigletMod;
      f.defaults({ fetchFontIfMissing: false, fontPath: "/__no_font_fetch__" });
      return f;
    });
  return figP;
}

export async function loadFont(name: string): Promise<FigletMod> {
  const f = await figlet();
  if (!FONTS[name]) throw new Error(`Unknown font "${name}".`);
  let p = loaded.get(name);
  if (!p) {
    p = FONTS[name]().then((m) => {
      f.parseFont(name, m.default);
    });
    loaded.set(name, p);
  }
  await p;
  return f;
}

export type FigOpts = {
  font: string;
  horizontalLayout?: string;
  verticalLayout?: string;
  width?: number;
  whitespaceBreak?: boolean;
  printDirection?: number;
};

/** Render text; trailing spaces are trimmed from every line and blank edge lines dropped. */
export async function figletText(text: string, o: FigOpts): Promise<string> {
  const f = await loadFont(o.font);
  const opts: Record<string, unknown> = {
    font: o.font,
    horizontalLayout: o.horizontalLayout ?? "default",
    verticalLayout: o.verticalLayout ?? "default",
  };
  if (o.width && o.width > 0) {
    opts.width = o.width;
    opts.whitespaceBreak = !!o.whitespaceBreak;
  }
  if (o.printDirection) opts.printDirection = o.printDirection;
  const out = text
    .split("\n")
    .map((line) => (line.trim() ? f.textSync(line, opts) : ""))
    .join("\n");
  const lines = out.split("\n").map((l) => l.replace(/\s+$/, ""));
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join("\n");
}
