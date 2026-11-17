import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Onboarding } from "./onboarding";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const RUN = { id: "r1", status: "waiting", stage: "phase1_step1", outcome: null, mode: "demo", provider: "ollama", phase1: null, phase2: null, pending: { kind: "question", key: "a", prompt: "Q?" }, notice: null, messages: [], outputs: [], sources: [], error: null };

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

type User = ReturnType<typeof userEvent.setup>;
const next = (user: User) => user.click(screen.getByRole("button", { name: /^next/i }));

const ASSUMPTION = "ASSUMPTION: not answered yet";
const GROUP = "About 40 pharmacy students from my tutoring sessions";
const skip = (user: User) => user.click(screen.getByRole("button", { name: /skip for now/i }));

/** One screen: optional chip, optional text, then Next. */
async function fill(user: User, chip: { role: "radio" | "checkbox"; name: string | RegExp } | null, text?: string) {
  if (chip) await user.click(screen.getByRole(chip.role, { name: chip.name }));
  if (text) { await user.click(screen.getByRole("textbox")); await user.paste(text); }
  await next(user);
}

async function walkOpening(user: User, skipped: string[] = []) {
  const steps: [string, { role: "radio" | "checkbox"; name: string | RegExp } | null, string?][] = [
    ["role", { role: "radio", name: "Student" }, "Pharmacy, 4th year"],
    ["city", null, "Cairo"],
    ["education", { role: "radio", name: "University" }, "Cairo University, Pharmacy, 4th year"],
    ["work", { role: "checkbox", name: "Part-time job" }, "Pharmacy intern for 3 months"],
    ["help", { role: "checkbox", name: /teaching or tutoring/i }, "They ask for my pharmacology sheets"],
    ["hobbies", { role: "checkbox", name: "Drawing or design" }, "Friends ask me to draw their posters"],
    ["group", { role: "checkbox", name: "University clubs" }, GROUP],
    ["connections", { role: "checkbox", name: "A teacher or professor" }, "My professor knows 3 clinic owners"],
    ["access", { role: "checkbox", name: "Arabic" }, "I know Cairo and Giza"],
    ["time", { role: "radio", name: /5–10/ }],
    ["money", { role: "radio", name: /self-funded/i }],
    ["wont_do", { role: "checkbox", name: "Fake reviews" }, "No exaggerated claims"],
  ];
  for (const [id, chip, text] of steps) {
    if (skipped.includes(id)) await skip(user);
    else await fill(user, chip, text);
  }
}

async function answerFollowUps(user: User) {
  for (let n = 0; n < 4; n++) {
    await user.type(screen.getByRole("textbox"), `answer number ${n}`);
    await next(user);
  }
}

const live = (over = {}) => ({ provider: "openai" as const, modelKey: "sk-mem", onRun: vi.fn(), ...over });
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body);

describe("guided opening", () => {
  it("asks twelve specific questions, one per screen, with chips and optional own words", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    expect(screen.getByRole("heading", { name: "What do you do most days?" })).toBeInTheDocument();
    expect(screen.queryByText(/two or three sentences/i)).not.toBeInTheDocument();
    for (const chip of ["Student", "Employee", "Freelancer", "Run a business", "Between jobs"]) expect(screen.getByRole("radio", { name: chip })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next/i })).toBeDisabled();

    const screens: [string, "radio" | "checkbox" | null, string | RegExp | null][] = [
      ["Where are you based?", null, "Cairo"],
      ["What did you study, or what are you studying?", "radio", "University"],
      ["What jobs or side jobs have you done?", "checkbox", "Part-time job"],
      ["What do people already ask you to help with?", "checkbox", /teaching or tutoring/i],
      ["What do you do for fun that other people notice?", "checkbox", "Sports"],
      ["Which groups are you part of, and about how many people are in each?", "checkbox", "Mosque or church"],
      ["Who could introduce you to customers or experts?", "checkbox", "A family friend"],
      ["Which languages, cities and doors do you have?", "checkbox", "English"],
      ["How many hours a week can you give this?", "radio", /5–10/],
      ["How much money can you risk, and how do you want to fund it?", "radio", /self-funded/i],
      ["What would you never do, even for money?", "checkbox", "Fake reviews"],
    ];
    await user.click(screen.getByRole("radio", { name: "Student" }));
    await next(user);
    for (const [q, kind, chip] of screens) {
      expect(screen.getByRole("heading", { name: q })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /skip for now/i })).toBeInTheDocument();
      if (kind) await user.click(screen.getByRole(kind, { name: chip! }));
      else await user.type(screen.getByRole("textbox"), chip as string);
      await next(user);
    }
    expect(screen.getByText("13 of 16")).toBeInTheDocument();
  });

  it("shows a progress bar and an own-words box with an example on the chip screens", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Student" }));
    expect(screen.getByRole("textbox", { name: /your field/i })).toHaveAttribute("placeholder", expect.stringMatching(/pharmacy/i));
    await next(user);
    await user.type(screen.getByRole("textbox"), "Cairo");
    await next(user);
    expect(screen.getByRole("textbox", { name: /school, subject and year/i })).toBeInTheDocument();
  });

  it("Back returns to the earlier answer", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.click(screen.getByRole("radio", { name: "Student" }));
    await next(user);
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByRole("radio", { name: "Student" })).toBeChecked();
  });
});

