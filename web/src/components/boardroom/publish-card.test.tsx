import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Run } from "@/lib/api";
import { LivePanel } from "./live";
import { PublishCard } from "./publish-card";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const TOKEN = "nfp_secret_token_123";
const BAD_TOKEN = "Netlify did not accept that token. Make a new one and paste all of it.";
const run = (over: Partial<Run> = {}, delivery: Partial<NonNullable<Run["delivery"]>> = {}): Run => ({
  id: "r1", status: "working", stage: "phase2_step2", outcome: null, mode: "full", provider: "ollama", phase1: null, phase2: null,
  pending: null, notice: null, messages: [], outputs: [], sources: [], error: null,
  delivery: { approved: true, url: null, site_id: null, ...delivery }, ...over,
});

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe("PublishCard", () => {
  it("before approval says publishing waits for the founder's decision and offers no button", () => {
    render(<PublishCard run={run({}, { approved: false })} />);
    expect(screen.getByText(/waits for your decision/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish to netlify/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/netlify token/i)).not.toBeInTheDocument();
  });

  it("after approval explains, links to the free token page and lists three steps", () => {
    render(<PublishCard run={run()} />);
    expect(screen.getByRole("heading", { name: /put your page online/i })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /get a free netlify token \(2 minutes\)/i });
    expect(link).toHaveAttribute("href", "https://app.netlify.com/user/applications#personal-access-tokens");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const field = screen.getByLabelText(/netlify token/i);
    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(screen.getByRole("button", { name: /publish to netlify/i })).toBeDisabled();
  });

  it("is labelled STUBBED in demo mode and not otherwise", () => {
    const { unmount } = render(<PublishCard run={run({ mode: "demo" })} />);
    expect(screen.getByText(/stubbed/i)).toBeInTheDocument();
    unmount();
    render(<PublishCard run={run({ mode: "full" })} />);
    expect(screen.queryByText(/stubbed/i)).not.toBeInTheDocument();
  });

  it("sends the token only in the X-Netlify-Token header, shows loading, then the live link", async () => {
    let finish!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => { finish = r; }));
    const user = userEvent.setup();
    render(<PublishCard run={run()} />);
    await user.type(screen.getByLabelText(/netlify token/i), TOKEN);
    await user.click(screen.getByRole("button", { name: /publish to netlify/i }));

    expect(screen.getByRole("button", { name: /publishing/i })).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/runs/r1/publish/netlify");
    expect(init.method).toBe("POST");
    expect(init.headers["x-netlify-token"]).toBe(TOKEN);
    expect(init.body).toBeUndefined();
    expect(String(url)).not.toContain(TOKEN);

    finish(json({ url: "https://boardroom-r1.netlify.app", site_id: "s1" }));
    const live = await screen.findByRole("link", { name: "https://boardroom-r1.netlify.app" });
    expect(live).toHaveAttribute("href", "https://boardroom-r1.netlify.app");
    expect(screen.getByRole("button", { name: /take it down/i })).toBeInTheDocument();
  });

  it("never writes the token to browser storage", async () => {
    fetchMock.mockResolvedValue(json({ url: "https://x.netlify.app", site_id: "s1" }));
    const user = userEvent.setup();
    render(<PublishCard run={run()} />);
    await user.type(screen.getByLabelText(/netlify token/i), TOKEN);
    await user.click(screen.getByRole("button", { name: /publish to netlify/i }));
    await screen.findByRole("link", { name: /netlify\.app/ });
    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(TOKEN);
  });

  it("shows the plain error, keeps the typed token, and retries", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: BAD_TOKEN }, 422));
    const user = userEvent.setup();
    render(<PublishCard run={run()} />);
    await user.type(screen.getByLabelText(/netlify token/i), TOKEN);
    await user.click(screen.getByRole("button", { name: /publish to netlify/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/netlify did not accept that token/i);

    fetchMock.mockResolvedValueOnce(json({ url: "https://ok.netlify.app", site_id: "s1" }));
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("link", { name: "https://ok.netlify.app" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers["x-netlify-token"]).toBe(TOKEN);
  });

  it("starts live when the run already has a page online, and takes it down with the token in the header", async () => {
    fetchMock.mockResolvedValue(json({ url: null, site_id: null }));
    const user = userEvent.setup();
    render(<PublishCard run={run({}, { url: "https://live.netlify.app", site_id: "s1" })} />);
    expect(screen.getByRole("link", { name: "https://live.netlify.app" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/netlify token/i), TOKEN);
    await user.click(screen.getByRole("button", { name: /take it down/i }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/runs/r1/publish/netlify");
    expect(init.method).toBe("DELETE");
    expect(init.headers["x-netlify-token"]).toBe(TOKEN);
    expect(await screen.findByText(/your page is offline/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "https://live.netlify.app" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish to netlify/i })).toBeInTheDocument();
  });

  it("shows a plain error when taking down fails and keeps the link", async () => {
    fetchMock.mockResolvedValue(json({ detail: BAD_TOKEN }, 422));
    const user = userEvent.setup();
    render(<PublishCard run={run({}, { url: "https://live.netlify.app", site_id: "s1" })} />);
    await user.type(screen.getByLabelText(/netlify token/i), TOKEN);
    await user.click(screen.getByRole("button", { name: /take it down/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/did not accept that token/i);
    expect(screen.getByRole("link", { name: "https://live.netlify.app" })).toBeInTheDocument();
  });
});

describe("PublishCard in the right panel", () => {
  const panel = (r: Run) => render(<LivePanel run={r} error={null} onRestart={() => {}} />);

  it("is shown once the founder approved publishing", () => {
    panel(run());
    expect(screen.getByRole("button", { name: /publish to netlify/i }).closest("section")).toHaveTextContent(/put your page online/i);
  });

  it("waits for the decision while the publish gate is open", () => {
    panel(run({ status: "gate", pending: { kind: "gate", key: "publish", prompt: "Publish this sign-up page?", options: [] } }, { approved: false }));
    expect(screen.getByText(/waits for your decision/i)).toBeInTheDocument();
  });

  it("is hidden early in a run, before the publish question", () => {
    panel(run({ stage: "phase1_step1" }, { approved: false }));
    expect(screen.queryByRole("heading", { name: /put your page online/i })).not.toBeInTheDocument();
  });
});
