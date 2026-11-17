import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Boardroom } from "./boardroom";

describe("Boardroom shell", () => {
  it("puts the map button first in the top bar and drops the old stage strip", () => {
    render(<Boardroom initialScreen="gate" />);
    const bar = screen.getByRole("banner");
    const buttons = within(bar).getAllByRole("button");
    expect(buttons[0]).toHaveAccessibleName(/open map/i);
    expect(screen.queryByRole("button", { name: /^map$/i })).not.toBeInTheDocument();
  });

  it("shows where you are as a breadcrumb", () => {
    render(<Boardroom initialScreen="gate" />);
    const crumbs = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(crumbs).getByText("Validation")).toBeInTheDocument();
    expect(within(crumbs).getByText(/gate/i)).toBeInTheDocument();
  });

  it("navigates from the map to a stage", async () => {
    const user = userEvent.setup();
    render(<Boardroom initialScreen="gate" />);
    await user.click(screen.getByRole("button", { name: /open map/i }));
    await user.click(within(screen.getByRole("list", { name: /stages/i })).getByRole("button", { name: /ideation/i }));
    await user.click(screen.getByRole("button", { name: /go to ideation/i }));
    expect(within(screen.getByRole("navigation", { name: /breadcrumb/i })).getByText("Ideation")).toBeInTheDocument();
  });
});
