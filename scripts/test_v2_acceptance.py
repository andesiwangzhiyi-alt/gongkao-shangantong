# -*- coding: utf-8 -*-
"""上岸通 2.0 定向验收：数据、江苏A组卷、全真开关、画像日志、检索防抖、窄屏交互。"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get('SAT_TEST_URL', 'http://127.0.0.1:8124/index.html')
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
fails = []

def check(name, cond, extra=''):
    print(f'[{"PASS" if cond else "FAIL"}] {name} {extra}')
    if not cond:
        fails.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True, args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 360, 'height': 800}, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    js_errors = []
    page.on('pageerror', lambda e: js_errors.append(str(e)))
    page.on('console', lambda m: js_errors.append(m.text) if m.type == 'error' else None)
    page.goto(URL, wait_until='domcontentloaded', timeout=180000)
    # 首屏 HTML 不应同步引用 questions6 超大单文件，且应接入分片懒加载器
    direct = page.evaluate("""() => [...document.scripts].some(s => s.getAttribute('src') === 'js/questions6.js')""")
    lazy_wired = page.evaluate("""() => !!window.ensureFullBank && !!window.LAZY_BANK_STATUS""")
    check('A-首屏不直接同步加载352MB模考库', not direct and lazy_wired)
    # 后续验收需要完整题库，显式等待懒加载完成
    page.evaluate('ensureFullBank()')

    data = page.evaluate("""() => ({
      total: allQuestions().length,
      cacheSame: allQuestions() === allQuestions(),
      srcCount: allQuestions().filter(q => q.src && q.src.year).length,
      numCount: allQuestions().filter(q => Number.isInteger(q.num)).length
    })""")
    check('数据-总题库59068(去重后)', data['total'] == 59068, str(data))
    check('数据-allQuestions缓存复用', data['cacheSame'])
    check('数据-src结构化来源已注入', data['srcCount'] >= 52000, f"{data['srcCount']}")
    check('数据-卷内题号num已注入', data['numCount'] >= 52000, f"{data['numCount']}")

    # 江苏 A 模板验收
    page.evaluate('renderCustomQuiz()')
    page.select_option('#pcType', '江苏A类')
    page.dispatch_event('#pcType', 'change')
    paper = page.evaluate("""() => {
      const vals = Object.fromEntries([...document.querySelectorAll('.pc-num')].map(x => [x.dataset.mod, +x.value]));
      const list = paperQuestions();
      const counts = {};
      list.forEach(q => counts[q.mod] = (counts[q.mod] || 0) + 1);
      return {
        vals, counts, n: list.length,
        totalLabel: document.querySelector('#pcTotalNum').textContent,
        fullReal: document.querySelector('#pcFullReal').checked,
        minutes: selectedPaperMinutes(),
        allHaveMod: list.every(q => !!q.mod)
      };
    }""")
    expected = {'常识判断': 15, '言语理解': 45, '数量关系': 20, '判断推理': 45, '资料分析': 10}
    check('B-江苏A模板题量配置', paper['vals'] == expected, str(paper['vals']))
    check('B-江苏A实际组出135题', paper['n'] == 135 and paper['counts'] == expected, str(paper))
    check('B-组卷题全部带模块元数据', paper['allHaveMod'])
    check('B-江苏A计时120分钟', paper['minutes'] == 120)
    check('B-全真开关默认开启', paper['fullReal'])

    # C1 作答日志结构
    att = page.evaluate("""() => {
      store.attempts = [];
      recordResult({id:'accept-q',mod:'数量关系',type:'真题',tag:'2025·国考',src:{name:'2025国考',year:'2025',exam:'国考'},analysis:'【全站正确率 45%】\\n【考点：工程问题】',answer:0}, 1, false, 37);
      return store.attempts.at(-1);
    }""")
    check('C-逐题日志记录模块/对错/用时', att['mod'] == '数量关系' and not att['ok'] and att['dur'] == 37, str(att))
    check('C-逐题日志记录考点/难度代理', att['point'] == '工程问题' and att['rate'] == 45, str(att))

    # 检索防抖：输入后先忙碌，再返回无匹配
    page.evaluate('renderPractice()')
    page.fill('#searchKw', '___SAT_V2_ABSENT_TOKEN___')
    page.dispatch_event('#searchKw', 'input')
    page.wait_for_timeout(80)
    busy = '正在检索' in page.locator('#searchResults').inner_text()
    page.wait_for_timeout(600)
    result_text = page.locator('#searchResults').inner_text()
    check('D-检索防抖忙碌反馈', busy)
    check('D-检索防抖执行完成', '没有匹配' in result_text, result_text[:80])
    check('D-题库数量动态展示', '59,068' in page.locator('#view').inner_text())

    # 超窄屏导航与触摸热区
    nav = page.evaluate("""() => {
      const tab = document.querySelector('.tab');
      const optCss = getComputedStyle(tab);
      return {font: optCss.fontSize, height: tab.getBoundingClientRect().height, scroll: document.documentElement.scrollWidth, vw: innerWidth};
    }""")
    check('D-360px导航无横向溢出', nav['scroll'] <= nav['vw'] + 1, str(nav))
    check('D-窄屏导航字体压缩', nav['font'] == '9px', str(nav))
    check('D-触摸导航热区>=52px', nav['height'] >= 52, str(nav))

    # 键盘 Escape 退出答题层
    page.evaluate("startQuiz(allQuestions().slice(0,1),'快捷键测试')")
    page.once('dialog', lambda d: d.accept())
    page.keyboard.press('Escape')
    page.wait_for_timeout(150)
    check('D-Escape关闭答题层', page.locator('#quizLayer.hidden').count() == 1)

    check('验收-无JS错误', not js_errors, str(js_errors[:3]))
    browser.close()

print(f'==== v2 定向验收：通过 {20-len(fails)}/20，失败 {fails or "无"} ====')
raise SystemExit(1 if fails else 0)
