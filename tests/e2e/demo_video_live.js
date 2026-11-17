// Records the demo on the REAL model (the live API with a free open-weight model and local search).
// Answers each question by what it actually asks, never the same answer twice. Waiting time is cut
// afterwards with ffmpeg (mpdecimate drops frames where nothing changes).
// Run: BASE_URL=http://localhost:3100 node tests/e2e/demo_video_live.js out_dir
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = process.argv[2] || 'demo-live';
const W = 1440, H = 900;

const ANSWERS = [
  [/hour|time|week/i, 'About 10 hours a week, mostly evenings and Fridays.'],
  [/money|spend|budget|cost|egp|afford/i, 'Up to EGP 2,000 of my own savings, and nothing more.'],
  [/never|won.?t|refuse|values/i, 'I will never promise a band score or post fake reviews.'],
  [/disagree|wrong|conflict/i, 'I listen first, then test both ideas with a few students before deciding.'],
  [/trust|opinion|advice/i, 'Students trust me on speaking tips because I scored band 8.5 myself.'],
  [/copy|unfair|advantage|others can/i, 'I have coached 300 students since 2021, and my group of 420 already trusts my advice.'],
  [/problem|struggle|pain|hard|last month/i, 'My students freeze in the speaking test because they never practise out loud with feedback.'],
  [/skill|wish|learn/i, 'I wish I were better at online marketing and video editing.'],
  [/group|community|reach|message|who|customer|students|people/i, 'My WhatsApp group of 420 IELTS students in Alexandria; most sit the test this year.'],
  [/past|before|tried|built|sold|work/i, 'I taught at a language centre for 3 years, then started tutoring on my own.'],
  [/plan|start and fix|organi[sz]e/i, 'I start small and fix things as I go, like my weekly speaking sessions.'],
];
const SPARE = [
  'Last term 40 students paid me for extra speaking sessions before their exam.',
  'I run a free speaking practice call every Friday and about 25 students join.',
  'Students send me voice notes and I reply with corrections, usually the same day.',
  'Two language centres in Smouha already send me students they cannot handle.',
  'I keep a list of the 50 speaking questions that come up most in Alexandria.',
];
const used = new Set();
function answerFor(q) {
  for (const [re, a] of ANSWERS) if (re.test(q) && !used.has(a)) { used.add(a); return a; }
  const a = SPARE.find((s) => !used.has(s)) || `Honestly I am not sure yet; I would ask my students first (${used.size}).`;
  used.add(a); return a;
}

