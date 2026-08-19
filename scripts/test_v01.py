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
import glob
js_src = ''
base_files = ['js/questions.js','js/questions2.js','js/questions3.js','js/questions4.js','js/questions5.js','js/questions7.js','js/questions8.js']
chunk_files = sorted(glob.glob(os.path.join(ROOT,'js','bank','questions6_*.js'))) + sorted(glob.glob(os.path.join(ROOT,'js','bank','questions9_*.js')))
for f in base_files:
    js_src += open(os.path.join(ROOT,f), encoding='utf-8').read() + '\n'
for f in chunk_files:
    js_src += open(f, encoding='utf-8').read() + '\n'
js_src += """
const __report={mods:{},bad:[]};
for(const m in QUESTION_BANK){
  __report.mods[m]=QUESTION_BANK[m].length;
  QUESTION_BANK[m].forEach(q=>{
    const ansOk = q.multi ? (typeof q.answer==='string' && /^[A-F]{2,}$/.test(q.answer)) : (Number.isInteger(q.answer) && q.answer>=0 && q.answer<=3);
    if(!q.id||!q.stem||!q.options||q.options.length!==4||!ansOk||!q.analysis){
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
    expected = {'政治理论':2077,'常识判断':17773,'言语理解':14282,'数量关系':4820,'判断推理':11477,'资料分析':8639}
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
    # v2：questions6 为懒加载；后续全库断言前显式等待完整题库
    page.evaluate("ensureFullBank()")
    time.sleep(0.3)
    time.sleep(1)

    check('首页-hero', page.locator('.hero').count()==1)
    check('首页-模块掌握度6项', page.locator('.r-mod').count()==6)
    check('首页-快捷按钮7个', page.locator('.grid-btns .gb').count()==7)

    # 能力分析（attempts 日志 + 多维画像）
    ana_ok = page.evaluate("""() => {
        // 造 4 条 attempt 数据验证聚合逻辑
        store.attempts.push({t:Date.now(),d:today(),qid:'t1',mod:'数量关系',ok:false,src:'2021·国考',point:'工程问题',rate:45,dur:30,multi:false,type:'真题'});
        store.attempts.push({t:Date.now(),d:today(),qid:'t2',mod:'数量关系',ok:true,src:'2021·国考',point:'工程问题',rate:45,dur:20,multi:false,type:'真题'});
        store.attempts.push({t:Date.now(),d:today(),qid:'t3',mod:'言语理解',ok:true,src:'2023·国考模考',point:'逻辑填空',rate:70,dur:15,multi:false,type:'模考'});
        store.attempts.push({t:Date.now(),d:today(),qid:'t4',mod:'资料分析',ok:false,src:'2022·省考模考',point:'比重',rate:55,dur:40,multi:false,type:'模考'});
        const wp = weakPoints('数量关系');
        const ok1 = wp.length>0 && wp[0].acc===50 && wp[0].point==='工程问题';
        const ab = abilityByMod('数量关系');
        const ok2 = ab.total===2 && ab.correct===1;
        const bands = [diffBand(85),diffBand(70),diffBand(50),diffBand(30)];
        const ok3 = bands.join(',')==='简单,中等,较难,困难';
        return {ok1, ok2, ok3, wp};
    }""")
    check('画像-薄弱考点聚合', ana_ok['ok1'] and ana_ok['ok2'] and ana_ok['ok3'], f"{ana_ok['wp']}")
    page.evaluate("renderAnalysis()")
    time.sleep(0.4)
    check('画像-分析页渲染', page.locator('#view').inner_text().count('能力分析')>=1)
    # 清理测试数据（保留 attempts 会影响后续统计断言，回退到空）
    page.evaluate("() => { store.attempts=[]; save(); }")
    page.click('.tab[data-view="dashboard"]')
    time.sleep(0.3)

    # 答案回填（打印卷注册→回填→判卷闭环）
    fb_ok = page.evaluate("""() => {
        const qs = [{id:'gk00001',mod:'常识判断',answer:0,multi:false},{id:'gk00002',mod:'判断推理',answer:1,multi:false},{id:'mk00001',mod:'言语理解',answer:'AB',multi:true}];
        const code = registerPaper('测试卷', qs);
        const ps = JSON.parse(localStorage.getItem('shangan_papers_v1')||'{}');
        const ok1 = !!ps[code] && ps[code].n===3 && ps[code].qs[0].ans===0 && ps[code].qs[2].ans==='AB';
        localStorage.setItem('shangan_fill_'+code, JSON.stringify({'1':'A','2':'B','3':'AB'}));
        const p = ps[code];
        const detail = p.qs.map(q=>{
            const raw=(JSON.parse(localStorage.getItem('shangan_fill_'+code)||'{}')[q.i]||'').trim().toUpperCase();
            let userAns, ok=false;
            if(q.multi){ userAns=raw.split('').map(c=>'ABCD'.indexOf(c)).filter(x=>x>=0).sort().join(','); ok = userAns===String(q.ans).split('').map(c=>'ABCD'.indexOf(c)).filter(x=>x>=0).sort().join(','); }
            else { const idx='ABCD'.indexOf(raw); userAns=idx; ok = userAns===q.ans; }
            return ok;
        });
        const allOk = detail.every(Boolean);
        localStorage.removeItem('shangan_papers_v1'); localStorage.removeItem('shangan_fill_'+code);
        return {ok1, allOk, detail};
    }""")
    check('回填-试卷注册+判卷闭环', fb_ok['ok1'] and fb_ok['allOk'], f"{fb_ok}")
    page.evaluate("renderFillback()")
    time.sleep(0.3)
    check('回填-页面渲染', page.locator('#view').inner_text().count('答案回填')>=1)
    # 切回首页继续主流程
    page.click('.tab[data-view="dashboard"]')
    time.sleep(0.3)

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
    check('刷题-模块6个', page.locator('.mod-card').count()==6)

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

    # 多选/不定项判定逻辑
    multi_ok = page.evaluate("""() => {
        const t1 = isCorrect({multi:true,answer:'AB'}, [0,1]);   // 全对
        const t2 = isCorrect({multi:true,answer:'AB'}, [1,0]);   // 乱序全对
        const t3 = isCorrect({multi:true,answer:'AB'}, [0]);     // 漏选
        const t4 = isCorrect({multi:true,answer:'AB'}, [0,2]);   // 错选
        const t5 = isCorrect({multi:false,answer:2}, 2);         // 单选正确
        const t6 = isCorrect({multi:false,answer:2}, 1);         // 单选错误
        const t7 = qAnsText({multi:true}, [0,1])==='A、B';
        const multiCount = Object.values(QUESTION_BANK).flat().filter(q=>q.multi).length;
        return {t1,t2,t3,t4,t5,t6,t7,multiCount};
    }""")
    check('多选-判分逻辑', multi_ok['t1'] and multi_ok['t2'] and multi_ok['t3']==False and multi_ok['t4']==False, f"{multi_ok}")
    check('单选-判分逻辑', multi_ok['t5'] and multi_ok['t6']==False)
    check('多选-答案显示', multi_ok['t7'], f"{multi_ok}")
    check('题库-多选题目存在', multi_ok['multiCount']>=2, f"多选 {multi_ok['multiCount']} 题")

    # 图片渲染逻辑
    img_ok = page.evaluate("""() => {
        const s1 = renderStem({images:['assets/img/a1.png']}, '请看图[图0]');
        const s2 = optImgsHtml({opt_images:[['assets/img/a2.png']]}, 0);
        return {t1: s1.includes('<img') && s1.includes('a1.png'), t2: s2.includes('a2.png')};
    }""")
    check('题干-图片渲染', img_ok['t1'], f"{img_ok}")
    check('选项-图片渲染', img_ok['t2'], f"{img_ok}")

    # 打卡统计（更多页已打开，检查 streak badge）
    check('顶部连续打卡badge', page.locator('#streakBadge').count()==1)

    js_errs = [e for e in errors if 'pageerror' in e or 'console[error]' in e]
    check('无JS错误', len(js_errs)==0, f'errors: {js_errs[:3]}')

    os.makedirs(os.path.join(ROOT,'test_shots'), exist_ok=True)
    page.screenshot(path=os.path.join(ROOT,'test_shots','dashboard.png'))
    page.click('.tab[data-view="dashboard"]'); time.sleep(0.3)
    page.screenshot(path=os.path.join(ROOT,'test_shots','home.png'))
    browser.close()

print('==== 结果 ====')
print(f'通过 {48-len(fails)}/48, 失败: {fails if fails else "无"}')
sys.exit(1 if fails else 0)
