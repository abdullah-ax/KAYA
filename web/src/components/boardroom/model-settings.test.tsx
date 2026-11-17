import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ModelSettings } from "./model-settings";

async function open(props: Partial<React.ComponentProps<typeof ModelSettings>> = {}) {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ModelSettings current="ollama" onChange={onChange} {...props} />);
  await user.click(screen.getByRole("button", { name: /ai ready/i }));
  return { user, onChange };
}

describe("ModelSettings with a live API", () => {
  it("Test connection calls the API for the local model with no key", async () => {
    const test = vi.fn().mockResolvedValue({ ok: true, provider: "ollama", model: "qwen3:8b" });
    const { user } = await open({ test });
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    expect(test).toHaveBeenCalledWith("ollama", "", "qwen3:8b");
    expect(await screen.findByText(/connected/i)).toBeInTheDocument();
  });

  it("sends the typed key for a hosted provider and hands it up on Use this model", async () => {
    const test = vi.fn().mockResolvedValue({ ok: true, provider: "openai", model: "gpt" });
    const { user, onChange } = await open({ test });
    await user.click(screen.getByRole("radio", { name: /groq/i }));
    await user.type(screen.getByLabelText(/api key/i), "sk-live-123");
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    expect(test).toHaveBeenCalledWith("openai", "sk-live-123", undefined);
    await screen.findByText(/connected/i);
    await user.click(screen.getByRole("button", { name: /use this model/i }));
    expect(onChange).toHaveBeenCalledWith("groq", "sk-live-123");
  });

  it("shows the API's error and keeps Use this model off when the test fails", async () => {
    const test = vi.fn().mockResolvedValue({ ok: false, provider: "ollama", error: "Model server is not running." });
    const { user } = await open({ test });
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    expect(await screen.findByText(/model server is not running/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use this model/i })).toBeDisabled();
  });

  it("shows a plain message when the API can't be reached", async () => {
    const test = vi.fn().mockRejectedValue(new Error("Can't reach the API."));
    const { user } = await open({ test });
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    expect(await screen.findByText(/can't reach the api/i)).toBeInTheDocument();
  });

  it("never writes the key to web storage", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    const test = vi.fn().mockResolvedValue({ ok: true, provider: "openai" });
    const { user } = await open({ test });
    await user.click(screen.getByRole("radio", { name: /groq/i }));
    await user.type(screen.getByLabelText(/api key/i), "sk-live-123");
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    expect(set).not.toHaveBeenCalled();
  });
});
