import { describe, expect, it } from "vitest";
import { buildShareLink, isPublicShareUrl, normalizePublicBaseUrl } from "./shareUrl";

describe("public share URLs", () => {
  it.each([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://192.168.1.20",
    "https://10.0.0.2",
    "https://vaultdrop.local",
  ])("rejects local-only address %s", (address) => {
    expect(isPublicShareUrl(address)).toBe(false);
  });

  it("accepts and normalizes public HTTPS origins", () => {
    expect(isPublicShareUrl("https://vaultdrop-demo.trycloudflare.com")).toBe(true);
    expect(normalizePublicBaseUrl(" https://vaultdrop.example.com/ ")).toBe("https://vaultdrop.example.com");
  });

  it("rejects public HTTP and URLs with a path", () => {
    expect(() => normalizePublicBaseUrl("http://vaultdrop.example.com")).toThrow("public HTTPS URL");
    expect(() => normalizePublicBaseUrl("https://vaultdrop.example.com/app")).toThrow("only the HTTPS origin");
  });

  it("builds a fragment-key share link", () => {
    expect(buildShareLink("https://vaultdrop.example.com/", "share id", "#k.secret"))
      .toBe("https://vaultdrop.example.com/share/share%20id#k.secret");
  });
});