describe("live mode asks every question in the browser", () => {
  it("asks the standard follow-ups with why we ask, and makes no request before Start", async () => {
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user);
    expect(screen.getByText(/^You said .*40 pharmacy students from my tutoring sessions/)).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /writing your next question/i })).not.toBeInTheDocument();
    await answerFollowUps(user);
    await screen.findByRole("heading", { name: /here's what i understood/i });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends every answer, follow-ups included, in the brief when the run starts", async () => {
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user);
    await answerFollowUps(user);
    await screen.findByRole("heading", { name: /here's what i understood/i });
    fetchMock.mockResolvedValueOnce(json(RUN, 201));
    await user.click(screen.getByRole("button", { name: /^start/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/runs");
    const brief: string = bodyOf(0).brief;
    for (let n = 0; n < 4; n++) expect(brief).toContain(`answer number ${n}`);
    expect(brief).toContain("Pharmacy intern for 3 months");
  });
});

describe("the profile card", () => {
  async function toProfile(user: User, onRun = vi.fn()) {
    render(<Onboarding live={live({ onRun })} />);
    await walkOpening(user);
    await answerFollowUps(user);
    return screen.findByRole("heading", { name: /here's what i understood/i });
  }

  it("shows strengths, access with a count, constraints, values and the co-founder with why", async () => {
    await toProfile(userEvent.setup());
    expect(screen.getByDisplayValue(/pharmacology sheets/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/40 pharmacy students/)).toBeInTheDocument();
    expect(screen.getByText(/about 40 people/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("5–10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Fake reviews. No exaggerated claims")).toBeInTheDocument();
    expect(screen.getByText(/noor, the warm skeptic/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/asks for proof/i)).toBeInTheDocument();
  });

  it("Start posts a brief with the edited lines and hands the run on", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    await toProfile(user, onRun);
    const strength = screen.getByRole("textbox", { name: /strength 1/i });
    await user.clear(strength);
    await user.type(strength, "I make exam sheets that people print");
    fetchMock.mockResolvedValueOnce(json(RUN, 201));
    await user.click(screen.getByRole("button", { name: /^start/i }));

    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/runs")!;
    const body = JSON.parse(call[1].body);
    expect(body.provider).toBe("openai");
    expect(body.brief).toContain("I make exam sheets that people print");
    expect(body.brief).not.toContain("pharmacology sheets");
    expect(body.brief).toContain("40 pharmacy students");
    expect(call[1].body).not.toContain("sk-mem");
    expect(new Headers(call[1].headers).get("x-model-key")).toBe("sk-mem");
    await vi.waitFor(() => expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" })));
  });

  it("starts on the local model the founder picked", async () => {
    const user = userEvent.setup();
    render(<Onboarding live={{ provider: "ollama", modelKey: "", model: "gpt-oss:20b", onRun: vi.fn() }} />);
    await walkOpening(user);
    await answerFollowUps(user);
    await screen.findByRole("heading", { name: /here's what i understood/i });
    fetchMock.mockResolvedValueOnce(json(RUN, 201));
    await user.click(screen.getByRole("button", { name: /^start/i }));
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body).model).toBe("gpt-oss:20b");
  });

  it("shows the API's message and stays on the card when the run can't start", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    await toProfile(user, onRun);
    fetchMock.mockResolvedValueOnce(json({ detail: "An API key is needed for that provider." }, 422));
    await user.click(screen.getByRole("button", { name: /^start/i }));
    expect(await screen.findByText("An API key is needed for that provider.")).toBeInTheDocument();
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^start/i })).toBeEnabled();
  });
});

describe("offline demo mode (no API)", () => {
  it("asks standard questions built from the founder's words, makes no request, and ends on the profile", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<Onboarding onDone={onDone} />);
    await walkOpening(user);

    expect(screen.getByText(/^You said .*40 pharmacy students from my tutoring sessions/)).toBeInTheDocument();
    for (let n = 0; n < 4; n++) {
      await user.type(screen.getByRole("textbox"), `answer number ${n}`);
      await next(user);
    }
    const card = await screen.findByRole("heading", { name: /here's what i understood/i });
    expect(card).toBeInTheDocument();
    expect(within(document.body).getByText(/about 40 people/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^start/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });
});

describe("voice dictation on free-text answers", () => {
  it("puts the spoken words into the answer box for editing and does not move on", async () => {
    class Rec {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {}
      stop() { this.onresult?.({ results: [[{ transcript: "Pharmacy" }]] }); this.onend?.(); }
      abort() {}
    }
    vi.stubGlobal("SpeechRecognition", Rec);
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.click(screen.getByRole("radio", { name: "Student" }));
    await user.click(screen.getByRole("button", { name: /start voice input/i }));
    await user.click(await screen.findByRole("button", { name: /stop voice input/i }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("Pharmacy"));
    expect(screen.getByText("What do you do most days?")).toBeInTheDocument();
  });

  it("shows no mic when the browser cannot record or recognise speech", () => {
    render(<Onboarding />);
    expect(screen.queryByRole("button", { name: /start voice input/i })).not.toBeInTheDocument();
  });
});

describe("skip for now", () => {
  it("records a skipped screen as ASSUMPTION on the card and leaves it out of the brief", async () => {
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user, ["education", "hobbies", "connections"]);
    await answerFollowUps(user);
    await screen.findByRole("heading", { name: /here's what i understood/i });
    expect(screen.getByRole("textbox", { name: /^education/i })).toHaveValue(ASSUMPTION);
    fetchMock.mockResolvedValueOnce(json(RUN, 201));
    await user.click(screen.getByRole("button", { name: /^start/i }));
    const brief: string = bodyOf(0).brief;
    expect(brief).not.toContain("ASSUMPTION");
    expect(brief).toContain("Part-time job. Pharmacy intern for 3 months");
  });

  it("needs no answer on the screen and moves straight on", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await skip(user);
    expect(screen.getByRole("heading", { name: "Where are you based?" })).toBeInTheDocument();
  });

  it("shows ASSUMPTION in the sidebar without quotes, and a founder who skips everything still reaches the card", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await skip(user);
    const side = screen.getByRole("complementary");
    expect(within(side).getByText(/ASSUMPTION/)).toBeInTheDocument();
    expect(side.textContent).not.toMatch(/“ASSUMPTION/);
    for (let n = 0; n < 11; n++) await skip(user);
    for (let n = 0; n < 4; n++) {
      await user.type(screen.getByRole("textbox"), `answer number ${n}`);
      await next(user);
    }
    await screen.findByRole("heading", { name: /here's what i understood/i });
    expect(screen.getAllByText(/ASSUMPTION/).length).toBeGreaterThan(3);
  });
});

describe("what I know about you", () => {
  it("shows choice answers plain and own words in quotes", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.click(screen.getByRole("radio", { name: "Student" }));
    await user.type(screen.getByRole("textbox"), "Pharmacy");
    await next(user);
    const side = screen.getByRole("complementary");
    expect(within(side).getByRole("heading", { name: /what i know about you/i })).toBeInTheDocument();
    expect(side.textContent).toContain("Student");
    expect(side.textContent).not.toContain("“Student");
    expect(side.textContent).toContain("“Pharmacy”");
    expect(within(side).queryByText(/your answers so far/i)).not.toBeInTheDocument();
  });

  it("shows a chip-only answer with no quotes at all", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.click(screen.getByRole("radio", { name: "Employee" }));
    await next(user);
    expect(screen.getByRole("complementary").textContent).not.toMatch(/[“”]/);
  });
});

describe("answer checks use plain words", () => {
  it("says 'Tell me in a few more words.' for a bare follow-up answer, never 'isn't a reason'", async () => {
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user);
    await user.type(screen.getByRole("textbox"), "yes");
    expect(screen.getByText("Tell me in a few more words.")).toBeInTheDocument();
    expect(screen.queryByText(/isn't a reason/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next/i })).toBeDisabled();
  });
});

describe("accessibility", () => {
  it("labels a choice group by the real id of the question heading", () => {
    render(<Onboarding />);
    const group = screen.getByRole("radiogroup");
    const heading = screen.getByRole("heading", { name: "What do you do most days?" });
    expect(heading.id).not.toBe("");
    expect(group).toHaveAttribute("aria-labelledby", heading.id);
    expect(document.getElementById(heading.id)).toBe(heading);
    expect(screen.getByRole("radiogroup", { name: "What do you do most days?" })).toBe(group);
  });

  it("moves between radios with the arrow keys and selects as it goes", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.click(screen.getByRole("radio", { name: "Student" }));
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Employee" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Employee" })).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("radio", { name: "Between jobs" })).toBeChecked();
  });

  it("uses a labelled group of real checkboxes, with arrow keys to move and space to tick", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await skip(user);
    await skip(user);
    await skip(user);
    const group = screen.getByRole("group", { name: "What jobs or side jobs have you done?" });
    const boxes = within(group).getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(3);
    await user.click(boxes[0]);
    expect(boxes[0]).toBeChecked();
    await user.keyboard("{ArrowDown}");
    expect(boxes[1]).toHaveFocus();
    await user.keyboard(" ");
    expect(boxes[1]).toBeChecked();
    expect(boxes[0]).toBeChecked();
    await user.keyboard("{ArrowUp}");
    expect(boxes[0]).toHaveFocus();
  });

  it("moves focus to the new question heading after Next and Skip", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.click(screen.getByRole("radio", { name: "Student" }));
    await next(user);
    expect(screen.getByRole("heading", { name: "Where are you based?" })).toHaveFocus();
    await skip(user);
    expect(screen.getByRole("heading", { name: "What did you study, or what are you studying?" })).toHaveFocus();
  });

  it("moves focus to the follow-up question heading too", async () => {
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user);
    expect(screen.getByRole("heading", { level: 1, name: /^You said/ })).toHaveFocus();
  });

  it("names a text-only screen's box by its question", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await skip(user);
    expect(screen.getByRole("textbox", { name: "Where are you based?" })).toBeInTheDocument();
  });
});