async function inject(page) {
  await page.evaluate(() => {
    if (!document.getElementById('demo-cursor')) {
      const c = document.createElement('div'); c.id = 'demo-cursor';
      c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;border-radius:50%;background:rgba(17,17,17,.35);border:2px solid #fff;box-shadow:0 0 0 1px #111;pointer-events:none;transform:translate(-50%,-50%);left:0;top:0';
      document.body.appendChild(c);
      document.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; });
    }
    if (!document.getElementById('demo-subtitle')) {
      const b = document.createElement('div'); b.id = 'demo-subtitle';
      b.style.cssText = 'position:fixed;z-index:2147483646;left:50%;bottom:28px;transform:translateX(-50%);max-width:1150px;padding:12px 22px;border-radius:14px;background:rgba(17,17,17,.88);color:#fff;font:600 22px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none;opacity:0;transition:opacity .3s';
      document.body.appendChild(b);
    }
  });
}
async function say(page, text, ms = 2800) {
  await inject(page);
  await page.evaluate((t) => { const b = document.getElementById('demo-subtitle'); b.textContent = t; b.style.opacity = t ? '1' : '0'; }, text);
  if (ms) await page.waitForTimeout(ms);
}
async function moveClick(page, el, after = 500) {
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const box = await el.boundingBox();
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 }); await page.waitForTimeout(250); }
  await el.click(); await page.waitForTimeout(after);
}
async function hover(page, el, ms = 900) {
  const box = await el.boundingBox().catch(() => null);
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 }); await page.waitForTimeout(ms); }
}
async function type(page, el, text, delay = 14) {
  await moveClick(page, el, 200); await el.fill(''); await el.pressSequentially(text, { delay }); await page.waitForTimeout(300);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } });
  const p = await ctx.newPage();
  let runId; p.on('response', async (r) => { if (r.url().endsWith('/api/runs') && r.request().method() === 'POST') { try { runId = (await r.json()).id; } catch {} } });
  const state = async () => (await (await p.request.get(`${BASE}/api/runs/${runId}`)).json());
  const until = async (pred, secs = 900) => { for (let i = 0; i < secs * 2; i++) { const s = await state(); if (pred(s)) return s; await p.waitForTimeout(500); } throw new Error('timeout'); };
  globalThis.failShot = () => p.screenshot({ path: OUT + '/zz_fail.png' });
  const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);

  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await inject(p);
  await say(p, 'Boardroom: an open-source AI co-founder team. It learns who you are first, and you make every decision.', 3800);

  // Model: free open-weight model on OpenRouter (key injected by the network, never typed here).
  await moveClick(p, p.getByRole('button', { name: /ai ready|qwen3|model/i }).first(), 700);
  await say(p, 'Free models only: one on your own laptop, or a free hosted open-weight model with your own key.', 2600);
  await moveClick(p, p.getByRole('radio', { name: /openrouter/i }), 300);
  await p.getByLabel(/api key/i).fill('proxy-injected');
  await moveClick(p, p.getByRole('button', { name: /test connection/i }), 300);
  await p.getByText(/connected/i).first().waitFor({ timeout: 90000 });
  await say(p, 'Connected to a real free model: NVIDIA Nemotron, open weights.', 2200);
  await moveClick(p, p.getByRole('button', { name: /use this model/i }), 600);

  // Onboarding, answered by what each screen asks.
  const ob = {
    'most days': 'IELTS tutor', 'based': 'Alexandria', 'study': 'Alexandria University, English literature, 2019',
    'work': 'Taught at a language centre for 3 years', 'ask you': 'Students ask me for speaking practice and mock tests',
    'fun': 'I host a book club and people say I explain things simply', 'communit': 'My WhatsApp group of 420 IELTS students, and my book club of 30',
    'introduce': 'Two language centre owners in Smouha', 'language': 'Arabic and English; I know Alexandria well',
    'won': 'I will never promise a band score or post fake reviews',
  };
  for (let k = 0; k < 30; k++) {
    if (await p.getByRole('button', { name: /^Start(?! voice)/ }).isVisible().catch(() => false)) break;
    const heading = ((await p.locator('h1, h2').first().textContent().catch(() => '')) || '').toLowerCase();
    if (k === 0) await say(p, 'Specific questions, one per screen: your work, studies, communities, who can introduce you, your time, money and limits.', 0);
    if (k === 10) await say(p, 'Then follow-ups written by the model from your own earlier answers.', 0);
    const radio = p.locator('[role=radio]').first();
    if (await radio.isVisible().catch(() => false) && !(await p.locator('[role=radio][data-state=checked],[role=radio][aria-checked=true]').count())) await moveClick(p, radio, 250);
    const box = p.locator('[role=checkbox]').first();
    if (await box.isVisible().catch(() => false) && !(await p.locator('[role=checkbox][data-state=checked],[role=checkbox][aria-checked=true]').count())) await moveClick(p, box, 250);
    const tb = p.locator('textarea').first();
    if (await tb.isVisible().catch(() => false) && !(await tb.inputValue().catch(() => ''))) {
      const key = Object.keys(ob).find((k2) => heading.includes(k2));
      const text = key ? ob[key] : answerFor(heading);
      if (key) delete ob[key];
      k < 6 ? await type(p, tb, text) : await tb.fill(text);
    }
    const next = p.getByRole('button', { name: /^Next/ });
    if (await next.isEnabled().catch(() => false)) await moveClick(p, next, 700);
    else await moveClick(p, p.getByRole('button', { name: /skip for now/i }), 700);
    await p.locator('h1, h2').first().waitFor({ timeout: 120000 }).catch(() => {});
  }
  await say(p, 'Before anything starts, you check what it understood, in your own words, with your strongest edges as a founder.', 4200);
  await moveClick(p, p.getByRole('button', { name: /^Start(?! voice)/ }), 1000);
  log('run ' + runId);

  // The team.
  await say(p, 'Your team: a co-founder who leads, a Profiler, a research intern, a strict boss, three judges, and the shark panel.', 0);
  for (const name of ['Noor', 'Profiler', 'Research intern', 'Boss', 'Evidence judge', 'Ethics judge', 'Ahmed Tarek']) {
    await hover(p, p.getByText(name, { exact: true }).first(), 650);
  }

  const say2 = async (t) => { const box = p.getByPlaceholder(/message|answer/i).first(); await type(p, box, t, 10); await box.press('Enter'); };
  let last = '';
  for (let step = 0; step < 40; step++) {
    const s = await until((x) => x.status === 'done' || x.status === 'error' || (x.pending && JSON.stringify(x.pending) !== last));
    if (s.status === 'done' || s.status === 'error') { log('done ' + s.outcome); break; }
    last = JSON.stringify(s.pending);
    await p.waitForTimeout(1000);
    if (s.pending.kind === 'question') {
      const q = s.pending.prompt; log('Q ' + q.slice(0, 90));
      const a = /signed up|sign-ups|how many/i.test(q) ? '130' : answerFor(q);
      if (a === '130') await say(p, 'Two weeks later the founder enters the real number against the target set before the test: 100.', 2600);
      await say2(a);
    } else {
      const names = s.pending.options.map((o) => o.name);
      log('GATE ' + s.pending.key + ' ' + s.pending.prompt.slice(0, 80));
      const reasonBox = () => p.getByRole('textbox', { name: /why this option/i });
      let pick, reason;
      if (s.pending.key === 'phase1') {
        await say(p, 'The research intern searched the web. Each option shows its source, cost and risk; the boss already checked the draft.', 3800);
        await hover(p, p.getByText(/sources/i).first(), 1200);
        pick = names.find((n) => !/stop/i.test(n)) || names[0];
        reason = 'My students ask for speaking practice every single week, so this is the problem I see up close and can test fast';
        await moveClick(p, p.getByText(pick, { exact: true }).first(), 300);
        await type(p, reasonBox(), 'yes', 60);
        await say(p, 'A bare "yes" never counts. The founder must explain why, in their own words.', 3000);
      } else if (s.pending.key === 'publish') {
        await say(p, 'Nothing goes out without approval. The page passed the ethics check and waits for the founder.', 3200);
        pick = names.find((n) => /publish/i.test(n)) || names[0];
        reason = 'I want students outside my group to see it so the sign-up number means something real';
      } else if (s.pending.key === 'phase2') {
        await say(p, 'At or above the target, the system says go, and Ahmed Tarek finally smiles.', 3400);
        pick = names.find((n) => /continue|build/i.test(n)) || names[0];
        reason = 'One hundred and thirty sign-ups beat the target I set before the test, so building the smallest version is next';
      } else {
        await say(p, 'Each gate: pick an option and say why.', 2000);
        pick = names.find((n) => !/stop|back/i.test(n)) || names[0];
        reason = 'This scope fits my ten hours a week and gets a real version in front of my first ten students fast';
      }
      await moveClick(p, p.getByText(pick, { exact: true }).first(), 300);
      await type(p, reasonBox(), reason, 8);
      await moveClick(p, p.getByRole('button', { name: /Confirm decision/ }), 900);
      log('  picked ' + pick);
    }
  }
  await p.waitForTimeout(1500);
  await say(p, 'This week: a coaching card for the current stage, with one action today, what to ship, the metric and a short lesson.', 4000);
  await hover(p, p.getByText(/this week/i).first(), 1500);

  await moveClick(p, p.getByRole('button', { name: 'Open map' }), 1400);
  await say(p, 'The founder map: six stages around you, with key facts, open problems and the agents on each.', 3600);
  await moveClick(p, p.getByRole('combobox', { name: /agents/i }), 500);
  await moveClick(p, p.getByRole('option', { name: /research intern/i }), 900);
  await say(p, 'Filter by agent to see which stages each one works on.', 2600);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  await moveClick(p, p.getByRole('button', { name: 'Open plan' }), 1600);
  await say(p, 'The living business plan: every section with sources, open issues, version history, and Ahmed Tarek\'s critique.', 4600);
  await p.mouse.wheel(0, 900); await p.waitForTimeout(1500);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  await say(p, 'Real run: a free open-weight model and local search. Every step is in decision_log.json with the founder\'s own words.', 5000);
  await say(p, '', 300);
  const video = await p.video().path();
  await ctx.close(); await b.close();
  console.log(JSON.stringify({ video, runId }));
})().catch(async (e) => { await globalThis.failShot?.().catch(() => {}); console.error('DEMO FAILED:', e.message.split('\n')[0]); process.exit(1); });
