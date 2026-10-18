import { describe, expect, it } from "vitest";
import { extractAccessToken } from "@/lib/server-auth";

const JWT = "aaa.bbb.ccc";
const REF = "swpgeajgxgfwtbsgtbyc";
const COOKIE = `sb-${REF}-auth-token`;

function req(headers: Record<string, string>) {
  return new Request("https://example.com/_server", { headers });
}

describe("extractAccessToken", () => {
  it("prefers a valid Bearer header", () => {
    expect(extractAccessToken(req({ authorization: `Bearer ${JWT}` }))).toBe(JWT);
  });

  it("ignores an empty Bearer header and falls back to cookies", () => {
    const session = encodeURIComponent(JSON.stringify({ access_token: JWT }));
    expect(
      extractAccessToken(req({ authorization: "Bearer ", cookie: `${COOKIE}=${session}` })),
    ).toBe(JWT);
  });

  it("reads a URL-encoded JSON session cookie", () => {
    const session = encodeURIComponent(JSON.stringify({ access_token: JWT, refresh_token: "r" }));
    expect(extractAccessToken(req({ cookie: `other=1; ${COOKIE}=${session}` }))).toBe(JWT);
  });

  it("reads a base64-prefixed session cookie", () => {
    const b64 = Buffer.from(JSON.stringify({ access_token: JWT }), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(extractAccessToken(req({ cookie: `${COOKIE}=base64-${b64}` }))).toBe(JWT);
  });

  it("reassembles chunked session cookies in order", () => {
    const session = encodeURIComponent(JSON.stringify({ access_token: JWT }));
    const mid = Math.floor(session.length / 2);
    const cookie = `${COOKIE}.1=${session.slice(mid)}; ${COOKIE}.0=${session.slice(0, mid)}`;
    expect(extractAccessToken(req({ cookie }))).toBe(JWT);
  });

  it("returns null when neither header nor session cookie is present", () => {
    expect(extractAccessToken(req({}))).toBeNull();
    expect(extractAccessToken(req({ cookie: "theme=dark" }))).toBeNull();
  });

  it("returns null for malformed cookie values", () => {
    expect(extractAccessToken(req({ cookie: `${COOKIE}=not-json` }))).toBeNull();
    expect(
      extractAccessToken(req({ cookie: `${COOKIE}=${encodeURIComponent('{"access_token":""}')}` })),
    ).toBeNull();
  });
});
