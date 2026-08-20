# -*- coding: utf-8 -*-
"""致泽学堂正式 UI v2.4：问泽首页、逐题入口与一级页面。"""
import os
from playwright.sync_api import sync_playwright

URL = os.environ.get("SAT_TEST_URL", "http://127.0.0.1:8141/index.html?v=zhize-features-red")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
fails = []


def check(name, ok, detail=""):
    print(f'[{"PASS" if ok else "FAIL"}] {name} {detail}')
    if not ok:
        fails.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.add_init_script(
        """
        window.SpeechRecognition=class {
          start(){
            this.onstart?.();
            this.onresult?.({results:[[{transcript:'请解释资料分析的思路'}]]});
            this.onend?.();
          }
          stop(){ this.onend?.(); }
        };
        """
    )
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL, wait_until="domcontentloaded", timeout=120000)

    page.evaluate("switchTab('dashboard')")
    check("首页直接显示问泽对话框", page.locator('.ask-composer[data-context="home"]').count() == 1)
    check("首页问泽明确尚未接入且不冒充回答", "尚未接入" in page.locator('.ask-composer[data-context="home"]').inner_text())
    check("首页问泽文字输入具有可访问名称", page.locator('#ask-home[aria-label="向问泽提问"]').count() == 1)
    check("首页问泽提供语音和发送按钮", page.locator('[data-mic="home"]').count() == 1 and page.locator('[data-send="home"]').count() == 1)

    page.locator('.ask-composer[data-context="home"] .ask-chip').first.click()
    check("推荐问题可写入输入框", bool(page.locator('#ask-home').input_value().strip()), page.locator('#ask-home').input_value())
    page.locator('[data-send="home"]').click()
    check("服务未接入时问题不被清空并明确未发送", bool(page.locator('#ask-home').input_value().strip()) and "不会发送" in page.locator('.ask-status[data-context="home"]').inner_text())
    page.locator('#ask-home').fill('题库加载期间保留这段草稿')
    page.evaluate("window.dispatchEvent(new CustomEvent('sat:bank-loaded',{detail:{cacheHit:true}}))")
    check("完整题库异步就绪不清空首页问泽草稿", page.locator('#ask-home').input_value() == '题库加载期间保留这段草稿', page.locator('#ask-home').input_value())

    page.locator('[data-mic="home"]').click()
    check("语音识别结果进入输入框供确认", "请解释资料分析的思路" in page.locator('#ask-home').input_value(), page.locator('#ask-home').input_value())
    check("语音结束后恢复非录音状态", page.locator('[data-mic="home"]').get_attribute('aria-pressed') == 'false')

    page.evaluate("if(window.LAZY_BANK_STATUS) window.LAZY_BANK_STATUS.loaded=true; switchTab('practice')")
    check("行测一级页使用行测研习标题", page.locator('.page-heading').first.inner_text().startswith('行测研习'))
    check("行测一级页集中每日练习模考和错题入口", all(page.get_by_role('button', name=name).count() for name in ['每日研习', '模拟策试', '错题温习']))

    page.evaluate("switchTab('shenlun')")
    check("申论一级页使用申论书房标题", page.locator('.page-heading').first.inner_text().startswith('申论书房'))

    page.evaluate("switchTab('growth')")
    check("成长一级页使用修业成长标题", page.locator('.page-heading').first.inner_text().startswith('修业成长'))
    check("修业成长提供能力图谱错题温习和专注修习", all(page.get_by_role('button', name=name).count() for name in ['能力图谱', '错题温习', '专注修习']))

    page.evaluate("switchTab('ai')")
    check("问泽一级页提供独立文字语音对话框", page.locator('.ask-composer[data-context="ai"]').count() == 1 and page.locator('[data-mic="ai"]').count() == 1)

    page.evaluate("switchTab('profile')")
    check("我的书斋提供十种环境背景", page.locator('.scene-choice').count() == 10)
    page.get_by_role('button', name='清荷').click()
    check("书斋背景切换即时生效", page.locator('html').get_attribute('data-scene') == 'lotus')
    ripple = page.get_by_role('button', name='点击涟漪')
    before = ripple.get_attribute('aria-pressed')
    ripple.click()
    check("书斋涟漪开关可访问并持久化", before != ripple.get_attribute('aria-pressed') and page.evaluate("JSON.parse(localStorage.getItem('zhize_ui_prefs_v1')).ripple") == (ripple.get_attribute('aria-pressed') == 'true'))
    check("我的书斋保留数据与题库管理入口", page.get_by_role('button', name='数据管理').count() == 1 and page.get_by_role('button', name='题库与缓存').count() == 1)

    question = page.evaluate(
        """() => {
          const q={id:'zhize-question-reg',mod:'常识判断',type:'单选',stem:'致泽逐题测试',options:['甲','乙','丙','丁'],answer:0,analysis:'这是题库提供的原始解析。'};
          startQuiz([q],'逐题问泽测试'); pick(0);
          const analysis=document.querySelector('.q-analy.original-analysis');
          const ask=document.querySelector('.question-ask');
          return {original:analysis?.innerText||'',ask:!!ask,after:!!(analysis&&ask&&(analysis.compareDocumentPosition(ask)&Node.DOCUMENT_POSITION_FOLLOWING)),context:ask?.querySelector('.question-context')?.innerText||''};
        }"""
    )
    check("作答后明确标识题库原始解析", '题库原始解析' in question['original'], str(question))
    check("问泽逐题对话框位于原始解析之后", question['ask'] and question['after'], str(question))
    check("逐题问泽显示当前题目与我的答案上下文", '当前题目' in question['context'] and '我的答案 A' in question['context'], str(question))
    page.evaluate("finishQuiz(); reviewQuiz()")
    check("逐题回顾同样保留问泽入口", page.locator('.question-ask .ask-composer[data-context="question"]').count() == 1)

    check("阶段2至4无JavaScript运行错误", not errors, str(errors[:5]))
    browser.close()

print(f"==== 致泽正式UI阶段2至4：通过 {24-len(fails)}/24，失败 {fails or '无'} ====")
raise SystemExit(1 if fails else 0)
