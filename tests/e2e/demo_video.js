// Records the demo video (Playwright video, injected cursor, subtitles), following the ui-demo method:
// natural pacing, move before click, type at human speed. Uses the scripted test model (fake_api.py)
// so the recording is repeatable; real-model runs are committed in outputs/.
// Run: python3 tests/e2e/fake_api.py & (cd web && API_URL=http://127.0.0.1:8101 npx next start -p 3101) &
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
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 }); await page.waitForTimeout(250); }
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
  const until = async (pred) => { for (let i = 0; i < 240; i++) { const s = await state(); if (pred(s)) return s; await p.waitForTimeout(500); } throw new Error('timeout'); };
  p.on('framenavigated', () => inject(p).catch(() => {}));
  globalThis.failShot = () => p.screenshot({ path: OUT + '/zz_fail.png' });

  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await inject(p);
  await say(p, 'Boardroom: an open-source AI co-founder team. It learns who you are first, and you make every decision.', 3800);

  // Onboarding: answer whatever each screen asks.
  const first = ['IELTS tutor', 'Alexandria', 'Cairo University, English literature, 2019', 'Taught at a language centre for 3 years'];
  let shown = 0;
  for (let k = 0; k < 30; k++) {
    if (await p.getByRole('button', { name: /^Start(?! voice)/ }).isVisible().catch(() => false)) break;
    const heading = (await p.locator('h1, h2').first().textContent().catch(() => '')) || '';
    if (k === 0) await say(p, 'Specific questions, one per screen: your work, education, communities, connections, time, money and limits.', 0);
    if (k === 4) await say(p, 'Follow-up questions are written from your own earlier answers.', 0);
    const radio = p.locator('[role=radio]').first();
    if (await radio.isVisible().catch(() => false) && !(await p.locator('[role=radio][aria-checked=true], [role=radio][data-state=checked]').count())) await moveClick(p, radio, 300);
    const box = p.locator('[role=checkbox]').first();
    if (await box.isVisible().catch(() => false) && !(await p.locator('[role=checkbox][aria-checked=true], [role=checkbox][data-state=checked]').count())) await moveClick(p, box, 300);
    const tb = p.locator('textarea').first();
    if (await tb.isVisible().catch(() => false) && !(await tb.inputValue().catch(() => ''))) {
      const text = first[shown] || 'My WhatsApp group of 420 IELTS students asks me for speaking practice every week';
      shown < 4 ? await type(p, tb, text) : await tb.fill(text);
      shown++;
    }
    const next = p.getByRole('button', { name: /^Next/ });
    if (await next.isEnabled().catch(() => false)) await moveClick(p, next, 700);
    else await moveClick(p, p.getByRole('button', { name: /skip for now/i }), 700);
    if (!heading) await p.waitForTimeout(500);
  }
  await say(p, 'Before anything starts, you check what it understood about you, in your own words. Missing facts say ASSUMPTION.', 3600);
  await moveClick(p, p.getByRole('button', { name: /^Start(?! voice)/ }), 800);

  const answer = async (t) => { const box = p.getByPlaceholder(/message|answer/i).first(); await type(p, box, t, 12); await box.press('Enter'); };
  await until((s) => s.pending);
  await say(p, 'The co-founder asks only what is missing. Ahmed Tarek, a parody shark, watches from the right panel.', 3200);
  for (let i = 0; i < 6; i++) {
    const s = await state(); if (s.status === 'gate') break;
    await answer('About 15 hours a week, and I already run weekly speaking sessions');
    await until((x) => x.status === 'gate' || (x.pending && x.pending.prompt !== s.pending.prompt));
  }
  await p.waitForTimeout(1200);
  await say(p, 'The research intern searched the web. Every option shows its source site, cost and risk, and the system states a recommendation.', 4000);
  await moveClick(p, p.getByText('Speaking drills', { exact: true }).first(), 400);
  const reason = () => p.getByRole('textbox', { name: /why this option/i });
  await type(p, reason(), 'yes', 60);
  await say(p, 'A bare "yes" never moves the work forward. The founder has to explain why, in their own words.', 3200);
  await type(p, reason(), 'My WhatsApp group of 420 students asks for speaking practice every single week, so I can reach them fast', 10);
  await moveClick(p, p.getByRole('button', { name: /Confirm decision/ }), 900);

  await until((s) => s.pending && s.pending.key === 'unfair_advantage');
  await answer('I coached 300 students and scored band 8.5 myself');
  await until((s) => s.pending && s.pending.key === 'publish');
  await p.waitForTimeout(800);
  await say(p, 'Nothing is published without approval. The sign-up page passed the ethics check and waits for the founder.', 3200);
  await moveClick(p, p.getByText('Publish the sign-up page', { exact: true }).first(), 300);
  await type(p, reason(), 'I want strangers outside my group to see it so the sign-up number means something real', 8);
  await moveClick(p, p.getByRole('button', { name: /Confirm decision/ }), 900);

  await until((s) => s.pending && s.pending.kind === 'question');
  await say(p, 'Two weeks later the founder enters the real number: 12 sign-ups against a target of 100 set before the test.', 3000);
  await answer('12');
  await until((s) => s.pending && s.pending.key === 'phase2');
  await p.waitForTimeout(1200);
  await say(p, 'Under 30% of the target: the system recommends STOP in red and does not spin the result.', 4200);
  await moveClick(p, p.getByText('Stop or pivot', { exact: true }).first(), 300);
  await type(p, reason(), 'Twelve is far under the hundred I set before the test, so I will stop and look for a stronger problem', 8);
  await moveClick(p, p.getByRole('button', { name: /Confirm decision/ }), 900);
  await until((s) => s.status === 'done');
  await p.waitForTimeout(1200);

  await moveClick(p, p.getByRole('button', { name: 'Open plan' }), 1400);
  await say(p, 'The living business plan: sections with sources, open issues, version history with pivots and stops, and Ahmed Tarek\'s critique.', 4800);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  await moveClick(p, p.getByRole('button', { name: 'Open map' }), 1400);
  await say(p, 'The founder map: six stages, key facts, open problems and the agents on each.', 4000);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  await say(p, 'Free open-weight models, local search, approval enforced in code, every action logged. Recorded with a scripted test model; real-model runs are in outputs/.', 5200);
  await say(p, '', 400);

  const video = await p.video().path();
  await ctx.close(); await b.close();
  console.log(JSON.stringify({ video, runId }));
})().catch(async (e) => { await globalThis.failShot?.().catch(() => {}); console.error('DEMO FAILED:', e.message.split('\n')[0]); process.exit(1); });
