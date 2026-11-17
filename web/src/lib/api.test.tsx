import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, createRun, getRun, nextQuestion, nextStage, sendAnswer, sendGate, testModel, useRun, type Run } from "./api";

const run = (over: Partial<Run> = {}): Run => ({
  id: "r1", status: "working", stage: "phase1_step1", outcome: null, mode: "demo", provider: "ollama",
  phase1: null, phase2: null, pending: null, notice: null, messages: [], outputs: [], sources: [], error: null, ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("api client", () => {
  it("createRun posts the brief and sends the key only as X-Model-Key", async () => {
    fetchMock.mockResolvedValue(json(run(), 201));
    await createRun({ brief: "hello", provider: "openai" }, "sk-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/runs");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ brief: "hello", mode: "demo", provider: "openai" });
    expect(new Headers(init.headers).get("x-model-key")).toBe("sk-1");
    expect(init.body).not.toContain("sk-1");
  });

  it("nextQuestion posts the answers and sends the key only as X-Model-Key", async () => {
    fetchMock.mockResolvedValue(json({ done: false, question: { key: "problem", text: "T", why: "W", kind: "text" } }));
    const reply = await nextQuestion({ answers: [{ key: "role", question: "Q", answer: "Student" }], provider: "openai", model: "m" }, "sk-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/onboarding/next");
    expect(JSON.parse(init.body)).toEqual({ answers: [{ key: "role", question: "Q", answer: "Student" }], mode: "demo", provider: "openai", model: "m" });
    expect(init.body).not.toContain("sk-1");
    expect(new Headers(init.headers).get("x-model-key")).toBe("sk-1");
    expect(reply.done).toBe(false);
  });

  it("omits X-Model-Key when there is no key", async () => {
    fetchMock.mockResolvedValue(json(run(), 201));
    await createRun({ brief: "hello" });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has("x-model-key")).toBe(false);
  });

  it("getRun returns the typed run", async () => {
    fetchMock.mockResolvedValue(json(run({ status: "gate", pending: { kind: "gate", key: "phase1", prompt: "Pick", options: [{ id: "o1", name: "A", cost: "$0", risk: "low", source: "S1" }] } })));
    const r = await getRun("r1");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/runs/r1");
    expect(r.pending?.kind === "gate" && r.pending.options[0].name).toBe("A");
  });

  it("sendAnswer and sendGate post the right bodies", async () => {
    fetchMock.mockImplementation(async () => json(run()));
    await sendAnswer("r1", "I tutor students");
    await sendGate("r1", "A", "Because forty students already ask me for these sheets");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/runs/r1/answer");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: "I tutor students" });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/runs/r1/gate");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ option: "A", reason: "Because forty students already ask me for these sheets" });
  });

  it("nextStage posts to /next with no body and returns the run", async () => {
    fetchMock.mockResolvedValue(json(run({ stage: "phase2_step1" })));
    const r = await nextStage("r1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/runs/r1/next");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(r.stage).toBe("phase2_step1");
  });

  it("throws ApiError carrying the API's plain 422 message", async () => {
    fetchMock.mockResolvedValue(json({ detail: "Your reason needs at least 15 words." }, 422));
    await expect(sendGate("r1", "A", "x")).rejects.toMatchObject({ name: "ApiError", status: 422, message: "Your reason needs at least 15 words." });
  });

  it("throws a plain ApiError when the body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    const err = await getRun("r1").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.message).not.toBe("");
  });

  it("testModel posts the provider and sends the key as a header", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, provider: "openai", model: "m" }));
    const r = await testModel("openai", "sk-2");
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/model/test");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("x-model-key")).toBe("sk-2");
  });
});

describe("useRun", () => {
  it("polls every second while working or waiting, and stops when done", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(json(run({ status: "working" })))
      .mockResolvedValueOnce(json(run({ status: "waiting" })))
      .mockResolvedValueOnce(json(run({ status: "done", outcome: "go" })))
      .mockResolvedValue(json(run({ status: "done" })));
    const { result } = renderHook(() => useRun("r1"));
    await act(async () => {});
    expect(result.current.run?.status).toBe("working");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.run?.status).toBe("waiting");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.run?.status).toBe("done");
    const calls = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("does nothing without a run id and stops on unmount", async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(({ id }: { id: string | null }) => useRun(id), { initialProps: { id: null } });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.run).toBeNull();
    unmount();
  });

  it("keeps polling after a network blip and reports the error", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValueOnce(new TypeError("down")).mockResolvedValue(json(run({ status: "done" })));
    const { result } = renderHook(() => useRun("r1"));
    await act(async () => {});
    expect(result.current.error).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.run?.status).toBe("done");
    expect(result.current.error).toBeNull();
  });

  it("accepts a fresh run pushed from a POST response", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(json(run({ status: "working" })));
    const { result } = renderHook(() => useRun("r1"));
    await act(async () => {});
    act(() => result.current.update(run({ status: "done", outcome: "go" })));
    expect(result.current.run?.outcome).toBe("go");
  });
});
