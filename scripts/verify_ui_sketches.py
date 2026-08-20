# -*- coding: utf-8 -*-
"""渲染三套 UI 草图并检查桌面/移动端溢出与基础交互。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('SAT_SKETCH_URL', 'http://127.0.0.1:8124/sketches')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'sketches' / 'screenshots'
OUT.mkdir(parents=True, exist_ok=True)
variants = [
    ('ink-editorial', '001-ink-editorial/index.html'),
    ('clear-productivity', '002-clear-productivity/index.html'),
    ('warm-growth', '003-warm-growth/index.html'),
]
fails=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
    for name,path in variants:
        for label,size in [('desktop',{'width':1440,'height':960}),('mobile',{'width':390,'height':844})]:
            page=browser.new_page(viewport=size)
            errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'{BASE}/{path}',wait_until='load',timeout=60000)
            overflow=page.evaluate('document.documentElement.scrollWidth-innerWidth')
            if overflow>1 or errors: fails.append((name,label,overflow,errors))
            page.screenshot(path=str(OUT/f'{name}-{label}.png'),full_page=True)
            page.close()
    browser.close()
print(f'草图截图 6/6 已生成：{OUT}')
print('布局/JS检查：', 'PASS' if not fails else f'FAIL {fails}')
raise SystemExit(1 if fails else 0)
