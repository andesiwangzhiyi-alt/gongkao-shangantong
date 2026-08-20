# -*- coding: utf-8 -*-
"""上岸通 v2.1 前端定向验收：多来源、搜索、图片打印、移动端布局。"""
import os
import time
from playwright.sync_api import sync_playwright

URL=os.environ.get('SAT_TEST_URL', 'http://127.0.0.1:8124/index.html')
CHROME=r'C:\Program Files\Google\Chrome\Application\chrome.exe'
fails=[]
def check(name, ok, detail=''):
    print(f'[{"PASS" if ok else "FAIL"}] {name} {detail}')
    if not ok: fails.append(name)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROME, headless=True)
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL, wait_until='domcontentloaded', timeout=60000)
    page.evaluate('() => ensureFullBank()')
    for _ in range(150):
        if page.evaluate('() => LAZY_BANK_STATUS.loaded'): break
        time.sleep(.2)

    data=page.evaluate('''() => {
      const multi=allQuestions().find(q=>q.srcs&&q.srcs.length>=2);
      const stemImg=allQuestions().find(q=>q.images&&q.images.length&&/\\[图\\d+\\]/.test(q.stem));
      const optImg=allQuestions().find(q=>q.opt_images&&q.opt_images.some(a=>a&&a.length));
      return {
        multiId:multi&&multi.id,
        tags:multi&&srcTags(multi),
        sourcePairs:multi&&[multi.src,...multi.srcs].map(s=>[s.name,s.num]),
        stemPrint:stemImg&&printStemHtml(stemImg),
        optPrint:optImg&&printOptsHtml(optImg),
        wait:printWaitScript(),
        clean:cleanAnalysisText('正文\\n视频解析\\n考点X来源2022年某卷第1题笔记')
      };
    }''')
    check('多来源题可检出', bool(data['multiId']), str(data['multiId']))
    check('来源标签展示多个来源', len(data['tags'] or [])>=3, str(data['tags'][:3] if data['tags'] else None))
    check('来源标签包含原卷题号', all('第' in x and '题' in x for x in (data['tags'] or [])), str(data['tags'][:2] if data['tags'] else None))
    check('来源-题号成对且均非空', all(a and b is not None for a,b in (data['sourcePairs'] or [])))
    check('题干图片打印为真实img', '<img ' in (data['stemPrint'] or '') and '（图）' not in (data['stemPrint'] or ''))
    check('选项图片打印为真实img', '<img ' in (data['optPrint'] or '') and '[图]' not in (data['optPrint'] or ''))
    check('打印等待图片加载', 'document.images' in data['wait'] and '4000' in data['wait'])
    check('解析运行时兜底去垃圾', '视频解析' not in data['clean'] and '笔记' not in data['clean'], repr(data['clean']))

    # 来源/标签关键词搜索
    page.evaluate('renderPractice()')
    page.fill('#searchTag','福建')
    page.evaluate('doSearch()')
    count=page.evaluate('() => (__lastSearch||[]).length')
    first=page.locator('#searchResults').inner_text()[:120]
    check('来源关键词“福建”可搜索', count>0, f'{count}题 {first}')
    check('搜索结果渲染来源标签', '福建' in page.locator('#searchResults').inner_text())

    # 390px 各主要页面不得把根文档撑宽；局部日历/申论导航允许自身滚动
    widths=[]
    for fn in ['renderDash','renderPractice','renderShenlun','renderMore']:
        page.evaluate(f'{fn}()')
        page.wait_for_timeout(80)
        widths.append((fn,page.evaluate('() => [document.documentElement.scrollWidth,innerWidth]')))
    check('390px主要页面无根级横向溢出', all(a<=b+1 for _,(a,b) in widths), str(widths))
    check('无JS运行错误', not errors, str(errors[:3]))
    browser.close()

print(f'==== v2.1前端验收：通过 {12-len(fails)}/12，失败 {fails or "无"} ====')
raise SystemExit(1 if fails else 0)
