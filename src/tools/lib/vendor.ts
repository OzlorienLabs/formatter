/**
 * Self-hosted runtimes. In the browser they load from /vendor on this site
 * (copied there by scripts/vendor.mjs and cached by the service worker); in
 * Node (unit tests) they are read straight from node_modules. Never a CDN.
 */
export const isNode =
  typeof window === "undefined" || /jsdom/i.test(globalThis.navigator?.userAgent ?? "");

export async function nodeRead(pkgRelative: string): Promise<Uint8Array> {
  const fs = await import(/* webpackIgnore: true */ "node:fs/promises");
  const path = await import(/* webpackIgnore: true */ "node:path");
  return new Uint8Array(await fs.readFile(path.join(process.cwd(), "node_modules", pkgRelative)));
}

export async function vendorBytes(publicPath: string, pkgRelative: string): Promise<Uint8Array> {
  if (isNode) return nodeRead(pkgRelative);
  const r = await fetch(publicPath);
  if (!r.ok) throw new Error(`Could not load ${publicPath} (${r.status}). Reload once while online to cache it.`);
  return new Uint8Array(await r.arrayBuffer());
}

const scripts = new Map<string, Promise<void>>();
export function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => res();
      s.onerror = () => {
        scripts.delete(src);
        rej(new Error(`Could not load ${src}. Reload once while online to cache it.`));
      };
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}
