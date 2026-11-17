import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRun, listModels, testModel } from "@/lib/api";
import { localModelOf, ModelSettings } from "./model-settings";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("picking the local model", () => {
  it("maps each local option to its Ollama model and hosted options to none", () => {
    expect(localModelOf("ollama")).toBe("qwen3:8b");
    expect(localModelOf("ollama-gpt-oss")).toBe("gpt-oss:20b");
    expect(localModelOf("groq")).toBeUndefined();
  });

  it("offers both local models and tests the one picked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const test = vi.fn().mockResolvedValue({ ok: true, provider: "ollama", model: "gpt-oss:20b" });
    render(<ModelSettings current="ollama" onChange={onChange} test={test} />);
    await user.click(screen.getByRole("button", { name: /qwen3/i }));
    expect(screen.getByRole("radio", { name: /qwen3:8b/i })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /gpt-oss:20b/i }));
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    expect(test).toHaveBeenCalledWith("ollama", "", "gpt-oss:20b");
    await screen.findByText(/connected/i);
    await user.click(screen.getByRole("button", { name: /use this model/i }));
    expect(onChange).toHaveBeenCalledWith("ollama-gpt-oss", "");
  });

  it("says when a local model is not downloaded yet", async () => {
    const user = userEvent.setup();
    render(<ModelSettings current="ollama" onChange={vi.fn()} installed={{ "qwen3:8b": true, "gpt-oss:20b": false }} />);
    await user.click(screen.getByRole("button", { name: /qwen3/i }));
    expect(screen.getByRole("radio", { name: /gpt-oss:20b/i }).closest("label")).toHaveTextContent(/still downloading/i);
    expect(screen.getByRole("radio", { name: /qwen3:8b/i }).closest("label")).not.toHaveTextContent(/still downloading/i);
  });
});

describe("api client model fields", () => {
  it("createRun sends the model pick when there is one", async () => {
    fetchMock.mockResolvedValue(json({ id: "r1" }, 201));
    await createRun({ brief: "b", provider: "ollama", model: "gpt-oss:20b" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ brief: "b", mode: "demo", provider: "ollama", model: "gpt-oss:20b" });
  });

  it("testModel sends the model pick", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, provider: "ollama" }));
    await testModel("ollama", undefined, "qwen3:8b");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ provider: "ollama", model: "qwen3:8b" });
  });

  it("listModels reads which models are downloaded", async () => {
    fetchMock.mockResolvedValue(json({ default: "qwen3:8b", choices: [{ name: "qwen3:8b", installed: true }] }));
    const m = await listModels();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/models");
    expect(m.choices[0]).toEqual({ name: "qwen3:8b", installed: true });
  });
});

describe("finishing the model dialog", () => {
  it("closes when the founder picks Use this model", async () => {
    const user = userEvent.setup();
    const test = vi.fn().mockResolvedValue({ ok: true, provider: "ollama", model: "qwen3:8b" });
    render(<ModelSettings current="ollama" onChange={vi.fn()} test={test} />);
    await user.click(screen.getByRole("button", { name: /qwen3/i }));
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await screen.findByText(/connected/i);
    await user.click(screen.getByRole("button", { name: /use this model/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the model the server actually connected to, not a guess", async () => {
    const user = userEvent.setup();
    const test = vi.fn().mockResolvedValue({ ok: true, provider: "openai", model: "nvidia/nemotron-3.5-lightning:free" });
    render(<ModelSettings current="ollama" onChange={vi.fn()} test={test} />);
    await user.click(screen.getByRole("button", { name: /qwen3/i }));
    await user.click(screen.getByRole("radio", { name: /openrouter/i }));
    await user.type(screen.getByLabelText(/api key/i), "k");
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    expect(await screen.findByText(/nvidia\/nemotron-3\.5-lightning:free/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /use this model/i }));
    expect(screen.getByRole("button", { name: /nemotron/i })).toBeInTheDocument();
  });

  it("does not claim a hosted model before the server says which one", async () => {
    const user = userEvent.setup();
    render(<ModelSettings current="ollama" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /qwen3/i }));
    expect(screen.getByRole("radio", { name: /openrouter/i }).closest("label")).toHaveTextContent(/set on the server/i);
  });
});
