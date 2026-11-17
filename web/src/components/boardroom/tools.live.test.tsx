import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { GateDecision, GateSubmitContext } from "./tools";

const args = {
  question: "Which opportunity do you pick?",
  recommended: [],
  options: [
    { id: "option_1", label: "Cheat sheets", body: "Source: S1", cost: "$0", risk: "low" },
    { id: "option_2", label: "Stop here", body: "Source: none", cost: "$0", risk: "none" },
  ],
};
const GOOD = "I picked this because forty students already ask me for these sheets every single term";

function setup(submit = vi.fn().mockResolvedValue(undefined)) {
  const user = userEvent.setup();
  render(<GateSubmitContext.Provider value={submit}><GateDecision args={args} /></GateSubmitContext.Provider>);
  return { user, submit };
}

describe("live gate card", () => {
  it("shows the real options and no demo badge", () => {
    setup();
    expect(screen.getByRole("radio", { name: /cheat sheets/i })).toBeInTheDocument();
    expect(screen.getByText(/stop here/i)).toBeInTheDocument();
    expect(screen.queryByText(/demo data/i)).not.toBeInTheDocument();
  });

  it("posts the option name and the founder's reason", async () => {
    const { user, submit } = setup();
    await user.click(screen.getByRole("radio", { name: /cheat sheets/i }));
    await user.type(screen.getByRole("textbox"), GOOD);
    await user.click(screen.getByRole("button", { name: /confirm decision/i }));
    expect(submit).toHaveBeenCalledWith("Cheat sheets", GOOD);
    expect(await screen.findByText(/decision recorded/i)).toBeInTheDocument();
  });

  it("shows the API's 422 message inline in the reason field and lets the founder retry", async () => {
    const submit = vi.fn().mockRejectedValueOnce(new ApiError(422, "Tell us why in your own words, not just yes.")).mockResolvedValue(undefined);
    const { user } = setup(submit);
    await user.click(screen.getByRole("radio", { name: /cheat sheets/i }));
    await user.type(screen.getByRole("textbox"), GOOD);
    await user.click(screen.getByRole("button", { name: /confirm decision/i }));
    const msg = await screen.findByText("Tell us why in your own words, not just yes.");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(msg.closest("[aria-live]")).not.toBeNull();
    expect(screen.queryByText(/decision recorded/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirm decision/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  });

  it("never sends a bare yes: the button stays off and the handler refuses", async () => {
    const { user, submit } = setup();
    await user.click(screen.getByRole("radio", { name: /cheat sheets/i }));
    await user.type(screen.getByRole("textbox"), "yes");
    const button = screen.getByRole("button", { name: /confirm decision/i });
    expect(button).toBeDisabled();
    await user.click(button);
    await user.type(screen.getByRole("textbox"), "{Enter}");
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText(/isn't a reason/i)).toBeInTheDocument();
  });

  it("shows a network failure as a plain message, not a crash", async () => {
    const { user } = setup(vi.fn().mockRejectedValue(new TypeError("down")));
    await user.click(screen.getByRole("radio", { name: /cheat sheets/i }));
    await user.type(screen.getByRole("textbox"), GOOD);
    await user.click(screen.getByRole("button", { name: /confirm decision/i }));
    expect(await screen.findByText(/couldn't send/i)).toBeInTheDocument();
  });
});
