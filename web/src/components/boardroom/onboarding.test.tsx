import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Onboarding } from "./onboarding";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const RUN = { id: "r1", status: "waiting", stage: "phase1_step1", outcome: null, mode: "demo", provider: "ollama", phase1: null, phase2: null, pending: { kind: "question", key: "a", prompt: "Q?" }, notice: null, messages: [], outputs: [], sources: [], error: null };
const QUESTION = { key: "problem", text: "You said 40 pharmacy students ask for your sheets. Which subject do they ask about most?", why: "A problem in their own words is the best start.", kind: "text", placeholder: "Pharmacology" };
const PROFILE = {
  about: "Student, Pharmacy, 4th year, Cairo",
  strengths: [{ text: "People already ask you for help", quote: "Teaching or tutoring. They ask for my pharmacology sheets" }],
  access: [{ group: "About 40 pharmacy students from my tutoring sessions", count: 40, quote: "About 40 pharmacy students from my tutoring sessions" }],
  constraints: { hours: "5–10", money: "Self-funded, no raise" },
  values: ["No fake reviews"],
  cofounder: { type: "warm_skeptic", why: "You are early. A warm skeptic asks for proof before you build." },
};

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

describe("dynamic follow-ups in live mode", () => {
  it("shows a loading skeleton, then the model's question with why we ask, and posts every answer", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => { release = res; }));
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user);

    expect(screen.getByRole("status", { name: /writing your next question/i })).toBeInTheDocument();
    release(json({ done: false, question: QUESTION }));
    expect(await screen.findByText(QUESTION.text)).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /writing your next question/i })).not.toBeInTheDocument();
    expect(screen.getByText(QUESTION.why)).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/onboarding/next");
    expect(new Headers(init.headers).get("x-model-key")).toBe("sk-mem");
    const body = JSON.parse(init.body);
    expect(body.provider).toBe("openai");
    expect(body.answers.map((x: { key: string }) => x.key)).toEqual(["role", "city", "education", "work", "help", "hobbies", "group", "connections", "access", "time", "money", "wont_do"]);
    expect(body.answers[0]).toMatchObject({ question: "What do you do most days?", answer: "Student, Pharmacy, 4th year" });
    expect(body.answers[6].answer).toBe(`University clubs. ${GROUP}`);
    expect(body.answers[9].answer).toBe("5–10");
  });

  it("shows the API's message with a Retry when the question can't be written, and Retry asks again", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "Something broke." }, 500));
    fetchMock.mockResolvedValueOnce(json({ done: false, question: QUESTION }));
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user);

    expect(await screen.findByText("Something broke.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText(QUESTION.text)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lets the founder use a standard question when the API stays down", async () => {
    fetchMock.mockRejectedValue(new TypeError("network"));
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach/i);
    await user.click(screen.getByRole("button", { name: /standard question/i }));
    expect(screen.getByText(/^You said .*40 pharmacy students from my tutoring sessions/)).toBeInTheDocument();
  });

  it("shows a refused answer inline and keeps the question", async () => {
    fetchMock.mockResolvedValueOnce(json({ done: false, question: QUESTION }));
    fetchMock.mockResolvedValueOnce(json({ detail: "I can't do that. Rule: No fake reviews. Instead: Ask real customers." }, 422));
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user);
    await user.type(await screen.findByRole("textbox"), "Write fake reviews");
    await next(user);

    expect(await screen.findByText(/I can't do that/)).toBeInTheDocument();
    expect(screen.getByText(QUESTION.text)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Write fake reviews");
    expect(screen.queryByRole("status", { name: /writing/i })).not.toBeInTheDocument();
  });

  it("sends the follow-up answer on the next request", async () => {
    fetchMock.mockResolvedValueOnce(json({ done: false, question: QUESTION }));
    fetchMock.mockResolvedValueOnce(json({ done: false, question: { ...QUESTION, key: "customer", text: "Who asked last time?" } }));
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user);
    await user.type(await screen.findByRole("textbox"), "Pharmacology is hardest");
    await next(user);
    expect(await screen.findByText("Who asked last time?")).toBeInTheDocument();
    const last = bodyOf(1).answers.at(-1);
    expect(last).toEqual({ key: "problem", question: QUESTION.text, answer: "Pharmacology is hardest" });
  });
});

