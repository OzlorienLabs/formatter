/** Helpers shared by the Fake JSON API spec and its custom UI. */
import type { MockResponse } from "./mockapi";

export type ParsedRequest = { method: string; url: string; headers: Record<string, string>; body: string };

/**
 * Parse "METHOD /path" (+ optional "Header: value" lines) (+ a blank line and a body).
 * A bare path means GET.
 */
export function parseRequestText(src: string): ParsedRequest {
  const text = src.replace(/\r\n/g, "\n").replace(/^\s*\n/, "");
  const lines = text.split("\n");
  const first = (lines[0] ?? "").trim();
  if (!first) throw new Error("Type a request line such as GET /mock-api/users/2");
  const m = /^(?:([A-Za-z]+)\s+)?(\S+)(?:\s+HTTP\/[\d.]+)?$/.exec(first);
  if (!m) throw new Error(`Could not read the request line "${first}". Use METHOD /mock-api/path, e.g. GET /mock-api/users`);
  const method = (m[1] ?? "GET").toUpperCase();
  let url = m[2];
  url = url.replace(/^https?:\/\/[^/]+/i, "");
  if (!url.startsWith("/")) url = "/" + url;
  const headers: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      break;
    }
    const h = /^([A-Za-z0-9-]+):\s*(.*)$/.exec(l);
    if (!h) break; // body without a blank line
    headers[h[1]] = h[2];
  }
  const body = lines.slice(i).join("\n").trim();
  if (body && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type") && /^[[{]/.test(body)) headers["Content-Type"] = "application/json";
  return { method, url, headers, body };
}

export const mockMeta = new WeakMap<object, { req: ParsedRequest; res: MockResponse }>();
