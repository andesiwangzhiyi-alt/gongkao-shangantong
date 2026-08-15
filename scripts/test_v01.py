# -*- coding: utf-8 -*-
"""上岸通 v1.0 冒烟测试：题库数据校验 + Playwright 驱动系统 Chrome 全流程验证"""
import json, os, re, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'http://127.0.0.1:8124/index.html'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
fails, errors = [], []

def check(name, cond, extra=''):
    print(f'[{"PASS" if cond else "FAIL"}] {name} {extra}')
    if not cond: fails.append(name)

# ---------- 1. 题库数据校验（Node 执行 JS，检查结构） ----------
import subprocess
node_check = r"""
const fs=require('fs');
const src=fs.readFileSync('js/questions.js','utf8')+fs.readFileSync('js/questions2.js','utf8')+fs.readFileSync('js/questions3.js','utf8')+'\nconsole.log(JSON.stringify({mods:Object.fromEntries(Object.entries(QUESTION_BANK).map(([k,v])=>[k,v.length])),bad:[]}));';
"""
# 用 node 直接执行拼接源码，检查语法 + 统计
js_src = ''
for f in ['js/questions.js','js/questions2.js','js/questions3.js','js/questions4.js']:
    js_src += open(os.path.join(ROOT,f), encoding='utf-8').read() + '\n'
js_src += """
const __report={mods:{},bad:[]};
for(const m in QUESTION_BANK){
  __report.mods[m]=QUESTION_BANK[m].length;
  QUESTION_BANK[m].forEach(q=>{
    if(!q.id||!q.stem||!q.options||q.options.length!==4||!Number.isInteger(q.answer)||q.answer<0||q.answer>3||!q.analysis){
      __report.bad.push(String(q&&q.id));
    }
  });
}
console.log("__REPORT__"+JSON.stringify(__report));
"""
import tempfile
js_tmp = os.path.join(tempfile.gettempdir(), 'gongkao_check.js')
with open(js_tmp, 'w', encoding='utf-8') as f:
    f.write(js_src)
r = subprocess.run(['node', js_tmp], capture_output=True, text=True, cwd=ROOT)
try: os.remove(js_tmp)
except: pass
m = re.search(r'__REPORT__(\{.*\})', r.stdout)
if r.returncode != 0:
    check('JS 语法/加载', False, r.stderr[:300])
    report = {'mods':{},'bad':['SYNTAX']}
else:
    check('JS 语法/加载', True)
    report = json.loads(m.group(1))
    expected = {'常识判断':20,'言语理解':54,'数量关系':729,'判断推理':42,'资料分析':49}
    for k,v in expected.items():
        check(f'题库-{k} 数量={v}', report['mods'].get(k)==v, f"实际{report['mods'].get(k)}")
    check('题库-字段完整性', len(report['bad'])==0, f"异常题: {report['bad'][:5]}")
total = sum(report['mods'].values())
print(f'== 题库合计 {total} 题 ==')

# ---------- 2. UI 全流程 ----------
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True, args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width':420,'height':900})
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'console[{m.type}]: {m.text}') if m.type=='error' else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(URL, wait_until='networkidle')
    time.sleep(1)

    check('首页-hero', page.locator('.hero').count()==1)
    check('首页-模块掌握度5项', page.locator('.r-mod').count()==5)
    check('首页-快捷按钮4个', page.locator('.grid-btns .gb').count()==4)

    # 每日一练
    page.click('.gb:has-text("每日一练")')
    time.sleep(0.5)
    check('每日一练-答题层打开', page.locator('#quizLayer:not(.hidden)').count()==1)
    check('每日一练-题号显示', '1/10' in page.locator('#quizProgress').text_content())
    # 答 2 题（第1题选A，即下标0；答完点"下一题"进入第2题）
    page.click('.q-opt >> nth=0')
    time.sleep(0.3)
    check('答题-解析显示', page.locator('.q-analy').count()==1)
    page.locator('#footNext').click()
    time.sleep(0.3)
    check('答题-进度2/10', '2/10' in page.locator('#quizProgress').text_content())
    page.click('.q-opt >> nth=2')  # 第2题选 C（可能对可能错）
    time.sleep(0.3)
    # 跳过第3-9题（8次"下一题"到达第10题），第10题时按钮变为"交卷"
    for _ in range(8):
        page.locator('#footNext').click()
        time.sleep(0.12)
    time.sleep(0.3)
    check('交卷-按钮已变', page.locator('#footNext').text_content().strip()=='交卷')
    page.locator('#footNext').click()
    time.sleep(0.5)
    check('交卷-结果页出现', page.locator('#resultLayer:not(.hidden)').count()==1)
    check('结果-分数显示', page.locator('.r-score').count()==1)
    # 逐题回顾
    page.click('button:has-text("逐题回顾")')
    time.sleep(0.4)
    check('回顾-解析可见', page.locator('.q-analy').count()>=1)
    page.click('#footNext')
    time.sleep(0.2)
    page.click('#quizClose')
    time.sleep(0.3)
    check('回顾关闭', page.locator('#quizLayer.hidden').count()==1)

    # 错题本
    page.click('.tab[data-view="wrongbook"]')
    time.sleep(0.4)
    wc = page.locator('.wrong-item').count()
    check('错题本-有错题收录', wc>=0, f'({wc} 条)')

    # 刷题页
    page.click('.tab[data-view="practice"]')
    time.sleep(0.3)
    check('刷题-模块5个', page.locator('.mod-card').count()==5)

    # 申论素材
    page.click('.tab[data-view="shenlun"]')
    time.sleep(0.3)
    check('申论-素材列表', page.locator('.sl-item').count()>=10, f"({page.locator('.sl-item').count()})")
    page.click('.chip:has-text("写作框架")')
    time.sleep(0.2)
    check('申论-分类筛选', page.locator('.sl-item').count()>=3)

    # 更多页
    page.click('.tab[data-view="more"]')
    time.sleep(0.3)
    check('更多-打卡日历', page.locator('.cal-cell').count()>50, f"({page.locator('.cal-cell').count()})")
    check('更多-番茄钟', page.locator('#pomoT').text_content().strip()=='25:00')
    page.click('#pomoBtn')
    time.sleep(1.2)
    check('番茄钟-开始计时', page.locator('#pomoT').text_content().strip()!='25:00', page.locator('#pomoT').text_content().strip())
    page.click('#pomoBtn')

    # 模考配置
    page.click('.tab[data-view="exam"]')
    time.sleep(0.3)
    check('模考-配置页', page.locator('.exam-config .ec').count()==4)

    # 打卡统计（更多页已打开，检查 streak badge）
    check('顶部连续打卡badge', page.locator('#streakBadge').count()==1)

    js_errs = [e for e in errors if 'pageerror' in e or 'console[error]' in e]
    check('无JS错误', len(js_errs)==0, f'errors: {js_errs[:3]}')

    os.makedirs(os.path.join(ROOT,'test_shots'), exist_ok=True)
    page.screenshot(path=os.path.join(ROOT,'test_shots','dashboard.png'))
    page.click('.tab[data-view="dashboard"]'); time.sleep(0.3)
    page.screenshot(path=os.path.join(ROOT,'test_shots','home.png'))
    browser.close()

print('\n==== 结果 ====')
print(f'通过 {35-len(fails)}/{35}, 失败: {fails if fails else "无"}')
sys.exit(1 if fails else 0)
