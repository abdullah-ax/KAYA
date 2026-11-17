/* Demo-mode example cards for the "This week" panel. EXAMPLE text for the demo screens only;
   a live run gets its card from GET /runs/{id}/program. Links are the checked ones in data.ts. */

import type { ProgramCardData } from "@/lib/api";
import type { ScreenId } from "./data";

const AIRBNB = { company: "Airbnb", market: "Global unicorn", fact: "The founders went door to door in New York, recruiting hosts and taking professional photos of their apartments themselves.", url: "https://paulgraham.com/ds.html", source: "Paul Graham", why: "Weak numbers? Go to the users and fix the offer by hand." };

export const DEMO_PROGRAM: Record<"ideation" | "validation" | "operate", ProgramCardData> = {
  ideation: {
    stage: "ideation",
    label: "Ideation",
    goal: "Pick one problem you know well, from people you can reach.",
    lead: { id: "profiler", name: "Profiler" },
    handoff: "The Profiler starts by learning who you are, so the ideas fit you.",
    joins: [{ id: "intern", name: "Research intern", when: "finds sources for each idea" }],
    big_question: "If this worked perfectly, how many people could it help in a year, and who are they?",
    questions: [
      "What do people in your WhatsApp group of 40 students keep asking you for help with?",
      "Where does your English speaking already help someone you know?",
      "Which problem with exam stress have you lived yourself?",
    ],
    do_today: "Write down 3 problems you have seen up close. Next to each, name one person who has it.",
    ship: "A one-page list of 2 or 3 idea spaces, shared with one person you trust, by day 3.",
    metric: { name: "Problems you can name with a real person who has each one", target: "A number you set before you start, for example 3 of 3." },
    review: "Two or more problems with a real person each means go. One means repeat. None means pick a new space.",
    learn: { kind: "Essay", org: "Paul Graham", title: "How to Get Startup Ideas", url: "https://paulgraham.com/startupideas.html", why: "Problems you live with beat ideas you invent." },
    case: { company: "Nafham", market: "Egypt, edtech", fact: "Free, crowdsourced lessons for Egyptian school (K-12) curricula. Tyro agreed to buy it in November 2021.", url: "https://cairoscene.com/Business/Tyro-Acquires-Fellow-Egyptian-Edtech-Startup-Nafham", source: "CairoScene", why: "It started from one exact need that students in Egypt already had." },
  },
  validation: {
    stage: "validation",
    label: "Validation",
    goal: "Get proof from strangers before you build anything.",
    lead: { id: "warm_skeptic", name: "Noor" },
    handoff: "Noor takes over to help you test the idea with real people before you build.",
    joins: [{ id: "hustler", name: "Hustler", when: "writes your outreach messages" }],
    big_question: "If this worked, who else would want it in a year, and how would they hear about it?",
    questions: [
      "Who outside your microbus riders have you talked to about this?",
      "When did someone last struggle with finding the right route in front of you?",
      "What would you need to see from strangers to believe your idea?",
    ],
    do_today: "Message 10 people you do not know. Ask about the last time they had this problem. Do not pitch.",
    ship: "A sign-up page, published only after you approve it, within 7 days.",
    metric: { name: "Sign-ups from strangers in 14 days", target: "A number you set before you start. Write it down first." },
    review: "Under 30% of your target means stop or pivot. Near it means repeat. At or above it means go.",
    learn: { kind: "Essay", org: "Paul Graham", title: "Do Things That Don't Scale", url: "https://paulgraham.com/ds.html", why: "Recruit the first users by hand, one at a time." },
    case: AIRBNB,
  },
  operate: {
    stage: "operate",
    label: "Operate and learn",
    goal: "Check your numbers every week, then repeat, pivot, or stop on evidence.",
    lead: { id: "warm_skeptic", name: "Noor" },
    handoff: "Noor is back to read your weekly numbers with you and decide what comes next.",
    joins: [{ id: "shark_numbers", name: "Numbers shark", when: "asks hard questions in a simulation" }],
    big_question: "What do you know about this problem now that most people do not?",
    questions: [
      "What did your grandmother's recipe fans do this week that surprised you?",
      "What did you learn about cooking for big families from real use?",
      "What is one thing about family recipes you would change after what you saw?",
    ],
    do_today: "Write 3 lines for your weekly update. What shipped, the number, and what is next.",
    ship: "Your weekly update, sent to one person who will be honest with you.",
    metric: { name: "People who came back and used it again this week", target: "A number you set before you start, for example 5 of 10." },
    review: "At or above target means keep going. Under target means repeat, pivot, or stop.",
    learn: { kind: "Essay", org: "YC Startup Library", title: "YC's essential startup advice", url: "https://www.ycombinator.com/library/4D-yc-s-essential-startup-advice", why: "The short list of advice YC repeats to every founder." },
    case: { company: "Breadfast", market: "Egypt, YC company", fact: "In 2017 it only delivered fresh bakery each morning. In its first months: more than 1,000 orders, and over 90% of customers came back.", url: "https://www.menabytes.com/breadfast-egypt/", source: "MENAbytes, September 2017", why: "Prove people come back before you grow." },
  },
};

/** Which demo card goes with each demo screen. */
export function demoProgramFor(screen: ScreenId): ProgramCardData {
  if (screen === "intake" || screen === "cofounder") return DEMO_PROGRAM.ideation;
  if (screen === "gate") return DEMO_PROGRAM.validation;
  return DEMO_PROGRAM.operate;
}
