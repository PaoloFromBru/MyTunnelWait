// scripts/ping.js
const url = process.env.CRON_URL;
if (!url) {
  console.error('Missing CRON_URL');
  process.exit(1);
}

const jitter = Math.floor(Math.random() * 20_000); // 0–20s per non colpire sempre allo stesso istante
setTimeout(async () => {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 25_000); // timeout 25s

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'RenderCron/1.0 (+MyTunnelWait)' },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0,200)}`);
    console.log('OK:', text.slice(0,200));
  } catch (e) {
    console.error('FAIL:', e.message || e);
    process.exit(1);
  } finally {
    clearTimeout(to);
  }
}, jitter);
