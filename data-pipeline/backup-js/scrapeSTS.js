import { chromium } from "playwright";

export async function scrapeSTS() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const map = new Map();

  page.on("response", async (response) => {
    try {
      const url = response.url();

      // ✅ DEBUG (ważne!)
      if (url.includes("items")) {
        console.log("🔥 ZŁAPANO:", url);

        const json = await response.json();

        if (!json.items) return;

        json.items.forEach(item => {
          const matchId = item.matchId;
          const name = `${item.homeTeamName} vs ${item.awayTeamName}`;
          const date = item.startedAt;
          const outcome = item.outcomeName;
          const odd = item.oddsValue;

          if (!map.has(matchId)) {
            map.set(matchId, {
              match: name,
              date,
              odds: {}
            });
          }

          const matchObj = map.get(matchId);

          if (outcome === "1") matchObj.odds.home = odd;
          if (outcome === "X" || outcome === "0") matchObj.odds.draw = odd;
          if (outcome === "2") matchObj.odds.away = odd;
        });
      }

    } catch {}
  });

  // ✅ wejście
  await page.goto("https://www.sts.pl/zaklady-bukmacherskie/pilka-nozna/1");

  await page.waitForTimeout(4000);

  // ✅ klik "jutro"
  try {
    await page.click("button:has-text('Jutro')");
  } catch {}

  await page.waitForTimeout(4000);

  // ✅ SCROLL → wymusza API
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1000);
  }

  // ✅ RELOAD (KLUCZOWE)
  await page.reload();

  await page.waitForTimeout(8000);

  await browser.close();

  return Array.from(map.values());
}