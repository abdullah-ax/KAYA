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

async function walkOpening(user: User) {
  await user.click(screen.getByRole("radio", { name: "Student" }));
  await user.type(screen.getByRole("textbox"), "Pharmacy, 4th year");
  await next(user);
  await user.type(screen.getByRole("textbox"), "Cairo");
  await next(user);
  await user.click(screen.getByRole("checkbox", { name: /teaching or tutoring/i }));
  await user.type(screen.getByRole("textbox"), "They ask for my pharmacology sheets");
  await next(user);
  await user.type(screen.getByRole("textbox"), "About 40 pharmacy students from my tutoring sessions");
  await next(user);
  await user.click(screen.getByRole("radio", { name: /5–10/ }));
  await next(user);
  await user.click(screen.getByRole("radio", { name: /self-funded/i }));
  await next(user);
}

const live = (over = {}) => ({ provider: "openai" as const, modelKey: "sk-mem", onRun: vi.fn(), ...over });
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body);

describe("guided opening", () => {
  it("asks specific questions one per screen, with chips, and no vague first question", async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    expect(screen.getByText("What do you do most days?")).toBeInTheDocument();
    expect(screen.queryByText(/two or three sentences/i)).not.toBeInTheDocument();
    for (const chip of ["Student", "Employee", "Freelancer", "Run a business", "Between jobs"]) expect(screen.getByRole("radio", { name: chip })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next/i })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Student" }));
    await user.type(screen.getByRole("textbox"), "Pharmacy, 4th year");
    await next(user);

    expect(screen.getByText("Where are you based?")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", expect.stringMatching(/cairo|alexandria/i));
    await user.type(screen.getByRole("textbox"), "Cairo");
    await next(user);

    expect(screen.getByText("What do people already ask you to help with?")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /teaching or tutoring/i }));
    await user.type(screen.getByRole("textbox"), "They ask for my pharmacology sheets");
    await next(user);

    expect(screen.getByText("Which group could you message today, and about how many people are in it?")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", expect.stringMatching(/\d/));
    await user.type(screen.getByRole("textbox"), "About 40 pharmacy students from my tutoring sessions");
    await next(user);

    expect(screen.getByText("How many hours a week can you give this?")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /5–10/ }));
    await next(user);
    expect(screen.getByText("How do you want to fund it?")).toBeInTheDocument();
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
    expect(body.answers.map((x: { key: string }) => x.key)).toEqual(["role", "city", "help", "group", "time", "money"]);
    expect(body.answers[0]).toMatchObject({ question: "What do you do most days?", answer: "Student, Pharmacy, 4th year" });
    expect(body.answers[3].answer).toBe("About 40 pharmacy students from my tutoring sessions");
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
