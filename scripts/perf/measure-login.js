#!/usr/bin/env node
// Measures first load of a page (FCP, LCP, requests, transferred KB), read-only.
//
// Usage: node scripts/perf/measure-login.js <url> <chromium-binary>
//   e.g. NODE_PATH=/tmp/perf-pup/node_modules \
//        node scripts/perf/measure-login.js https://espacosingular.espacowhats.com.br/login /usr/bin/chromium-browser
//
// puppeteer-core is NOT a project dependency. Install it temporarily outside
// the repo and point NODE_PATH at it:
//   npm install --prefix /tmp/perf-pup puppeteer-core@23
//
// Two scenarios, each in a fresh browser context (cold cache):
//   desktop-fibra: normal connection, no CPU throttle
//   celular-4G:    1.6 Mbps down, 750 kbps up, 150 ms latency, CPU slowed 4x
// Navigation waits for "load" plus 4 s: the socket keeps the network active, so
// "networkidle" never fires.
const fs = require("fs");
const os = require("os");
const path = require("path");
const puppeteer = require("puppeteer-core");

const [url, chromium] = process.argv.slice(2);
if (!url || !chromium) {
  console.error("usage: node measure-login.js <url> <chromium-binary>");
  process.exit(2);
}

const scenarios = [
  { name: "desktop-fibra", network: null, cpu: 1 },
  {
    name: "celular-4G",
    network: {
      offline: false,
      downloadThroughput: (1.6 * 1000 * 1000) / 8,
      uploadThroughput: (750 * 1000) / 8,
      latency: 150
    },
    cpu: 4
  }
];

async function measure(browser, { name, network, cpu }) {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send("Network.enable");
    let bytes = 0;
    let requests = 0;
    cdp.on("Network.loadingFinished", e => {
      bytes += e.encodedDataLength;
      requests += 1;
    });
    if (network) await cdp.send("Network.emulateNetworkConditions", network);
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    await page.evaluateOnNewDocument(() => {
      window.__lcp = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    await page.goto(url, { waitUntil: "load", timeout: 90000 });
    await new Promise(resolve => setTimeout(resolve, 4000));
    const m = await page.evaluate(() => ({
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
      lcp: window.__lcp
    }));
    const ms = v => (v == null ? "n/a" : `${Math.round(v)} ms`);
    console.log(
      `${name}: FCP ${ms(m.fcp)}, LCP ${ms(m.lcp)}, requests ${requests}, ${Math.round(bytes / 1024)} KB`
    );
  } finally {
    await context.close();
  }
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "measure-login-"));
  const browser = await puppeteer.launch({
    executablePath: chromium,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=${profile}`]
  });
  try {
    for (const scenario of scenarios) await measure(browser, scenario);
  } finally {
    await browser.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(err => {
  console.error("ERR", err.message);
  process.exit(1);
});
