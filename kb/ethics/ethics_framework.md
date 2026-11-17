---
title: Ethics framework for the ethics bot
url: https://www.scu.edu/ethics/ethics-resources/ethical-decision-making/thinking-ethically/
author: our notes from the sources below
license: our notes; not legal advice
phases: [1, 2, 3, 4, 5, 6]
agents: [ethics_bot, judges]
type: checklist
---

# Ethics framework

The ethics bot uses this file. It is not legal advice. When a law might apply, it says so and suggests a lawyer.

## 1. Hard lines (always block)

These match the hackathon rules and these sources:

- **Fake reviews, testimonials, followers, or views.** The US FTC's 2024 rule bans fake reviews and testimonials, including AI-generated ones, and bans buying or selling fake social media influence such as bot followers or views ([FTC](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials)).
- **Paying for reviews that say something positive or negative**, undisclosed insider reviews, and threats to suppress bad reviews (same rule; [Orrick summary](https://infobytes.orrick.com/2024-08-23/ftc-announces-final-rule-prohibiting-fake-reviews-and-testimonials/)).
- **Fake scarcity and fake countdown timers.** The FTC's 2022 dark patterns report lists these under design that creates false beliefs ([Hunton summary](https://www.huntonprivacyblog.com/2022/09/27/ftc-releases-report-on-dark-patterns/)).
- Income promises, impersonation, moving money, storing passwords or card numbers, excluded product types (hackathon rules).

## 2. Manipulative design (block or fix)

From the FTC's 2022 report "Bringing Dark Patterns to Light":

- Creating false beliefs: fake scarcity, countdowns, ads made to look like news ([National Law Review](https://natlawreview.com/article/ftc-releases-report-dark-patterns)).
- Hiding or delaying important information: fees left out of the shown price or revealed late ([Hunton](https://www.huntonprivacyblog.com/2022/09/27/ftc-releases-report-on-dark-patterns/)).
- Design that leads to charges people didn't agree to ([National Law Review](https://natlawreview.com/article/ftc-releases-report-dark-patterns)).
- Confusing or hidden privacy choices ([National Law Review](https://natlawreview.com/node/174106/printable/print)).
- Extra care when selling to children, teens, older adults, or people reading in a second language ([WilmerHale](https://wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20220921-ftc-issues-dark-pattern-guidance)).

## 3. Egypt (flag for a lawyer; never give legal advice)

- **Personal Data Protection Law No. 151 of 2020.** Covers collecting, processing, storing, and transferring personal data ([Clym](https://regulations.clym.io/law-no-151-of-2020-egypt)). It's modeled on the EU's GDPR ([Global Compliance News](https://www.globalcompliancenews.com/?p=23826)). Sending data out of Egypt may need a license or approval ([Andersen](https://eg.andersen.com/data-protection-egypt-law/)). Rule for us: any product that collects names, phones, or emails needs a privacy notice and consent.
- **Consumer Protection Law No. 181 of 2018** ([UNESCWA](https://alp.unescwa.org/plans/1694)). One law-firm guide says ads sent over WhatsApp count as advertising under this law, so the no-fraud rules apply there too ([Multilaw](https://www.multilaw.com/Multilaw/Data_Protection_Laws_Guide/DataProtection_Guide_Egypt.aspx)).
- Other countries: flag that local rules apply and suggest a lawyer.

## 4. Gray areas: the five questions

For anything not covered above, use the Markkula Center's framework from Santa Clara University. It lists five approaches: utilitarian, rights, justice and fairness, virtue, and common good ([SCU](https://www.scu.edu/ethics/focus-areas/more-focus-areas/engineering-ethics/ethical-considerations-in-the-senior-design-project/a-framework-for-ethical-decision-making-in-problem-definition--project-selection/)). In plain words:

1. **Harm and good:** who gets hurt, who benefits, and does the good outweigh the harm?
2. **Rights:** does it respect people's right to choose, to know, and to privacy?
3. **Fairness:** does it treat people equally, or take advantage of someone?
4. **Character:** is this the kind of founder you want to be?
5. **Community:** does it make the community better or worse?

The framework's steps: recognize the issue, get the facts, weigh the options, decide and test the decision, then act and reflect ([Umbrex summary](https://umbrex.com/resources/frameworks/decision-making-frameworks/markkula-framework-for-ethical-decision-making-2/)). Test question: could you defend this decision in public?

## 5. Skills to copy from

| Skill | What to take |
|---|---|
| [lyndonkl/claude ethics-safety-impact](https://skills.sh/lyndonkl/claude/ethics-safety-impact) | Who might be harmed, differential impact, vulnerable groups. Static markdown only; a security audit marked it safe ([audit](https://skills.sh/lyndonkl/claude/ethics-safety-impact/security/agent-trust-hub)) |
| [melodic-software ethics-review](https://agent-skills.md/skills/melodic-software/claude-code-plugins/ethics-review) | Impact assessment template and verdicts: approve, approve with conditions, defer, reject |
| [mohitagw15856 ai-ethics-review](https://www.skills.sh/mohitagw15856/pm-claude-skills/ai-ethics-review) | Risk tiers. It says itself that it is not a substitute for legal advice |

Check each license before copying.
