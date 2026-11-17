import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/[...path]/route";

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const upstream = vi.fn();

beforeEach(() => {
  upstream.mockReset();
  vi.stubGlobal("fetch", upstream);
  vi.stubEnv("API_URL", "http://api.test:9000");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("API proxy", () => {
  it("forwards a JSON body and returns the upstream status and body unchanged", async () => {
    upstream.mockResolvedValue(new Response(JSON.stringify({ detail: "Tell us why in your own words, not just yes." }), { status: 422, headers: { "content-type": "application/json" } }));
    const req = new Request("http://web/api/runs/abc/gate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ option: "A", reason: "yes" }) });
    const res = await POST(req as never, ctx("runs", "abc", "gate"));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: "Tell us why in your own words, not just yes." });
    const [url, init] = upstream.mock.calls[0];
    expect(String(url)).toBe("http://api.test:9000/runs/abc/gate");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ option: "A", reason: "yes" }));
  });

  it("forwards only X-Model-Key and the JSON content type", async () => {
    upstream.mockResolvedValue(new Response("{}", { status: 201 }));
    const req = new Request("http://web/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-model-key": "sk-secret", cookie: "session=1", authorization: "Bearer x", "x-other": "1" },
      body: "{}",
    });
    await POST(req as never, ctx("runs"));
    const headers = new Headers(upstream.mock.calls[0][1].headers);
    expect(headers.get("x-model-key")).toBe("sk-secret");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("x-other")).toBe(false);
  });

  it("proxies GET with the query string and no body", async () => {
    upstream.mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    const res = await GET(new Request("http://web/api/health?x=1") as never, ctx("health"));
    expect(res.status).toBe(200);
    const [url, init] = upstream.mock.calls[0];
    expect(String(url)).toBe("http://api.test:9000/health?x=1");
    expect(init.body).toBeUndefined();
  });

  it("defaults to localhost:8000", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("API_URL", "");
    upstream.mockResolvedValue(new Response("{}"));
    await GET(new Request("http://web/api/health") as never, ctx("health"));
    expect(String(upstream.mock.calls[0][0])).toBe("http://localhost:8000/health");
  });

  it("answers 502 with a plain message when the API is down, and never logs the key", async () => {
    const spies = (["log", "error", "warn", "info"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    upstream.mockRejectedValue(new TypeError("fetch failed: sk-secret"));
    const req = new Request("http://web/api/runs", { method: "POST", headers: { "content-type": "application/json", "x-model-key": "sk-secret" }, body: "{}" });
    const res = await POST(req as never, ctx("runs"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.detail).toMatch(/can't reach the api/i);
    expect(JSON.stringify(body)).not.toContain("sk-secret");
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain("sk-secret");
    spies.forEach((s) => s.mockRestore());
  });

  it("forwards X-Netlify-Token on POST and DELETE, and still no cookie", async () => {
    upstream.mockResolvedValue(new Response("{}", { status: 200 }));
    const { DELETE } = await import("@/app/api/[...path]/route");
    const headers = { "x-netlify-token": "nfp_t", cookie: "a=1" };
    const where = ctx("runs", "r1", "publish", "netlify");
    await POST(new Request("http://web/api/runs/r1/publish/netlify", { method: "POST", headers }) as never, where);
    await DELETE(new Request("http://web/api/runs/r1/publish/netlify", { method: "DELETE", headers }) as never, where);
    for (const [, init] of upstream.mock.calls) {
      const h = new Headers(init.headers);
      expect(h.get("x-netlify-token")).toBe("nfp_t");
      expect(h.has("cookie")).toBe(false);
    }
    expect(upstream.mock.calls[1][1].method).toBe("DELETE");
    expect(upstream.mock.calls[1][1].body).toBeUndefined();
  });
});
