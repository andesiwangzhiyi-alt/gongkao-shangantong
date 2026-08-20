# -*- coding: utf-8 -*-
"""致泽学堂 v2.4 生产 UI 响应式截图与布局门禁。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get("SAT_TEST_URL", "http://127.0.0.1:8141/index.html?v=zhize-visual")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
OUT = Path(__file__).resolve().parents[1] / "screenshots" / "v2.4"
OUT.mkdir(parents=True, exist_ok=True)
fails = []


def check(name, ok, detail=""):
    print(f'[{"PASS" if ok else "FAIL"}] {name} {detail}')
    if not ok:
        fails.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)
    for width, height, label in [(1440, 1000, "desktop"), (390, 844, "mobile-390"), (320, 760, "mobile-320")]:
        page = browser.new_page(viewport={"width": width, "height": height})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL, wait_until="domcontentloaded", timeout=120000)
        page.evaluate("if(window.LAZY_BANK_STATUS) window.LAZY_BANK_STATUS.loaded=true; switchTab('dashboard')")
        layout = page.evaluate("""() => ({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,ask:!!document.querySelector('.ask-composer[data-context="home"]'),current:document.querySelectorAll('.tab[aria-current="page"]').length})""")
        check(f"{label} 首页无横向溢出", layout["scroll"] <= layout["client"], str(layout))
        check(f"{label} 首页问泽与单一当前导航", layout["ask"] and layout["current"] == 1, str(layout))
        page.screenshot(path=str(OUT / f"home-{label}.png"), full_page=True)
        if label == "desktop":
            page.evaluate("switchTab('profile')")
            page.screenshot(path=str(OUT / "profile-desktop.png"), full_page=True)
            page.evaluate("""() => { const q={id:'visual-q',mod:'常识判断',type:'单选',stem:'以下关于依法行政的表述，正确的是：',options:['依法行政只约束行政机关','程序正当是依法行政的重要要求','行政效率可以替代法定程序','行政决定不需要说明理由'],answer:1,analysis:'依法行政既要求职权法定，也要求程序正当、权责统一。'}; startQuiz([q],'题目精讲'); pick(1); }""")
            page.screenshot(path=str(OUT / "question-ask-desktop.png"), full_page=False)
        check(f"{label} 无JavaScript错误", not errors, str(errors[:3]))
        page.close()
    browser.close()

print(f"生产 UI 截图：{OUT}")
print(f"==== 生产UI视觉门禁：通过 {9-len(fails)}/9，失败 {fails or '无'} ====")
raise SystemExit(1 if fails else 0)
