// Browser end-to-end: onboarding -> founder questions -> 3 gates -> done, through the
// real web app and the real API (scripted model + fake search, see fake_api.py).
// Run: python3 tests/e2e/fake_api.py & (cd web && API_URL=http://127.0.0.1:8100 npx next start -p 3100) &
//      node tests/e2e/browser_flow.js
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const { chromium } = require('playwright');
const R1 = 'My WhatsApp group of 420 students asks for speaking practice every single week, so I can reach them';
const R2 = 'We got more sign-ups than the target in two weeks, so building the product is the honest next step';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  let runId; p.on('response', async r => { if (r.url().endsWith('/api/runs') && r.request().method() === 'POST') runId = (await r.json()).id; });
  const state = async () => (await (await p.request.get(`${BASE}/api/runs/${runId}`)).json());
  const until = async (pred, label) => { for (let i = 0; i < 60; i++) { const s = await state(); if (pred(s)) return s; await p.waitForTimeout(500); } throw new Error('timeout: ' + label + ' ' + JSON.stringify(await state()).slice(0, 300)); };
  const snap = n => p.screenshot({ path: 'tests/e2e/screens/' + n + '.png' });
  globalThis.failSnap = () => p.screenshot({ path: 'tests/e2e/screens/zz_fail.png' });
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800); await snap('01_live_onboarding');
  // Onboarding: answer whatever each screen asks (choice, checkbox, text), skip nothing that can be answered.
  const texts = ['IELTS tutor', 'Cairo', 'Cairo University, English, 2019', 'Taught at a language centre for 3 years',
    'Students ask me for speaking practice', 'Book club host', 'My WhatsApp group of 420 IELTS students',
    'Two language centre owners', 'Arabic and English', 'No fake reviews, no promises of band scores'];
  let ti = 0;
  for (let k = 0; k < 30; k++) {
    if (await p.getByRole('button', { name: /^Start(?! voice)/ }).isVisible().catch(() => false)) break;
    const r = p.locator('[role=radio]').first();
    if (await r.isVisible().catch(() => false) && !(await p.locator('[role=radio][data-state=checked],[role=radio][aria-checked=true]').count())) await r.click();
    const c = p.locator('[role=checkbox]').first();
    if (await c.isVisible().catch(() => false) && !(await p.locator('[role=checkbox][data-state=checked],[role=checkbox][aria-checked=true]').count())) await c.click();
    const t = p.locator('textarea').first();
    if (await t.isVisible().catch(() => false) && !(await t.inputValue())) await t.fill(texts[ti++ % texts.length] + (ti > texts.length ? ' ' + ti : ''));
    const n = p.getByRole('button', { name: /^Next/ });
    if (await n.isEnabled().catch(() => false)) await n.click(); else await p.getByRole('button', { name: /skip for now/i }).click();
    await p.waitForTimeout(500);
  }
  await p.getByRole('button', { name: /^Start(?! voice)/ }).click();
  await until(s => s.pending, 'first question');
  await p.waitForTimeout(1500); await snap('02_live_first_question');
  const say = async (text) => { const box = p.getByPlaceholder(/message/i); await box.fill(text); await box.press('Enter'); };
  // intake gap questions until the phase 1 gate
  for (let i = 0; i < 6; i++) { const s = await state(); if (s.status === 'gate') break; await say('I can spend 15 hours a week and I already run weekly speaking sessions'); await until(x => x.status === 'gate' || (x.pending && x.pending.prompt !== s.pending.prompt), 'next question'); }
  await p.waitForTimeout(1500); await snap('03_live_phase1_gate');
  // bare yes then a real reason
  await p.getByText('Speaking drills', { exact: true }).first().click();
  const reason = p.getByRole('textbox', { name: /why this option/i });
  await reason.fill('yes'); await p.waitForTimeout(300); await snap('04_live_bare_yes');
  await reason.fill(R1); await p.getByRole('button', { name: /Confirm decision/ }).click();
  await until(s => s.pending && s.pending.key === 'unfair_advantage', 'unfair advantage');
  await p.waitForTimeout(1200); await snap('05_live_after_gate');
  await say('I coached 300 students and scored band 8.5 myself');
  await until(s => s.pending && s.pending.key === 'publish', 'publish gate'); await p.waitForTimeout(1200); await snap('06_live_publish_gate');
  await p.getByText('Publish the sign-up page', { exact: true }).first().click();
  await p.getByRole('textbox', { name: /why this option/i }).fill(R1);
  await p.getByRole('button', { name: /Confirm decision/ }).click();
  await until(s => s.pending && s.pending.kind === 'question', 'signups'); await say('130');
  await until(s => s.pending && s.pending.key === 'phase2', 'phase2 gate'); await p.waitForTimeout(1200); await snap('07_live_phase2_gate');
  await p.getByText('Continue to Build', { exact: true }).first().click();
  await p.getByRole('textbox', { name: /why this option/i }).fill(R2);
  await p.getByRole('button', { name: /Confirm decision/ }).click();
  await until(s => s.pending && s.pending.key === 'phase3', 'build gate'); await p.waitForTimeout(1200); await snap('07b_live_build_gate');
  await p.getByText('Build this MVP', { exact: true }).first().click();
  await p.getByRole('textbox', { name: /why this option/i }).fill(R2);
  await p.getByRole('button', { name: /Confirm decision/ }).click();
  const done = await until(s => s.status === 'done', 'done');
  await p.waitForTimeout(1500); await snap('08_live_done');
  await p.getByRole('button', { name: 'Open map' }).click(); await p.waitForTimeout(900); await snap('09_live_map');
  const log = await (await p.request.get(`${BASE}/api/runs/${runId}` + '/log')).json();
  console.log(JSON.stringify({ outcome: done.outcome, phase1: done.phase1, phase2: done.phase2, outputs: done.outputs, logEntries: log.length, gated: log.filter(e => e.approved_by === 'founder').length, errors }, null, 1));
  await b.close();
})().catch(async e => { await globalThis.failSnap?.().catch(()=>{}); console.error('E2E FAILED:', e.message.split('\n')[0]); process.exit(1); });
