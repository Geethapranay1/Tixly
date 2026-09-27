import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  verifySessionToken,
} from "../src/lib/sessionToken.js";

describe("session token isolation", () => {
  it("verifies matching token", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(verifySessionToken(token, hash)).toBe(true);
  });

  it("rejects wrong token", () => {
    const hash = hashSessionToken(generateSessionToken());
    expect(verifySessionToken(generateSessionToken(), hash)).toBe(false);
  });
});
