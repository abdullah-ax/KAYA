import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StageMap } from "./stage-map";

function setup() {
  const onNavigate = vi.fn();
  const user = userEvent.setup();
  render(<StageMap current="validation" onNavigate={onNavigate} />);
  return { user, onNavigate };
}

describe("StageMap", () => {
  it("is closed until the map button is pressed", async () => {
    const { user } = setup();
    expect(screen.queryByRole("dialog", { name: /founder map/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open map/i }));
    expect(screen.getByRole("dialog", { name: /founder map/i })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /open map/i }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /founder map/i })).not.toBeInTheDocument();
  });

  it("shows the current stage's details on open", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /open map/i }));
    const panel = screen.getByRole("region", { name: /stage details/i });
    expect(within(panel).getByRole("heading", { name: "Validation" })).toBeInTheDocument();
    expect(within(panel).getByText(/under 30% of target/i)).toBeInTheDocument();
  });

  it("dims stages the picked agent can't touch", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /open map/i }));
    await user.click(screen.getByRole("combobox", { name: /agents/i }));
    await user.click(screen.getByRole("option", { name: /hustler/i }));
    const list = screen.getByRole("list", { name: /stages/i });
    expect(within(list).getByRole("button", { name: /distribution/i })).not.toHaveAttribute("data-dimmed");
    expect(within(list).getByRole("button", { name: /ideation/i })).toHaveAttribute("data-dimmed", "true");
  });

  it("navigates to a stage from its details", async () => {
    const { user, onNavigate } = setup();
    await user.click(screen.getByRole("button", { name: /open map/i }));
    const list = screen.getByRole("list", { name: /stages/i });
    await user.click(within(list).getByRole("button", { name: /ideation/i }));
    await user.click(screen.getByRole("button", { name: /go to ideation/i }));
    expect(onNavigate).toHaveBeenCalledWith("ideation");
    expect(screen.queryByRole("dialog", { name: /founder map/i })).not.toBeInTheDocument();
  });

  it("won't navigate into a locked stage", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /open map/i }));
    const list = screen.getByRole("list", { name: /stages/i });
    await user.click(within(list).getByRole("button", { name: /distribution/i }));
    expect(screen.getByRole("button", { name: /locked/i })).toBeDisabled();
  });
});