describe("the final profile card, grouped", () => {
  async function toRich(user: User, skipped: string[] = []) {
    render(<Onboarding live={live()} />);
    await walkOpening(user, skipped);
    await answerFollowUps(user);
    await screen.findByRole("heading", { name: /here's what i understood/i });
  }

  it("groups lines under Strengths, Access and network, Experience, Interests, Constraints and Values", async () => {
    await toRich(userEvent.setup());
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    for (const t of ["Strengths", "Access and network", "Experience", "Interests", "Constraints", "Values"]) expect(titles).toContain(t);
    expect(titles.indexOf("Strengths")).toBeLessThan(titles.indexOf("Access and network"));
    expect(titles.indexOf("Values")).toBeGreaterThan(titles.indexOf("Constraints"));
    expect(screen.getByDisplayValue(/Cairo University, Pharmacy, 4th year/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/My professor knows 3 clinic owners/)).toBeInTheDocument();
  });

  it("shows skipped items as ASSUMPTION", async () => {
    await toRich(userEvent.setup(), ["hobbies", "access"]);
    expect(screen.getByRole("textbox", { name: /hobbies and things you do for fun/i })).toHaveValue(ASSUMPTION);
    expect(screen.getByRole("textbox", { name: /languages, cities/i })).toHaveValue(ASSUMPTION);
  });

  it("shows the founder-fit summary: three edges, each pointing to the answer that shows it", async () => {
    await toRich(userEvent.setup());
    const fit = screen.getByRole("region", { name: /founder fit/i });
    const edges = within(fit).getAllByRole("listitem");
    expect(edges).toHaveLength(3);
    expect(edges[0]).toHaveTextContent("Real demand");
    expect(edges[0]).toHaveTextContent("From your answer");
    expect(edges[0]).toHaveTextContent("They ask for my pharmacology sheets");
  });

  it("puts the extra groups into the brief it starts the run with", async () => {
    const user = userEvent.setup();
    await toRich(user);
    fetchMock.mockResolvedValueOnce(json(RUN, 201));
    await user.click(screen.getByRole("button", { name: /^start/i }));
    const body = JSON.parse(fetchMock.mock.calls.find((c) => c[0] === "/api/runs")![1].body);
    expect(body.brief).toContain("Cairo University, Pharmacy, 4th year");
    expect(body.brief).toContain("My professor knows 3 clinic owners");
    expect(body.brief).not.toContain("ASSUMPTION");
  });
});

describe("offline fallback, aimed at skipped areas", () => {
  it("asks about the area the founder skipped first", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await walkOpening(user, ["hobbies"]);
    expect(screen.getByRole("heading", { name: /what do you do for fun that other people notice\? what do they say\?/i })).toBeInTheDocument();
  });
});
