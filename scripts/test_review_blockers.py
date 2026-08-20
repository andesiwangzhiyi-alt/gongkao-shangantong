# -*- coding: utf-8 -*-
"""独立审查阻断项回归。用 BLOCKER_CASE 选择单项定向测试。"""
import os
from playwright.sync_api import sync_playwright

URL = os.environ.get("SAT_TEST_URL", "http://127.0.0.1:8142/index.html?review-blockers")
CASE = os.environ.get("BLOCKER_CASE", "all")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
fails = []


def check(name, ok, detail=""):
    print(f'[{"PASS" if ok else "FAIL"}] {name} {detail}')
    if not ok:
        fails.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL, wait_until="domcontentloaded", timeout=120000)

    if CASE in ("all", "images"):
        result = page.evaluate("""async () => {
          window.__xssProof=0;
          const malicious='x\\" onerror=\\"window.__xssProof=1';
          const q={
            stem:'题干[图0][图1][图2][图3][图4]',
            mat:'材料[图][图][图]',
            options:['选项[图]'],
            images:[malicious,'javascript:window.__xssProof=2','data:text/html,x','assets/ok.png','https://example.com/ok.png'],
            mat_images:[malicious,'javascript:window.__xssProof=3','http://example.com/ok.png'],
            opt_images:[[malicious,'javascript:window.__xssProof=4','/assets/root.png']],
          };
          const host=document.createElement('div');
          host.innerHTML=renderStem(q,q.stem)+renderMat(q)+optTextHtml(q,0)+optImgsHtml(q,0)
            +printStemHtml(q)+printMatHtml(q)+printOptsHtml(q);
          document.body.appendChild(host);
          await new Promise(r=>setTimeout(r,50));
          return {
            proof:window.__xssProof,
            onerror:host.querySelectorAll('[onerror]').length,
            srcs:[...host.querySelectorAll('img')].map(x=>x.getAttribute('src')),
            html:host.innerHTML,
          };
        }""")
        srcs = result["srcs"]
        check("图片 URL 注入不会形成事件属性或执行脚本", result["proof"] == 0 and result["onerror"] == 0, str(result))
        check("图片仅保留相对/http/https 协议", all(s and not s.lower().startswith(("javascript:", "data:")) for s in srcs) and any(s == "assets/ok.png" for s in srcs) and any(s == "/assets/root.png" for s in srcs) and any(s.startswith("http://") for s in srcs) and any(s.startswith("https://") for s in srcs), str(srcs))

    if CASE in ("all", "speech"):
        speech = page.evaluate("""() => {
          const instances=[];
          window.SpeechRecognition=class {
            constructor(){ this.stops=0; instances.push(this); }
            start(){ this.onstart?.(); }
            stop(){ this.stops++; this.onend?.(); }
          };
          switchTab('dashboard'); askMic('home'); const first=instances.at(-1);
          switchTab('shenlun');
          const switched={stops:first.stops,remaining:Object.keys(askRecognizers).length};

          switchTab('ai'); askMic('ai'); const second=instances.at(-1);
          renderView('profile');
          const rerendered={stops:second.stops,remaining:Object.keys(askRecognizers).length};

          switchTab('dashboard'); askMic('home'); const third=instances.at(-1);
          window.dispatchEvent(new Event('pagehide'));
          const hidden={stops:third.stops,remaining:Object.keys(askRecognizers).length,pressed:document.querySelector('[data-mic="home"]')?.getAttribute('aria-pressed')};

          switchTab('dashboard'); askMic('home'); const fourth=instances.at(-1);
          Object.defineProperty(document,'hidden',{configurable:true,value:true});
          document.dispatchEvent(new Event('visibilitychange'));
          const backgrounded={stops:fourth.stops,remaining:Object.keys(askRecognizers).length,pressed:document.querySelector('[data-mic="home"]')?.getAttribute('aria-pressed')};

          const q1={id:'speech-q1',type:'测试',stem:'第一题',options:['A','B','C','D'],answer:0,analysis:'解析',mod:'常识判断'};
          const q2={...q1,id:'speech-q2',stem:'第二题'};
          startQuiz([q1,q2],'语音生命周期测试'); Q.answers[q1.id]=0; renderQ();
          askMic('question'); const fifth=instances.at(-1); nextQ();
          const questionRedraw={stops:fifth.stops,remaining:Object.keys(askRecognizers).length};

          Q.idx=0; renderQ(); askMic('question'); const sixth=instances.at(-1); Q.list=[];
          document.querySelector('#quizClose').click();
          const quizClosed={stops:sixth.stops,remaining:Object.keys(askRecognizers).length};

          startQuiz([q1],'语音交卷测试'); Q.answers[q1.id]=0; renderQ();
          askMic('question'); const seventh=instances.at(-1); finishQuiz();
          const quizFinished={stops:seventh.stops,remaining:Object.keys(askRecognizers).length};
          closeResult();

          window.SpeechRecognition=class {
            start(){ this.onstart?.(); this.onerror?.({error:'not-allowed'}); this.onend?.(); }
            stop(){ this.onend?.(); }
          };
          switchTab('dashboard'); askMic('home');
          const denied=document.querySelector('.ask-status[data-context="home"]')?.textContent||'';
          renderProfile();
          const privacy=document.querySelector('#view')?.innerText||'';
          return {switched,rerendered,hidden,backgrounded,questionRedraw,quizClosed,quizFinished,denied,privacy};
        }""")
        check("切换视图停止并清理语音识别", speech["switched"] == {"stops": 1, "remaining": 0}, str(speech))
        check("重渲染停止并清理语音识别", speech["rerendered"] == {"stops": 1, "remaining": 0}, str(speech))
        check("pagehide 停止并清理语音识别", speech["hidden"] == {"stops": 1, "remaining": 0, "pressed": "false"}, str(speech))
        check("页面进入后台停止并清理语音识别", speech["backgrounded"] == {"stops": 1, "remaining": 0, "pressed": "false"}, str(speech))
        check("逐题重绘停止并清理语音识别", speech["questionRedraw"] == {"stops": 1, "remaining": 0}, str(speech))
        check("关闭答题层停止并清理语音识别", speech["quizClosed"] == {"stops": 1, "remaining": 0}, str(speech))
        check("交卷进入结果页停止并清理语音识别", speech["quizFinished"] == {"stops": 1, "remaining": 0}, str(speech))
        check("语音权限拒绝给出明确提示", "权限" in speech["denied"], str(speech))
        check("隐私文案区分问泽传输与浏览器语音处理", "不会发送给问泽" in speech["privacy"] and "浏览器" in speech["privacy"] and "权限" in speech["privacy"], str(speech))

    if CASE in ("all", "navigation"):
        navigation = page.evaluate("""async () => {
          const realEnsure=window.ensureFullBank, realStatus=window.LAZY_BANK_STATUS;
          let release;
          window.LAZY_BANK_STATUS={loaded:false};
          window.ensureFullBank=()=>new Promise(resolve=>{ release=resolve; });
          switchTab('practice');
          const waiting=currentView();
          switchTab('shenlun');
          const latest=currentView();
          window.LAZY_BANK_STATUS.loaded=true; release();
          await Promise.resolve(); await Promise.resolve();
          const settled=currentView();

          let releaseNormal;
          window.LAZY_BANK_STATUS={loaded:false};
          window.ensureFullBank=()=>new Promise(resolve=>{ releaseNormal=resolve; });
          switchTab('practice');
          window.LAZY_BANK_STATUS.loaded=true; releaseNormal();
          await Promise.resolve(); await Promise.resolve();
          const normal=currentView();

          window.ensureFullBank=realEnsure; window.LAZY_BANK_STATUS=realStatus;
          return {waiting,latest,settled,normal,heading:document.querySelector('.page-heading')?.innerText||''};
        }""")
        check("等待题库期间最后一次导航获胜", navigation["latest"] == "shenlun" and navigation["settled"] == "shenlun", str(navigation))
        check("没有新导航时题库就绪后进入原目标", navigation["normal"] == "practice" and navigation["heading"].startswith("行测研习"), str(navigation))

    check("阻断项测试无 JavaScript 运行错误", not errors, str(errors[:5]))
    browser.close()

print(f"==== 审查阻断项：失败 {fails or '无'} ====")
raise SystemExit(1 if fails else 0)
