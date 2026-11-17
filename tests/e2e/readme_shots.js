// Screenshots for the README: every page of one run, in order, through the real web app and the
// real API with the scripted test model (fake_api.py). Writes PNGs to docs/media/flow/.
// Run: python3 tests/e2e/fake_api.py & (cd web && API_URL=http://127.0.0.1:8100 npx next start -p 3100) &
//      node tests/e2e/readme_shots.js
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = process.env.OUT_DIR || 'docs/media/flow';
const { chromium } = require('playwright');
const fs = require('fs');
const R1 = 'My WhatsApp group of 420 students asks for speaking practice every single week, so I can reach them';
const R2 = 'We got more sign-ups than the target in two weeks, so building the product is the honest next step';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  let runId; p.on('response', async r => { if (r.url().endsWith('/api/runs') && r.request().method() === 'POST') runId = (await r.json()).id; });
  const state = async () => (await (await p.request.get(`${BASE}/api/runs/${runId}`)).json());
  const until = async (pred, label) => { for (let i = 0; i < 80; i++) { const s = await state(); if (pred(s)) return s; await p.waitForTimeout(500); } throw new Error('timeout: ' + label); };
  const shots = [];
  const snap = async (n, caption) => { await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/${n}.png` }); shots.push({ n, caption }); };
  const say = async (text) => { const box = p.getByPlaceholder(/message|ask/i).first(); await box.fill(text); await box.press('Enter'); };
  const decide = async (option, reason) => {
    await p.getByText(option, { exact: true }).first().click();
    await p.getByRole('textbox', { name: /why this option/i }).fill(reason);
    await p.getByRole('button', { name: /Confirm decision/ }).click();
  };
  const levelUp = async (n, next, chat) => {
    await until(s => s.pending && s.pending.kind === 'level_up', 'level up ' + next);
    await snap(n + 'a_stage_complete', `Stage complete: move on to ${next}, or keep talking with the co-founder`);
    if (chat) {
      await p.getByRole('button', { name: /keep talking/i }).click();
      const before = (await state()).messages.length;
      await say(chat);
      await until(s => s.messages.length > before, 'chat reply');
      await snap(n + 'b_keep_talking', 'Keep talking: ask the co-founder anything before the next stage');
    }
    await p.getByRole('button', { name: new RegExp('^Go to ' + next) }).first().click();
    await until(s => !s.pending || s.pending.kind !== 'level_up', 'moved on');
  };

  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  // Ahmed Tarek mode is on by default; PARODY=off takes the shots without it.
  if (process.env.PARODY === 'off') {
    await p.getByRole('button', { name: 'Settings' }).click();
    const sw = p.getByRole('switch', { name: /Ahmed Tarek mode/ });
    if ((await sw.getAttribute('aria-checked')) === 'true') await sw.click();
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  }
  await snap('01_onboarding', 'Onboarding: specific questions, one per screen');
  const texts = ['IELTS tutor', 'Alexandria', 'Cairo University, English, 2019', 'Taught at a language centre for 3 years',
    'Students ask me for speaking practice', 'Book club host', 'My WhatsApp group of 420 IELTS students',
    'Two language centre owners', 'Arabic and English', 'No fake reviews, no promises of band scores'];
  let ti = 0, choiceShot = false;
  for (let k = 0; k < 40; k++) {
    if (await p.getByRole('button', { name: /^Start(?! voice)/ }).isVisible().catch(() => false)) break;
    const r = p.locator('[role=radio]').first();
    if (await r.isVisible().catch(() => false) && !(await p.locator('[role=radio][data-state=checked],[role=radio][aria-checked=true]').count())) {
      if (!choiceShot) { await snap('02_onboarding_choice', 'Choices where a choice is faster than typing'); choiceShot = true; }
      await r.click();
    }
    const c = p.locator('[role=checkbox]').first();
    if (await c.isVisible().catch(() => false) && !(await p.locator('[role=checkbox][data-state=checked],[role=checkbox][aria-checked=true]').count())) await c.click();
    const t = p.locator('textarea').first();
    if (await t.isVisible().catch(() => false) && !(await t.inputValue())) await t.fill(texts[ti++ % texts.length]);
    const n = p.getByRole('button', { name: /^Next/ });
    if (await n.isEnabled().catch(() => false)) await n.click(); else await p.getByRole('button', { name: /skip for now/i }).click();
    await p.waitForTimeout(250);
  }
  await snap('03_profile', 'Check what it understood about you before anything starts');
  await p.getByRole('button', { name: /^Start(?! voice)/ }).click();
  await until(s => s.pending, 'first question');
  await snap('04_cofounder', 'The co-founder asks only what is missing. The stage bar shows where you are');
  for (let i = 0; i < 6; i++) { const s = await state(); if (s.status === 'gate') break; await say('I can give 15 hours a week, and two students already paid me for mock speaking tests'); await until(x => x.status === 'gate' || (x.pending && x.pending.prompt !== s.pending.prompt), 'next question'); }
  await snap('05_ideation_gate', 'Ideation gate: options with sources, cost and risk, and a recommendation');
  await p.getByText('Speaking drills', { exact: true }).first().click();
  await p.getByRole('textbox', { name: /why this option/i }).fill('yes');
  await snap('06_bare_yes', 'A bare "yes" never counts. You say why in your own words');
  await p.getByRole('textbox', { name: /why this option/i }).fill(R1);
  await p.getByRole('button', { name: /Confirm decision/ }).click();
  await levelUp('07', 'Validation', 'What should I prove in the next stage?');
  await until(s => s.pending && s.pending.key === 'unfair_advantage', 'unfair advantage');
  await say('I coached 300 students and scored band 8.5 myself');
  await until(s => s.pending && s.pending.key === 'publish', 'publish gate');
  await snap('08_publish_gate', 'Validation: nothing is published until you approve it');
  await decide('Publish the sign-up page', R1);
  await until(s => s.pending && s.pending.kind === 'question', 'signups'); await say('130');
  await until(s => s.pending && s.pending.key === 'phase2', 'phase2 gate');
  await snap('09_validation_gate', 'Validation gate: real sign-ups against a target set before the test');
  await decide('Continue to Build', R2);
  await levelUp('10', 'Build', null);
  await until(s => s.pending && s.pending.key === 'phase3', 'build gate');
  await snap('11_build_gate', 'Build gate: user stories and a two-week MVP plan checked against your hours');
  await decide('Build this MVP', R2);
  await levelUp('12', 'Commercial setup', null);
  await until(s => s.pending && s.pending.key === 'price', 'price');
  await say('400');
  await until(s => s.pending && s.pending.key === 'phase4', 'checkout gate');
  await snap('13_checkout_gate', 'Commercial setup: offer, price and refund policy. Checkout stays MOCKED');
  await decide('Open the MOCKED checkout', 'Four hundred pounds is what my students already pay for two private lessons, so it feels fair');
  await levelUp('14', 'Sell and get paid', null);
  await until(s => s.pending && s.pending.key === 'buyers', 'buyers');
  await say('6');
  await until(s => s.pending && s.pending.key === 'refund', 'refund');
  await snap('15_refund', 'Sell: a refund only happens with your approval. No real money moves');
  await decide('Approve the refund', 'The buyer booked the wrong exam date and asked within a day, so a refund is the fair thing');
  await until(s => s.pending && s.pending.key === 'phase5', 'sales gate');
  await snap('16_sales_gate', 'Sales gate: one delivery per payment, duplicate webhook ignored, books reconciled');
  await decide('Keep selling', 'Six people paid and the books match, so I will keep selling to the rest of my group');
  await levelUp('17', 'Operate and learn', null);
  await until(s => s.pending && s.pending.key === 'came_back', 'came back');
  await say('3');
  await until(s => s.pending && s.pending.key === 'feedback', 'feedback');
  await say('They want more mock tests and feedback on pronunciation');
  await until(s => s.pending && s.pending.key === 'phase6', 'learning gate');
  await snap('18_learning_gate', 'Operate and learn: repeat buyers decide keep, fix, pivot or stop');
  await decide('Keep going and grow', 'Half of the buyers came back for more practice, so the product is worth growing carefully');
  await until(s => s.status === 'done', 'done');
  await snap('19_done', 'The run is finished. Every action is in the decision log');
  await p.getByRole('button', { name: 'Open map' }).click(); await snap('20_map', 'The founder map: look back at every stage');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Open plan' }).click(); await snap('21_plan', 'The living business plan with sources and version history');
  await p.keyboard.press('Escape');
  fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify(shots, null, 1));
  console.log(JSON.stringify({ shots: shots.length, errors }));
  await b.close();
})().catch(async e => { console.error('SHOTS FAILED:', e.message.split('\n')[0]); process.exit(1); });
