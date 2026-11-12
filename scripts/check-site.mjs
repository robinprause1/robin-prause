import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Pick an unused loopback port; do not disturb the production process.
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', resolve);
});
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const child = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const exited = new Promise(resolve => child.once('exit', resolve));
let stopped = false;
child.once('exit', () => { stopped = true; });

try {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (stopped) throw new Error('Website exited before becoming ready');
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer();
      if (response.ok) { ready = true; break; }
    } catch { /* Wait briefly for startup. */ }
    await delay(100);
  }
  assert.ok(ready, 'Website did not become ready');
  for (const path of ['/', '/en', '/de/lebenslauf', '/cv']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(!html.includes('{{'), `Unresolved template variable on ${path}`);
    const images = [...html.matchAll(/<img[^>]+src="(\/[^" ]+)"/g)];
    for (const [, src] of images) {
      const asset = await fetch(base + src);
      await asset.arrayBuffer();
      assert.equal(asset.status, 200, `Missing image ${src} on ${path}`);
      assert.match(asset.headers.get('content-type') ?? '', /^image\//);
    }
    console.log(`OK ${path} and referenced images`);
  }
} finally {
  if (!stopped) child.kill('SIGTERM');
  await exited;
}
