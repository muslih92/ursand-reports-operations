"""Playwright E2E checks for the dashboard highlight cards
(Station of the Week / Employee of the Month / Supervisor of the Month).

Covers: no content clipping at 360px & 768px, expand/collapse behaviour,
state persistence across reload + in-app navigation, ARIA attributes,
icon tooltips, and mobile emulation (iOS Safari / Android Chrome).

Run:  python3 tests/e2e/cards_e2e.py [base_url]
"""

import asyncio
import json
import os
import sys

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
FAILURES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + detail) if detail else ""))
    if not cond:
        FAILURES.append(name)


async def sign_in(context, page):
    if cj := os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON"):
        await context.add_cookies([{**c, "url": BASE} for c in json.loads(cj)])
    await page.goto(BASE, wait_until="domcontentloaded")
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    sj = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if key and sj:
        await page.evaluate(f"localStorage.setItem({json.dumps(key)}, {json.dumps(sj)})")


async def open_dashboard(page):
    await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
    await page.wait_for_selector("button[aria-controls][aria-expanded]", timeout=30000)
    await page.wait_for_timeout(500)


async def overflow_report(page):
    return await page.evaluate(
        """() => [...document.querySelectorAll('section[aria-label] button[aria-controls]')]
             .map(b => b.closest('section'))
             .map(s => ({
               label: s.getAttribute('aria-label'),
               clip: s.scrollWidth > s.clientWidth + 1,
               rows: [...s.querySelectorAll('li')].some(li => li.scrollWidth > li.clientWidth + 1),
             }))"""
    )


async def run_viewport(browser, width: int, label: str):
    ctx = await browser.new_context(viewport={"width": width, "height": 1400})
    page = await ctx.new_page()
    await sign_in(ctx, page)
    await open_dashboard(page)

    toggles = page.locator("section[aria-label] button[aria-controls][aria-expanded]")
    count = await toggles.count()
    check(f"[{label}] three highlight cards render", count == 3, f"found {count}")

    # collapsed: no clipping
    rep = await overflow_report(page)
    check(f"[{label}] no clipping when collapsed", all(not r["clip"] and not r["rows"] for r in rep), str(rep))

    # ARIA + keyboard expand
    first = toggles.first
    panel_id = await first.get_attribute("aria-controls")
    check(f"[{label}] toggle exposes aria-controls", bool(panel_id))
    check(f"[{label}] toggle has accessible name", bool(await first.get_attribute("aria-label")))
    check(f"[{label}] starts collapsed", await first.get_attribute("aria-expanded") == "false")

    await first.focus()
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(500)
    check(f"[{label}] keyboard expands card", await first.get_attribute("aria-expanded") == "true")

    panel = page.locator(f"#{panel_id}")
    check(f"[{label}] panel has visible height when open", (await panel.bounding_box())["height"] > 20)

    # tooltips on detail icons
    tips = panel.locator('[data-testid="metric-tip"]')
    n_tips = await tips.count()
    titles = [await tips.nth(i).get_attribute("title") for i in range(n_tips)]
    check(f"[{label}] detail icons expose tooltips", n_tips > 0 and all(titles), str(titles))

    # expand all, verify no clipping while open
    for i in range(count):
        t = toggles.nth(i)
        if await t.get_attribute("aria-expanded") == "false":
            await t.click()
    await page.wait_for_timeout(600)
    rep = await overflow_report(page)
    check(f"[{label}] no clipping when expanded", all(not r["clip"] and not r["rows"] for r in rep), str(rep))

    # persistence across reload
    await page.reload(wait_until="domcontentloaded")
    await page.wait_for_selector("button[aria-controls][aria-expanded]", timeout=30000)
    await page.wait_for_timeout(800)
    states = [
        await toggles.nth(i).get_attribute("aria-expanded") for i in range(await toggles.count())
    ]
    check(f"[{label}] open state persists after reload", states == ["true"] * len(states), str(states))

    # persistence across in-app navigation
    await page.goto(f"{BASE}/readings", wait_until="domcontentloaded")
    await open_dashboard(page)
    await page.wait_for_timeout(800)
    states = [
        await toggles.nth(i).get_attribute("aria-expanded") for i in range(await toggles.count())
    ]
    check(f"[{label}] open state persists after navigation", states == ["true"] * len(states), str(states))

    # collapse again and confirm persisted closed state
    for i in range(await toggles.count()):
        await toggles.nth(i).click()
    await page.wait_for_timeout(500)
    await page.reload(wait_until="domcontentloaded")
    await page.wait_for_selector("button[aria-controls][aria-expanded]", timeout=30000)
    await page.wait_for_timeout(800)
    states = [
        await toggles.nth(i).get_attribute("aria-expanded") for i in range(await toggles.count())
    ]
    check(f"[{label}] closed state persists after reload", states == ["false"] * len(states), str(states))

    await page.screenshot(path=f"/tmp/browser/cards/e2e-{label}.png")
    await ctx.close()


async def run_device(p, browser, device_name: str, label: str):
    device = p.devices[device_name]
    ctx = await browser.new_context(**device)
    page = await ctx.new_page()
    await sign_in(ctx, page)
    await open_dashboard(page)

    rep = await overflow_report(page)
    check(f"[{label}] no clipping / text overlap", all(not r["clip"] and not r["rows"] for r in rep), str(rep))

    boxes = await page.evaluate(
        """() => [...document.querySelectorAll('section[aria-label] button[aria-controls]')]
             .map(b => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })"""
    )
    check(f"[{label}] toggle buttons are uniformly sized", len(set(map(str, boxes))) == 1, str(boxes))

    toggles = page.locator("section[aria-label] button[aria-controls][aria-expanded]")
    await toggles.first.tap() if device.get("has_touch") else await toggles.first.click()
    await page.wait_for_timeout(500)
    check(f"[{label}] tap expands details", await toggles.first.get_attribute("aria-expanded") == "true")

    await page.screenshot(path=f"/tmp/browser/cards/e2e-{label}.png")
    await ctx.close()


async def main():
    os.makedirs("/tmp/browser/cards", exist_ok=True)
    async with async_playwright() as p:
        chromium = await p.chromium.launch(headless=True)
        for w, label in ((360, "360px"), (768, "768px")):
            await run_viewport(chromium, w, label)
        await run_device(p, chromium, "Pixel 5", "android-chrome")
        await chromium.close()

        try:
            webkit = await p.webkit.launch(headless=True)
        except Exception as exc:  # webkit build not present in every environment
            print(f"SKIP [ios-safari] webkit unavailable :: {exc}")
        else:
            await run_device(p, webkit, "iPhone 12", "ios-safari")
            await webkit.close()

    print("\n" + ("ALL CHECKS PASSED" if not FAILURES else f"FAILED: {FAILURES}"))
    sys.exit(1 if FAILURES else 0)


asyncio.run(main())
