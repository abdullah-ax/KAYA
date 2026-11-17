import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FIT_OPTIONS, StageMap } from "./stage-map";

async function open(props: Partial<React.ComponentProps<typeof StageMap>> = {}) {
  const user = userEvent.setup();
  const onNavigate = vi.fn();
  render(<StageMap current="validation" onNavigate={onNavigate} {...props} />);
  await user.click(screen.getByRole("button", { name: /open map/i }));
  return { user, onNavigate };
}
const pick = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) =>
  user.click(within(screen.getByRole("list", { name: /stages/i })).getByRole("button", { name }));

describe("map details button", () => {
  it("says You are here on the current stage instead of a dead Go to", async () => {
    await open();
    const panel = screen.getByRole("region", { name: /stage details/i });
    expect(within(panel).queryByRole("button", { name: /go to/i })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /you are here/i })).toBeDisabled();
  });

  it("disables stages that have no screen with a clear label", async () => {
    const { user } = await open({ canGo: (id) => id === "ideation" || id === "validation" });
    await pick(user, /^build/i);
    const panel = screen.getByRole("region", { name: /stage details/i });
    expect(within(panel).getByRole("button", { name: /not built yet/i })).toBeDisabled();
  });

  it("still goes to a stage that has a screen", async () => {
    const { user, onNavigate } = await open({ canGo: (id) => id === "ideation" || id === "validation" });
    await pick(user, /ideation/i);
    await user.click(screen.getByRole("button", { name: /go to ideation/i }));
    expect(onNavigate).toHaveBeenCalledWith("ideation");
  });
});

describe("map keyboard path", () => {
  it("leaves no focusable edges or nodes on the canvas: the outline is the keyboard path", async () => {
    await open();
    const canvas = document.querySelector(".react-flow") as HTMLElement;
    expect(canvas).not.toBeNull();
    expect(canvas.querySelectorAll(".react-flow__edge[tabindex], .react-flow__node[tabindex]")).toHaveLength(0);
  });

  it("fits the map so text stays readable", () => {
    expect(FIT_OPTIONS.minZoom).toBeGreaterThanOrEqual(0.8);
  });
});
