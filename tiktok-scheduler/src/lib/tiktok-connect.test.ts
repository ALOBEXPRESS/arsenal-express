import { afterEach, describe, expect, it, vi } from "vitest";
import { openTikTokConnection } from "./tiktok-connect";

afterEach(() => vi.restoreAllMocks());

describe("TikTok connection", () => {
  it("opens the authorization window before waiting for PostZen", async () => {
    const replace = vi.fn();
    const popup = { opener: {}, closed: false, location: { replace }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const getUrl = vi.fn(async () => {
      expect(open).toHaveBeenCalledWith("about:blank", "_blank");
      expect(popup.opener).toBeNull();
      return { authUrl: "https://www.tiktok.com/auth/authorize/" };
    });
    await openTikTokConnection(getUrl);
    expect(replace).toHaveBeenCalledWith("https://www.tiktok.com/auth/authorize/");
  });

  it("closes the blank window when PostZen fails", async () => {
    const close = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ opener: null, close } as unknown as Window);
    await expect(openTikTokConnection(async () => { throw new Error("PostZen indisponível"); }))
      .rejects.toThrow("PostZen indisponível");
    expect(close).toHaveBeenCalledOnce();
  });
});