import { describe, it, expect } from "vitest";
import { jsonFormat, jsonMinify, base64Encode, base64Decode, jsonToCsv, csvToJson, htmlEncode } from "./tools-engine";

describe("engine smoke", () => {
  it("formats json", () => expect(jsonFormat('{"a":1}')).toContain('"a"'));
  it("minifies", () => expect(jsonMinify('{"a": 1}')).toBe('{"a":1}'));
  it("base64 roundtrip", () => expect(base64Decode(base64Encode("hi ✓"))).toBe("hi ✓"));
  it("json<->csv", () => expect(csvToJson(jsonToCsv('[{"a":1}]'))).toContain("a"));
  it("html encodes", () => expect(htmlEncode("<a>")).toBe("&lt;a&gt;"));
});
