import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Boardroom } from "./boardroom";
import { LiveRoster } from "./live";
import { Onboarding } from "./onboarding";
import { PublishCard } from "./publish-card";
import { RosterItem } from "./ui";
import type { Run } from "@/lib/api";

const run = (over: Partial<Run> = {}): Run => ({
  id: "r1", status: "approved" as never, stage: "phase2_step2", outcome: null, mode: "demo", provider: "ollama", phase1: null, phase2: null,
  pending: null, notice: null, messages: [], outputs: [], sources: [], error: null, delivery: { approved: true, url: null, site_id: null }, ...over,
});

describe("controls that do something", () => {
  it("renders a roster item without an action as plain content, not a button", () => {
    render(<RosterItem id="warm_skeptic" name="Noor" role="Co-founder" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Noor")).toBeInTheDocument();
  });

  it("still renders a button when there is an action", async () => {
    const onSelect = vi.fn();
    render(<RosterItem id="warm_skeptic" name="Noor" role="Co-founder" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /noor/i }));
    expect(onSelect).toHaveBeenCalled();
  });

  it("has no buttons in the live roster", () => {
    render(<LiveRoster run={null} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("has no hold-to-talk mic on onboarding and no A, B, C letter badges", () => {
    render(<Onboarding />);
    expect(screen.queryByRole("button", { name: /hold to talk/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^[ABC]$/)).not.toBeInTheDocument();
  });
});

describe("publish card", () => {
  it("is never labelled STUBBED for a connected run, even in the short demo mode", () => {
    render(<PublishCard run={run({ mode: "demo" })} />);
    expect(screen.queryByText(/stubbed/i)).not.toBeInTheDocument();
  });
  it("is labelled STUBBED when the app is not connected to the API", () => {
    render(<PublishCard run={run({ mode: "full" })} connected={false} />);
    expect(screen.getByText(/stubbed/i)).toBeInTheDocument();
  });
});

describe("mock chrome", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => vi.unstubAllGlobals());

  it("hides the mock screen picker while checking and for a connected app", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    render(<Boardroom initialScreen="gate" />);
    expect(screen.queryByRole("combobox", { name: /mock screen/i })).not.toBeInTheDocument();
    await screen.findByText("What do you do most days?");
    expect(screen.queryByRole("combobox", { name: /mock screen/i })).not.toBeInTheDocument();
  });

  it("shows the picker with dev=1 even before the API answers", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<Boardroom initialScreen="gate" dev />);
    expect(screen.getByRole("combobox", { name: /mock screen/i })).toBeInTheDocument();
  });

  it("shows the picker when the API is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("down"));
    render(<Boardroom initialScreen="gate" />);
    expect(await screen.findByRole("combobox", { name: /mock screen/i })).toBeInTheDocument();
  });
});
