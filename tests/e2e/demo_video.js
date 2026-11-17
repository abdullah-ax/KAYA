// Records the demo video of a full six-stage run (Playwright video, injected cursor, subtitles),
// following the ui-demo method: natural pacing, move before click, human typing on a few fields.
// Uses the scripted test model (fake_api.py) so the recording is repeatable; real-model runs are
// committed in outputs/. Money is MOCKED. Target length: under 2:55.
// Run: PORT=8101 python3 tests/e2e/fake_api.py & (cd web && API_URL=http://127.0.0.1:8101 npx next start -p 3101) &
//      BASE_URL=http://localhost:3101 node tests/e2e/demo_video.js out_dir
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://localhost:3101';
const OUT = process.argv[2] || 'demo-video';
const W = 1440, H = 900;

async function inject(page) {
  await page.evaluate(() => {
    if (!document.getElementById('demo-cursor')) {
      const c = document.createElement('div');
      c.id = 'demo-cursor';
      c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;border-radius:50%;background:rgba(17,17,17,.35);border:2px solid #fff;box-shadow:0 0 0 1px #111;pointer-events:none;transform:translate(-50%,-50%);left:0;top:0;transition:left .05s,top .05s';
      document.body.appendChild(c);
      document.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; });
    }
    if (!document.getElementById('demo-subtitle')) {
      const b = document.createElement('div');
      b.id = 'demo-subtitle';
      b.style.cssText = 'position:fixed;z-index:2147483646;left:50%;bottom:28px;transform:translateX(-50%);max-width:1100px;padding:12px 22px;border-radius:14px;background:rgba(17,17,17,.88);color:#fff;font:600 22px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none;opacity:0;transition:opacity .3s';
      document.body.appendChild(b);
    }
  });
}
async function say(page, text, ms = 2600) {
  await inject(page);
  await page.evaluate((t) => { const b = document.getElementById('demo-subtitle'); b.textContent = t; b.style.opacity = t ? '1' : '0'; }, text);
  if (ms) await page.waitForTimeout(ms);
}
async function moveClick(page, el, after = 500) {
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const box = await el.boundingBox();
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 }); await page.waitForTimeout(150); }
  await el.click();
  await page.waitForTimeout(after);
}
async function type(page, el, text, delay = 18) {
  await moveClick(page, el, 200);
  await el.fill('');
  await el.pressSequentially(text, { delay });
  await page.waitForTimeout(300);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } });
  const p = await ctx.newPage();
  let runId; p.on('response', async (r) => { if (r.url().endsWith('/api/runs') && r.request().method() === 'POST') { try { runId = (await r.json()).id; } catch {} } });
  const state = async () => (await (await p.request.get(`${BASE}/api/runs/${runId}`)).json());
  const until = async (pred, label = '') => { for (let i = 0; i < 240; i++) { const s = await state(); if (pred(s)) return s; await p.waitForTimeout(400); } throw new Error('timeout ' + label); };
  p.on('framenavigated', () => inject(p).catch(() => {}));
  globalThis.failShot = () => p.screenshot({ path: OUT + '/zz_fail.png' });
  const reason = () => p.getByRole('textbox', { name: /why this option/i });
  const msgBox = () => p.getByPlaceholder(/message|answer|ask/i).first();
  // Chat answer: typed at human speed when slow=true, otherwise filled.
  const answer = async (t, slow = false) => { const box = msgBox(); if (slow) await type(p, box, t, 14); else { await moveClick(p, box, 150); await box.fill(t); } await box.press('Enter'); };
  // Gate decision: pick the option, give a reason (typed or filled), confirm.
  const decide = async (option, why, slow = false) => {
    await moveClick(p, p.getByText(option, { exact: true }).first(), 250);
    if (slow) await type(p, reason(), why, 9); else { await moveClick(p, reason(), 150); await reason().fill(why); await p.waitForTimeout(500); }
    await moveClick(p, p.getByRole('button', { name: /Confirm decision/ }), 700);
  };
  const levelUp = async (next, chat) => {
    await until((s) => s.pending && s.pending.kind === 'level_up', 'level up ' + next);
    await p.waitForTimeout(700);
    if (chat) {
      await say(p, 'Each stage ends with a choice: move on, or keep talking with the co-founder first.', 2600);
      await moveClick(p, p.getByRole('button', { name: /keep talking/i }), 500);
      const before = (await state()).messages.length;
      await answer(chat, true);
      await until((s) => s.messages.length > before, 'chat reply');
      await p.waitForTimeout(1800);
    }
    await moveClick(p, p.getByRole('button', { name: new RegExp('^Go to ' + next) }).first(), 500);
    await until((s) => !s.pending || s.pending.kind !== 'level_up', 'moved on');
  };

  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await inject(p);
  await say(p, 'Boardroom: an open-source AI co-founder team that takes one idea through six stages. You make every decision.', 3200);

  // Onboarding: read the heading of the screen that is showing, then answer that question.
  // Each row: [words in the heading, chips to pick, text to write, type it at human speed].
  // Follow-ups come first because they quote earlier answers. The founder is an IELTS tutor in Alexandria.
  const ANSWERS = [
    [/complain about most/, [], 'They say they have nobody to practise speaking with before the test'],
    [/who asked last time/, [], 'Mariam asked last week for a mock speaking test before her exam'],
    [/built, sold, taught/, [], 'I ran paid mock speaking tests for two students and both booked again'],
    [/what do (people|they) say/, [], 'They say I explain books simply and ask me what to read next'],
    [/first hear about you/, [], 'My WhatsApp group and the language centre where I used to teach'],
    [/right person/, [], 'I failed my first speaking test, then reached band 8.5, so I know the fear'],
    [/how many months/, [], 'About 4 months'],
    [/plan goes wrong/, [], 'I stop, write down what happened and ask a student what they think'],
    [/do most days/, ['Freelancer'], 'IELTS tutor', true],
    [/where are you based/, [], 'Alexandria', true],
    [/study/, ['University'], 'Alexandria University, English literature, 2019'],
    [/jobs/, ['Full-time job', 'Freelance'], 'IELTS teacher at a language centre for 3 years, private tutor since'],
    [/help with/, ['Teaching or tutoring'], 'Students ask me for IELTS speaking practice'],
    [/for fun/, ['Reading'], 'I host a book club in Alexandria'],
    [/groups|communit/, ['WhatsApp or Facebook groups'], 'My WhatsApp group of 420 IELTS students'],
    [/introduce you/, ['A boss or old boss'], 'Two language centre owners in Alexandria'],
    [/languages/, ['Arabic', 'English'], 'I know Alexandria and Cairo'],
    [/hours a week/, ['10–20'], null],
    [/money/, ['Self-funded, no raise'], 'Up to EGP 3,000'],
    [/never do/, ['Fake reviews', 'Lie to customers'], 'No promises of band scores'],
  ];
  const headings = async () => (await p.locator('h1, h2').allTextContents().catch(() => [])).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const startBtn = () => p.getByRole('button', { name: /^Start(?! voice)/ });
  let prev = '', saidFollow = false;
  for (let k = 0; k < 40; k++) {
    // Wait until the heading differs from the last screen's (up to 3s), so the answer fits the question on screen.
    let hs = await headings();
    for (let t = 0; t < 30 && k > 0 && hs.join('|') === prev; t++) { await p.waitForTimeout(100); hs = await headings(); }
    if (await startBtn().isVisible().catch(() => false)) break;
    prev = hs.join('|');
    const row = ANSWERS.find(([re]) => hs.some((h) => re.test(h)));
    if (k === 0) await say(p, 'Onboarding: one specific question per screen about your work, communities, time, money and limits.', 0);
    if (row && !saidFollow && ANSWERS.indexOf(row) < 8) { saidFollow = true; await say(p, 'Follow-up questions are written from your own earlier answers.', 0); }
    if (row) {
      const [, chips, text, slow] = row;
      for (const c of chips) {
        const chip = p.locator('[role=radio], [role=checkbox]').filter({ hasText: new RegExp('^' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
        if (await chip.isVisible().catch(() => false) && (await chip.getAttribute('aria-checked')) !== 'true') await moveClick(p, chip, 120);
      }
      const tb = p.locator('textarea').first();
      if (text && await tb.isVisible().catch(() => false)) {
        if (slow) await type(p, tb, text); else { await moveClick(p, tb, 100); await tb.fill(text); }
      }
      await p.waitForTimeout(350);
    }
    const next = p.getByRole('button', { name: /^Next/ });
    // Never skip a screen. If Next is still off, pick an option, then write the field's own example.
    if (!(await next.isEnabled().catch(() => false))) {
      const opt = p.locator('[role=radio], [role=checkbox]').first();
      if (await opt.isVisible().catch(() => false)) await moveClick(p, opt, 120);
    }
    if (!(await next.isEnabled().catch(() => false))) {
      const tb = p.locator('textarea').first();
      await moveClick(p, tb, 100); await tb.fill((await tb.getAttribute('placeholder')) || '');
    }
    if (!(await next.isEnabled().catch(() => false))) throw new Error('no answer for screen: ' + hs.join(' | '));
    await moveClick(p, next, 300);
  }
  await say(p, 'Before anything starts, you check what it understood about you. Missing facts are labelled ASSUMPTION.', 3000);
  await moveClick(p, p.getByRole('button', { name: /^Start(?! voice)/ }), 700);

  // Stage 1: Ideation.
  await until((s) => s.pending, 'first question');
  await say(p, 'Stage 1, Ideation. The co-founder asks only what is missing. Ahmed Tarek, a parody shark, watches on the right.', 2800);
  // One answer per pending question, picked by the question's words. No answer is used twice.
  const INTAKE = [
    [/hours|time/, 'Fifteen hours a week for the next two months, mostly evenings and Fridays'],
    [/paid|pay|bought/, 'Two students in my group paid me EGP 300 each for a mock speaking test last month'],
    [/problem|complain|struggle/, 'They freeze in part two of the speaking test and have nobody to practise with'],
    [/who|customer|audience/, 'University graduates in Alexandria who need band 6.5 to study or work abroad'],
    [/reach|where|channel/, 'Through my WhatsApp group and two language centres in Alexandria'],
    [/skill|good at|experience/, 'I scored band 8.5 and have coached IELTS speaking for three years'],
    [/money|budget|spend/, 'I can put in up to EGP 3,000 of my own money and nothing more'],
  ];
  const used = new Set();
  for (let i = 0; i < 8; i++) {
    const s = await state(); if (s.status === 'gate' || !s.pending || s.pending.kind !== 'question') break;
    const q = s.pending.prompt.toLowerCase();
    const pick = INTAKE.find(([re, a]) => re.test(q) && !used.has(a)) || INTAKE.find(([, a]) => !used.has(a));
    if (!pick) throw new Error('no answer left for: ' + q);
    used.add(pick[1]);
    await p.getByText(s.pending.prompt, { exact: false }).last().waitFor({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(i === 0 ? 0 : 900);
    await answer(pick[1], i === 0);
    await until((x) => x.status === 'gate' || (x.pending && x.pending.prompt !== s.pending.prompt), 'next question');
  }
  await p.waitForTimeout(900);
  await say(p, 'Ideation gate: each option shows its sources, cost and risk, and the system states a recommendation.', 3200);
  await moveClick(p, p.getByText('Speaking drills', { exact: true }).first(), 300);
  await type(p, reason(), 'yes', 60);
  await say(p, 'A bare "yes" is rejected. The founder has to explain why, in their own words.', 2400);
  await moveClick(p, reason(), 150);
  await reason().fill('My WhatsApp group of 420 students asks for speaking practice every single week, so I can reach them');
  await p.waitForTimeout(600);
  await moveClick(p, p.getByRole('button', { name: /Confirm decision/ }), 700);
  await levelUp('Validation', 'What should I prove in the next stage?');

  // Stage 2: Validation.
  await until((s) => s.pending && s.pending.key === 'unfair_advantage', 'unfair advantage');
  await say(p, 'Stage 2, Validation.', 0);
  await answer('I coached 300 students and scored band 8.5 myself');
  await until((s) => s.pending && s.pending.key === 'publish', 'publish gate');
  await p.waitForTimeout(600);
  await say(p, 'Nothing is published without approval. The sign-up page passed the ethics check and waits for the founder.', 2800);
  await decide('Publish the sign-up page', 'I want strangers outside my group to see it so the sign-up number means something real');
  await until((s) => s.pending && s.pending.kind === 'question', 'signups');
  await say(p, 'Two weeks later the founder types the real number: 130 sign-ups against a target of 100 set before the test.', 2400);
  await answer('130', true);
  await until((s) => s.pending && s.pending.key === 'phase2', 'phase2 gate');
  await p.waitForTimeout(900);
  await say(p, 'Validation gate: the evidence clears the bar set in advance. A weak number here gets a STOP recommendation.', 3000);
  await decide('Continue to Build', 'We got more sign-ups than the target in two weeks, so building the product is the honest next step');
  await levelUp('Build', null);

  // Stage 3: Build.
  await until((s) => s.pending && s.pending.key === 'phase3', 'build gate');
  await p.waitForTimeout(700);
  await say(p, 'Stage 3, Build: user stories and a two-week MVP plan, checked against the founder\'s 15 hours a week.', 3200);
  await decide('Build this MVP', 'The plan fits my fifteen hours a week and only covers what the sign-ups asked for, so I will build it');
  await levelUp('Commercial setup', null);

  // Stage 4: Commercial setup.
  await until((s) => s.pending && s.pending.key === 'price', 'price');
  await say(p, 'Stage 4, Commercial setup. The founder sets the price.', 0);
  await answer('400', true);
  await until((s) => s.pending && s.pending.key === 'phase4', 'checkout gate');
  await p.waitForTimeout(700);
  await say(p, 'Offer, price and refund policy. The checkout is MOCKED: no real payment provider, no real money.', 3200);
  await decide('Open the MOCKED checkout', 'Four hundred pounds is what my students already pay for two private lessons, so it feels fair');
  await levelUp('Sell and get paid', null);

  // Stage 5: Sell and get paid.
  await until((s) => s.pending && s.pending.key === 'buyers', 'buyers');
  await say(p, 'Stage 5, Sell and get paid. The founder reports 6 buyers from the MOCKED checkout.', 0);
  await answer('6', true);
  await until((s) => s.pending && s.pending.key === 'refund', 'refund');
  await p.waitForTimeout(600);
  await say(p, 'A refund request. The system never moves money by itself: the refund waits for founder approval, and it is MOCKED.', 3200);
  await decide('Approve the refund', 'The buyer booked the wrong exam date and asked within a day, so a refund is the fair thing');
  await until((s) => s.pending && s.pending.key === 'phase5', 'sales gate');
  await p.waitForTimeout(700);
  await say(p, 'Sales gate: one delivery per payment, a duplicate webhook ignored, the refund revokes access, the MOCKED books reconcile.', 3800);
  await decide('Keep selling', 'Six people paid and the books match, so I will keep selling to the rest of my group');
  await levelUp('Operate and learn', null);

  // Stage 6: Operate and learn.
  await until((s) => s.pending && s.pending.key === 'came_back', 'came back');
  await say(p, 'Stage 6, Operate and learn: how many buyers came back, and what they said.', 0);
  await answer('3', true);
  await until((s) => s.pending && s.pending.key === 'feedback', 'feedback');
  await answer('They want more mock tests and feedback on pronunciation');
  await until((s) => s.pending && s.pending.key === 'phase6', 'learning gate');
  await p.waitForTimeout(700);
  await say(p, 'Learning gate: repeat buyers and feedback decide keep, fix, pivot or stop. No income is promised.', 3000);
  await decide('Keep going and grow', 'Half of the buyers came back for more practice, so the product is worth growing carefully');
  await until((s) => s.status === 'done', 'done');
  await p.waitForTimeout(900);

  await moveClick(p, p.getByRole('button', { name: 'Open map' }), 1000);
  await say(p, 'The founder map: all six stages, key facts, open problems and the agents on each.', 3200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await moveClick(p, p.getByRole('button', { name: 'Open plan' }), 1000);
  await say(p, 'The living business plan: sections with sources, version history, and Ahmed Tarek\'s critique.', 3400);
  await say(p, 'This recording uses a scripted test model so it repeats exactly; real-model runs are in outputs/. Payments are MOCKED.', 4200);
  await say(p, 'Free open-weight models, approval enforced in code, every action in the decision log.', 3000);
  await say(p, '', 300);

  const video = await p.video().path();
  await ctx.close(); await b.close();
  console.log(JSON.stringify({ video, runId }));
})().catch(async (e) => { await globalThis.failShot?.().catch(() => {}); console.error('DEMO FAILED:', e.message.split('\n')[0]); process.exit(1); });
