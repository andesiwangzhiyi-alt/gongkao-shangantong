# -*- coding: utf-8 -*-
"""验证致泽学堂融合版草图的响应式布局和关键交互。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get(
    "SAT_ZHIZE_URL",
    "http://127.0.0.1:8137/sketches/004-zhize-academy-fusion/index.html",
)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sketches" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

fails = []
checks = 0


def check(name, ok, detail=""):
    global checks
    checks += 1
    if not ok:
        fails.append(f"{name}: {detail}")


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        headless=True,
    )
    sizes = [
        ("desktop", {"width": 1440, "height": 960}),
        ("mobile", {"width": 390, "height": 844}),
        ("mobile-320", {"width": 320, "height": 760}),
    ]
    for label, viewport in sizes:
        page = browser.new_page(viewport=viewport)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE, wait_until="load", timeout=60000)

        overflow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
        check(f"{label} 无横向溢出", overflow <= 1, str(overflow))
        check(f"{label} 无 JS 错误", not errors, str(errors))
        brand_selector = ".brand-name strong" if label == "desktop" else ".mobile-name"
        check(
            f"{label} 品牌可见",
            page.locator(brand_selector).is_visible(),
        )
        check(
            f"{label} 首页成长反馈可见",
            page.get_by_text("你已超过上周的自己", exact=True).is_visible(),
        )
        check(
            f"{label} 首页问泽输入可见",
            page.locator('.ai-composer[data-surface="home"] textarea').is_visible(),
        )
        check(
            f"{label} 首页语音入口可见",
            page.locator('.ai-composer[data-surface="home"] .mic').is_visible(),
        )
        page.screenshot(path=str(OUT / f"zhize-fusion-{label}.png"), full_page=True)

        if label == "desktop":
            nav_order = page.locator(".side-nav .label").all_text_contents()
            check(
                "桌面一级导航顺序",
                nav_order
                == ["学堂首页", "行测研习", "申论书房", "修业成长", "问泽", "我的书斋"],
                str(nav_order),
            )
            page.locator('.nav-btn[data-view="shenlun"]').click()
            check("申论一级页可进入", page.get_by_text("申论内容正在重新整理").is_visible())
            page.get_by_role("button", name="查看页面骨架").first.click()
            check("申论二级页可进入", page.get_by_text("素材簿页面骨架已保留").is_visible())
            page.get_by_label("返回申论书房").click()
            page.locator('.nav-btn[data-view="ai"]').click()
            check("问泽一级页可进入", page.get_by_text("问泽服务正在筹备").is_visible())
            page.screenshot(path=str(OUT / "zhize-fusion-ai-desktop.png"), full_page=True)
            page.locator('.nav-btn[data-view="practice"]').click()
            page.get_by_role("button", name="查看题目解析与问泽示例").click()
            check("题库原始解析在题目页可见", page.get_by_text("题库原始解析", exact=True).is_visible())
            check(
                "逐题问泽输入位于解析页",
                page.locator('.ai-composer[data-surface="question"] textarea').is_visible(),
            )
            page.screenshot(path=str(OUT / "zhize-fusion-question-ai-desktop.png"), full_page=True)
            page.locator('.nav-btn[data-view="profile"]').click()
            check("背景选择共十项", page.locator(".scene-choice").count() == 10)
            page.get_by_role("button", name="烟水").click()
            check("背景切换即时生效", page.locator("body").get_attribute("data-scene") == "lake")
            page.get_by_label("切换点击涟漪").click()
            page.wait_for_timeout(700)
            page.get_by_role("button", name="管理数据").click()
            check("关闭涟漪后不创建动画节点", page.locator(".ripple-wave").count() == 0)
            page.screenshot(path=str(OUT / "zhize-fusion-settings-desktop.png"), full_page=True)
        else:
            page.locator('.mobile-tab[data-view="practice"]').click()
            check(f"{label} 底栏切换行测", page.get_by_text("把每次练习，落到具体进步").is_visible())

        page.close()
    browser.close()

print(f"致泽融合版截图 4 张已生成：{OUT}")
print(f"交互/布局检查：通过 {checks - len(fails)}/{checks}")
if fails:
    print("失败：", fails)
raise SystemExit(1 if fails else 0)
