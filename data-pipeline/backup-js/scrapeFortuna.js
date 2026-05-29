import { chromium } from "playwright";

export async function scrapeFortuna() {

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const results = [];
  const seen = new Set(); // ✅ usuwanie duplikatów

  await page.goto("https://www.efortuna.pl/zaklady-bukmacherskie");

  await page.waitForTimeout(6000);

  try { await page.click('button:has-text("Akceptuję")'); } catch {}
  try { await page.click('[aria-label="Close"]'); } catch {}

  await page.waitForTimeout(2000);

  await page.click("text=Piłka nożna");
  await page.waitForTimeout(3000);

  await page.click("text=1.Belgia");
  await page.waitForTimeout(3000);

  await page.locator("text=JUTRO").first().click();
  await page.waitForTimeout(4000);

  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(1000);
  }

  const cards = await page.locator("div:has-text('Wynik meczu')").all();

  console.log("ZNALEZIONE KARTY:", cards.length);

  for (const card of cards) {
    try {
      const text = await card.innerText();

      const odds = text.match(/\d+\.\d+/g);
      if (!odds || odds.length < 3) continue;

      const home = parseFloat(odds[0]);
      const draw = parseFloat(odds[1]);
      const away = parseFloat(odds[2]);

      const lines = text.split("\n");

      // ✅ filtrujemy linie tekstowe (bez cyfr i UI)
      const teams = lines.filter(l =>
        l.length > 2 &&
        !l.match(/\d/) &&
        !l.includes("Mecz") &&
        !l.includes("ZAKŁADY") &&
        !l.includes("LIVE") &&
        !l.includes("Popularne") &&
        !l.includes("market") &&
        !l.includes("Piłka")
      );

      if (teams.length < 2) continue;

      const match = `${teams[0]} vs ${teams[1]}`;

      // ✅ usuwanie duplikatów
      if (seen.has(match)) continue;
      seen.add(match);

      results.push({
        match,
        odds: { home, draw, away }
      });

    } catch {}
  }

  await browser.close();

  return results;
}