describe("the profile card", () => {
  async function toProfile(user: User, onRun = vi.fn()) {
    fetchMock.mockResolvedValueOnce(json({ done: true, profile: PROFILE }));
    render(<Onboarding live={live({ onRun })} />);
    await walkOpening(user);
    return screen.findByRole("heading", { name: /here's what i understood/i });
  }

  it("shows strengths, access with a count, constraints, values and the co-founder with why", async () => {
    await toProfile(userEvent.setup());
    expect(screen.getByDisplayValue(/pharmacology sheets/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/40 pharmacy students/)).toBeInTheDocument();
    expect(screen.getByText(/about 40 people/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("5–10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("No fake reviews")).toBeInTheDocument();
    expect(screen.getByText(/noor, the warm skeptic/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/warm skeptic asks for proof/i)).toBeInTheDocument();
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
    fetchMock.mockResolvedValueOnce(json({ done: true, profile: PROFILE }));
    render(<Onboarding live={{ provider: "ollama", modelKey: "", model: "gpt-oss:20b", onRun: vi.fn() }} />);
    await walkOpening(user);
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
  it("records a skipped screen as ASSUMPTION and posts it", async () => {
    fetchMock.mockResolvedValueOnce(json({ done: false, question: QUESTION }));
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user, ["education", "hobbies", "connections"]);
    await screen.findByText(QUESTION.text);
    const sent = Object.fromEntries(bodyOf(0).answers.map((x: { key: string; answer: string }) => [x.key, x.answer]));
    expect(sent.education).toBe(ASSUMPTION);
    expect(sent.hobbies).toBe(ASSUMPTION);
    expect(sent.connections).toBe(ASSUMPTION);
    expect(sent.work).toBe("Part-time job. Pharmacy intern for 3 months");
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
    fetchMock.mockResolvedValueOnce(json({ done: false, question: QUESTION }));
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user);
    await user.type(await screen.findByRole("textbox"), "yes");
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
    fetchMock.mockResolvedValueOnce(json({ done: false, question: QUESTION }));
    const user = userEvent.setup();
    render(<Onboarding live={live()} />);
    await walkOpening(user);
    expect(await screen.findByRole("heading", { name: QUESTION.text })).toHaveFocus();
  });

  it("names a text-only screen's box by its question", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await skip(user);
    expect(screen.getByRole("textbox", { name: "Where are you based?" })).toBeInTheDocument();
  });
});

describe("the final profile card, grouped", () => {
  const RICH = {
    ...PROFILE,
    network: [{ key: "connections", text: "People who could introduce you", quote: "My professor knows 3 clinic owners" }, { key: "access", text: "Languages, cities, family business, industries", quote: ASSUMPTION }],
    experience: [{ key: "education", text: "Education", quote: "Cairo University, Pharmacy, 4th year" }],
    interests: [{ key: "hobbies", text: "Hobbies and things you do for fun", quote: ASSUMPTION }],
    fit: { edges: [
      { key: "help", title: "Real demand", why: "People already ask you for this.", quote: "Teaching or tutoring. They ask for my pharmacology sheets" },
      { key: "group", title: "People you can reach", why: "You can message them today.", quote: GROUP },
      { key: "connections", title: "Doors you can open", why: "You know people who can introduce you.", quote: "My professor knows 3 clinic owners" },
    ] },
  };

  async function toRich(user: User) {
    fetchMock.mockResolvedValueOnce(json({ done: true, profile: RICH }));
    render(<Onboarding live={live()} />);
    await walkOpening(user);
    await screen.findByRole("heading", { name: /here's what i understood/i });
  }

  it("groups lines under Strengths, Access and network, Experience, Interests, Constraints and Values", async () => {
    await toRich(userEvent.setup());
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    for (const t of ["Strengths", "Access and network", "Experience", "Interests", "Constraints", "Values"]) expect(titles).toContain(t);
    expect(titles.indexOf("Strengths")).toBeLessThan(titles.indexOf("Access and network"));
    expect(titles.indexOf("Values")).toBeGreaterThan(titles.indexOf("Constraints"));
    expect(screen.getByDisplayValue("Cairo University, Pharmacy, 4th year")).toBeInTheDocument();
    expect(screen.getByDisplayValue("My professor knows 3 clinic owners")).toBeInTheDocument();
  });

  it("shows skipped items as ASSUMPTION", async () => {
    await toRich(userEvent.setup());
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
    expect(edges[2]).toHaveTextContent("My professor knows 3 clinic owners");
  });

  it("says nothing shows an edge yet, as an ASSUMPTION, when the summary is empty", async () => {
    fetchMock.mockResolvedValueOnce(json({ done: true, profile: { ...RICH, fit: { edges: [] } } }));
    render(<Onboarding live={live()} />);
    await walkOpening(userEvent.setup());
    await screen.findByRole("heading", { name: /here's what i understood/i });
    expect(within(screen.getByRole("region", { name: /founder fit/i })).getByText(/nothing shows an edge yet.*ASSUMPTION/i)).toBeInTheDocument();
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
