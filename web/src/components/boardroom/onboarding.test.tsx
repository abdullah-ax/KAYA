import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Onboarding } from "./onboarding";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const RUN = { id: "r1", status: "waiting", stage: "phase1_step1", outcome: null, mode: "demo", provider: "ollama", phase1: null, phase2: null, pending: { kind: "question", key: "a", prompt: "Q?" }, notice: null, messages: [], outputs: [], sources: [], error: null };

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

async function fillAll(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox"), "I am a fourth year pharmacy student in Cairo and I tutor");
  await user.click(screen.getByRole("button", { name: /next/i }));
  await user.click(screen.getByRole("checkbox", { name: /teaching or tutoring/i }));
  await user.click(screen.getByRole("button", { name: /next/i }));
  await user.type(screen.getByRole("textbox"), "About forty pharmacy students from my tutoring");
  await user.click(screen.getByRole("button", { name: /next/i }));
  await user.click(screen.getByRole("radio", { name: /5–10/ }));
  await user.click(screen.getByRole("button", { name: /next/i }));
  await user.click(screen.getByRole("radio", { name: /self-funded/i }));
  await user.click(screen.getByRole("button", { name: /next/i }));
  await user.type(screen.getByRole("textbox"), "No fake reviews and no exaggerated claims");
}

describe("Onboarding in live mode", () => {
  it("Finish creates a run with a brief that holds the answers, and hands the run on", async () => {
    fetchMock.mockImplementation(async () => json(RUN, 201));
    const onRun = vi.fn();
    const user = userEvent.setup();
    render(<Onboarding live={{ provider: "openai", modelKey: "sk-mem", onRun }} />);
    await fillAll(user);
    await user.click(screen.getByRole("button", { name: /finish/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/runs");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.provider).toBe("openai");
    for (const part of ["fourth year pharmacy student in Cairo", "Teaching or tutoring", "forty pharmacy students", "5–10", "Self-funded", "No fake reviews"]) {
      expect(body.brief).toContain(part);
    }
    expect(init.body).not.toContain("sk-mem");
    expect(new Headers(init.headers).get("x-model-key")).toBe("sk-mem");
    await vi.waitFor(() => expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" })));
  });

  it("shows the API's message and stays on the last step when the run can't start", async () => {
    fetchMock.mockImplementation(async () => json({ detail: "An API key is needed for that provider." }, 422));
    const onRun = vi.fn();
    const user = userEvent.setup();
    render(<Onboarding live={{ provider: "openai", modelKey: "", onRun }} />);
    await fillAll(user);
    await user.click(screen.getByRole("button", { name: /finish/i }));
    expect(await screen.findByText("An API key is needed for that provider.")).toBeInTheDocument();
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /finish/i })).toBeEnabled();
  });

  it("makes no request in demo mode", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<Onboarding onDone={onDone} />);
    await fillAll(user);
    await user.click(screen.getByRole("button", { name: /finish/i }));
    await user.click(screen.getByRole("button", { name: /meet noor/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });
});
