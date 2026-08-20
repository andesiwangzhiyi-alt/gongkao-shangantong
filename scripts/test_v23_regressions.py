# -*- coding: utf-8 -*-
"""上岸通 v2.3 非题库回归：空练习、计时、多选用时、XSS 与可访问性。"""
import os
from playwright.sync_api import sync_playwright

URL = os.environ.get('SAT_TEST_URL', 'http://127.0.0.1:8124/index.html')
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
fails = []

def check(name, ok, detail=''):
    print(f'[{"PASS" if ok else "FAIL"}] {name} {detail}')
    if not ok:
        fails.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL, wait_until='domcontentloaded', timeout=120000)

    # 空列表不能打开无法退出的空白答题层。
    page.evaluate("startQuiz([], '空练习')")
    check('空练习被拦截', page.locator('#quizLayer').evaluate("e=>e.classList.contains('hidden')"))
    check('空练习有明确提示', '没有可练习' in page.locator('#toast').inner_text())

    # 非计时练习也应显示真实总用时，而不是固定 00:00。
    elapsed = page.evaluate("""() => {
      const q={id:'timer-reg',mod:'常识判断',type:'单选',stem:'测试',options:['A','B','C','D'],answer:0,analysis:'解析'};
      startQuiz([q], '计时回归'); Q.start=Date.now()-65000; Q.answers[q.id]=0; finishQuiz();
      return document.querySelector('#resultBox').innerText;
    }""")
    check('普通练习统计真实总用时', '01:05' in elapsed, elapsed.replace('\n', ' ')[:100])
    page.evaluate("closeResult()")

    exam_timer = page.evaluate("""() => {
      if(typeof updateQuizTimer!=='function') return {supported:false};
      const realNow=Date.now; let now=1700000000000; Date.now=()=>now;
      try{
        const q={id:'deadline-reg',mod:'常识判断',type:'单选',stem:'测试',options:['A','B','C','D'],answer:0,analysis:'解析'};
        startQuiz([q], '模考跳时', 60); clearInterval(Q.timer); Q.timer=null;
        now+=55000; updateQuizTimer();
        const jumped={text:document.querySelector('#quizTimer').innerText,elapsed:Q.elapsed,deadline:Q.deadline};
        now+=6000; updateQuizTimer();
        const expired={hidden:document.querySelector('#quizLayer').classList.contains('hidden'),result:document.querySelector('#resultBox').innerText};
        return {supported:true,jumped,expired};
      } finally { Date.now=realNow; closeResult(); }
    }""")
    check('模考倒计时按wall-clock时间跳跃', exam_timer.get('supported') and exam_timer['jumped']['text'].endswith('00:05') and exam_timer['jumped']['elapsed'] == 55 and exam_timer['jumped']['deadline'] == 1700000060000, str(exam_timer))
    check('模考时间跳过deadline立即交卷', exam_timer.get('supported') and exam_timer['expired']['hidden'] and '时间到' in exam_timer['expired']['result'], str(exam_timer))

    score = page.evaluate("""() => {
      const q=i=>({id:'score-'+i,mod:'常识判断',type:'单选',stem:'测试',options:['A','B','C','D'],answer:0,analysis:'解析'});
      startQuiz([q(1),q(2)], '计分回归'); Q.answers['score-1']=0; finishQuiz();
      return document.querySelector('.r-score').innerText;
    }""")
    check('未作答题计入试卷分母', '50' in score, score)
    page.evaluate("closeResult()")

    # 多选每次点选会重渲染，但不应重置本题进入时间。
    dur = page.evaluate("""() => {
      store.attempts=[];
      const q={id:'multi-reg',mod:'常识判断',type:'多选',multi:true,stem:'测试',options:['A','B','C','D'],answer:'A',analysis:'解析'};
      startQuiz([q], '多选用时'); Q._qEnter=Date.now()-5000; pick(0); submitMulti();
      return store.attempts.at(-1)?.dur;
    }""")
    check('多选重渲染不重置用时', dur is not None and dur >= 4, str(dur))
    page.evaluate("document.querySelector('#quizLayer').classList.add('hidden'); document.body.style.overflow=''; modalBackground(false)")

    # 导入备份中的文本必须按纯文本渲染，不能执行 HTML。
    xss = page.evaluate("""() => {
      window.__satXss=0;
      store.customSl=[{cat:'<img src=x onerror="window.__satXss=1">',title:"含'引号",body:'正文',custom:true}];
      renderShenlun();
      return {ran:window.__satXss, imgs:document.querySelectorAll('#slList img').length, text:document.querySelector('#slList').innerText};
    }""")
    check('自定义素材分类按纯文本渲染', not xss['ran'] and xss['imgs'] == 0 and '<img' in xss['text'], str(xss))

    # 搜索结果行应进入该题，而不是把全部命中题随机开练。
    direct = page.evaluate("""() => {
      __lastSearch=[allQuestions()[0],allQuestions()[1]];
      startSearchResult(1);
      return {n:Q.list.length,id:Q.list[0]?.id,want:__lastSearch[1].id};
    }""")
    check('搜索结果点击直达单题', direct['n'] == 1 and direct['id'] == direct['want'], str(direct))
    page.evaluate("document.querySelector('#quizLayer').classList.add('hidden'); document.body.style.overflow=''; modalBackground(false)")

    due = page.evaluate("""() => {
      const qs=allQuestions().slice(0,6), gaps=[1,2,3,4,7,15]; store.wrongs={};
      gaps.forEach((gap,i)=>{ const d=new Date(); d.setDate(d.getDate()-gap); store.wrongs[qs[i].id]={count:10,mastered:false,lastWrong:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}; });
      return {ids:reviewDue().map(q=>q.id), expected:qs.filter((_,i)=>i!==2).map(q=>q.id), excluded:qs[2].id};
    }""")
    check('复习曲线严格采用1/2/4/7/15天', set(due['ids']) == set(due['expected']) and due['excluded'] not in due['ids'], str(due))

    normalized = page.evaluate("""() => {
      const d=normalizeStore({stats:{answered:'bad'},wrongs:null,checkins:[],favs:'bad',customSl:{},pomo:null,attempts:{},settings:null});
      return {wrongs:Array.isArray(d.wrongs)?'array':typeof d.wrongs, favs:Array.isArray(d.favs), custom:Array.isArray(d.customSl), attempts:Array.isArray(d.attempts), answered:d.stats.answered};
    }""")
    check('损坏本地数据安全归一化', normalized == {'wrongs':'object','favs':True,'custom':True,'attempts':True,'answered':0}, str(normalized))
    surrogate = page.evaluate("""() => {
      try{
        store=normalizeStore({stats:{},wrongs:{},customSl:[{cat:'恶意\\ud800分类',title:'标题\\udc00',body:'正文'}]});
        renderShenlun();
        return {ok:true,cat:store.customSl[0].cat,title:store.customSl[0].title,text:document.querySelector('#view').innerText};
      }catch(e){ return {ok:false,error:String(e)}; }
    }""")
    check('未配对surrogate归一化后申论渲染不抛错', surrogate['ok'] and '\ufffd' in surrogate['cat'] and '\ufffd' in surrogate['title'], str(surrogate))
    attempts = page.evaluate("""() => {
      const rows=Array.from({length:3010},(_,i)=>({t:i,d:'2026-08-20',qid:'q'+i,mod:'常识判断',ok:true}));
      const kept=normalizeStore({stats:{},wrongs:{},attempts:rows}).attempts;
      return {n:kept.length,first:kept[0]?.qid,last:kept.at(-1)?.qid};
    }""")
    check('归一化attempts保留最近3000条', attempts == {'n':3000,'first':'q10','last':'q3009'}, str(attempts))
    import_xss = page.evaluate("""() => { store=normalizeStore({stats:{answered:'<img src=x onerror=window.__importXss=1>'},wrongs:{},pomo:{count:'<img src=x onerror=window.__importXss=1>'},attempts:[{mod:'<img>',point:'x'}]},true); window.__importXss=0; renderMore(); return {ran:window.__importXss,imgs:document.querySelectorAll('#view img').length,count:store.pomo.count}; }""")
    check('恶意备份数值字段不能形成持久化XSS', not import_xss['ran'] and import_xss['imgs'] == 0 and import_xss['count'] == 0, str(import_xss))

    check('来源画像区分真题与模考', page.evaluate("sourceBand('2025·国考')==='国考真题' && sourceBand('2025·省考模考')==='模考' && sourceBand('2024·省考')==='省考/联考真题'"))
    daily = page.evaluate("""() => {
      store.checkins[today()]={answered:5,correct:5}; renderDaily(); const before=document.querySelector('.pill').innerText;
      const q=allQuestions()[0]; recordResult(q,q.answer,true,1,'daily'); renderDaily(); return {before,after:document.querySelector('.pill').innerText};
    }""")
    check('每日一练成绩不混入其他练习', '未完成' in daily['before'] and '1/1' in daily['after'], str(daily))
    week = page.evaluate("""() => { renderDaily(); const cells=[...document.querySelectorAll('.week-grid .cal-cell')]; return {n:cells.length,lefts:cells.map(x=>Math.round(x.getBoundingClientRect().left))}; }""")
    check('本周打卡按周一至周日横向对齐', week['n'] == 7 and week['lefts'] == sorted(week['lefts']) and len(set(week['lefts'])) == 7, str(week))

    fill = page.evaluate("""async () => {
      if(!document.querySelector('#fbResult')) document.body.insertAdjacentHTML('beforeend','<div id="fbResult"></div>');
      const answer=q=>q.multi?String(q.answer):'ABCD'[q.answer];
      const fresh=()=>normalizeStore({stats:{},wrongs:{}});
      const make=(title,q)=>{ const code=registerPaper(title,[q]); localStorage.setItem('shangan_fill_'+code,JSON.stringify({'1':answer(q)})); return code; };
      const q=allQuestions()[0], lateQ={...q,id:'fill-late-bank-reg'}, realEnsure=window.ensureFullBank, realStatus=window.LAZY_BANK_STATUS;

      store=fresh(); save(); const waitCode=make('等待题库',lateQ); let release;
      window.LAZY_BANK_STATUS={loaded:false}; window.ensureFullBank=()=>new Promise(r=>{release=()=>{ QUESTION_BANK[lateQ.mod].push(lateQ); allQuestions._c=null; r(); };});
      const pending=submitFill(waitCode); await Promise.resolve();
      const waitedBefore={answered:store.stats.answered,submitted:!!loadPapers()[waitCode].submittedAt};
      if(release) release(); await pending;
      const waitedAfter={answered:store.stats.answered,submitted:!!loadPapers()[waitCode].submittedAt};
      const lateIndex=QUESTION_BANK[lateQ.mod].findIndex(x=>x.id===lateQ.id); if(lateIndex>=0) QUESTION_BANK[lateQ.mod].splice(lateIndex,1); allQuestions._c=null;
      window.ensureFullBank=realEnsure; window.LAZY_BANK_STATUS={loaded:true};

      store=fresh(); save();
      const missingQ={...q,id:'fill-missing-reg'}, partialCode=registerPaper('部分缺题',[q,missingQ]);
      localStorage.setItem('shangan_fill_'+partialCode,JSON.stringify({'1':answer(q),'2':answer(missingQ)}));
      await submitFill(partialCode);
      const partialMissing={answered:store.stats.answered,submitted:!!loadPapers()[partialCode].submittedAt};

      const nativeSet=Storage.prototype.setItem;
      store=fresh(); save(); const storeFailCode=make('主存储失败',q);
      Storage.prototype.setItem=function(k,v){ if(k===KEY) throw new Error('store fail'); return nativeSet.call(this,k,v); };
      await submitFill(storeFailCode); Storage.prototype.setItem=nativeSet;
      const storeFail={answered:store.stats.answered,submitted:!!loadPapers()[storeFailCode].submittedAt};

      store=fresh(); save(); const paperFailCode=make('试卷存储失败',q); let failedPaper=false;
      Storage.prototype.setItem=function(k,v){ if(k===PAPER_KEY&&!failedPaper){ failedPaper=true; throw new Error('paper fail'); } return nativeSet.call(this,k,v); };
      await submitFill(paperFailCode); Storage.prototype.setItem=nativeSet;
      const paperFailed={answered:store.stats.answered,persisted:JSON.parse(localStorage.getItem(KEY)).stats.answered,submitted:!!loadPapers()[paperFailCode].submittedAt};
      await submitFill(paperFailCode);
      const paperRetry={answered:store.stats.answered,persisted:JSON.parse(localStorage.getItem(KEY)).stats.answered,submitted:!!loadPapers()[paperFailCode].submittedAt};

      store=fresh(); save(); const okCode=make('幂等成功',q); const before=store.stats.answered;
      await submitFill(okCode); const once=store.stats.answered; await submitFill(okCode);
      const success={before,once,twice:store.stats.answered,submitted:!!loadPapers()[okCode].submittedAt};
      window.ensureFullBank=realEnsure; window.LAZY_BANK_STATUS=realStatus;
      return {waitedBefore,waitedAfter,partialMissing,storeFail,paperFailed,paperRetry,success};
    }""")
    check('回填等待ensureFullBank完成再记账锁卷', fill['waitedBefore'] == {'answered':0,'submitted':False} and fill['waitedAfter'] == {'answered':1,'submitted':True}, str(fill))
    check('回填存在部分缺题时不部分记账不锁卷', fill['partialMissing'] == {'answered':0,'submitted':False}, str(fill))
    check('回填主store保存失败不锁卷不记账', fill['storeFail'] == {'answered':0,'submitted':False}, str(fill))
    check('回填试卷保存失败保留事务统计但不锁卷', fill['paperFailed'] == {'answered':1,'persisted':1,'submitted':False}, str(fill))
    check('回填试卷保存失败后重试只补标记不重复统计', fill['paperRetry'] == {'answered':1,'persisted':1,'submitted':True}, str(fill))
    success = fill['success']
    check('同一回填码保存成功后重复提交不重复记账', success['once'] == success['before'] + 1 and success['twice'] == success['once'] and success['submitted'], str(fill))

    viewport = page.locator('meta[name="viewport"]').get_attribute('content') or ''
    check('允许浏览器缩放', 'user-scalable=no' not in viewport)
    check('底部导航具有可访问名称', page.locator('nav[aria-label="主要功能"]').count() == 1)
    check('当前标签暴露aria-current', page.locator('.tab[aria-current="page"]').count() == 1)
    check('开关使用原生按钮', page.evaluate("renderMore(); !!document.querySelector('button.switch[aria-pressed]')"))
    check('模考快捷入口支持键盘聚焦', page.evaluate("renderExamConfig(); document.querySelectorAll('button.exam-config .ec, .exam-config button.ec').length === 4"))
    check('题库筛选控件具有可访问名称', page.evaluate("renderPractice(); [...document.querySelectorAll('.search-grid select')].every(x=>x.getAttribute('aria-label'))"))
    dialog = page.evaluate("""() => { const q=allQuestions()[0]; startQuiz([q],'焦点隔离'); const ok=document.querySelector('#view').hasAttribute('inert')&&!document.querySelector('#quizLayer').hasAttribute('inert'); document.querySelector('#quizLayer').classList.add('hidden'); modalBackground(false); return ok; }""")
    check('答题对话框隔离底层页面焦点', dialog)
    focus = page.evaluate("""() => {
      switchTab('dashboard'); const entry=document.querySelector('#view button'); entry.focus();
      const q=allQuestions()[0]; startQuiz([q],'焦点恢复'); Q.answers[q.id]=q.answer; finishQuiz(); closeResult();
      const restored=document.activeElement?.matches('.tab[aria-current="page"]');
      startQuiz([q],'回顾焦点'); Q.answers[q.id]=q.answer; finishQuiz(); reviewQuiz();
      const reviewFocused=document.activeElement===document.querySelector('#quizLayer');
      Q.idx=Q.list.length-1; renderReview(); document.querySelector('#footNext').click();
      const resultFocused=document.activeElement===document.querySelector('#resultLayer'); closeResult();
      return {restored,reviewFocused,resultFocused};
    }""")
    check('关闭结果后焦点回到当前导航标签', focus['restored'], str(focus))
    check('进入逐题回顾时焦点回到答题dialog', focus['reviewFocused'], str(focus))
    check('回顾返回结果时焦点回到结果dialog', focus['resultFocused'], str(focus))

    imported = page.evaluate("""async () => {
      const run=async data=>{
        const input=document.createElement('input'); input.type='file'; const dt=new DataTransfer();
        dt.items.add(new File([JSON.stringify(data)],'backup.json',{type:'application/json'})); input.files=dt.files;
        importData(input); await new Promise(r=>setTimeout(r,30));
      };
      store=normalizeStore({stats:{answered:7,correct:3},wrongs:{}}); save();
      const nativeSet=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){ if(k===KEY) throw new Error('import save fail'); return nativeSet.call(this,k,v); };
      await run({stats:{answered:99,correct:88},wrongs:{}}); Storage.prototype.setItem=nativeSet;
      const failed={memory:store.stats.answered,persisted:JSON.parse(localStorage.getItem(KEY)).stats.answered,toast:document.querySelector('#toast').innerText};
      await run({stats:{answered:42,correct:40},wrongs:{}}); store=load();
      const success={memory:store.stats.answered,persisted:JSON.parse(localStorage.getItem(KEY)).stats.answered,toast:document.querySelector('#toast').innerText};
      return {failed,success};
    }""")
    check('导入保存失败不替换内存且不提示成功', imported['failed']['memory'] == 7 and imported['failed']['persisted'] == 7 and '失败' in imported['failed']['toast'] and '成功' not in imported['failed']['toast'], str(imported))
    check('导入保存成功后刷新仍为新数据', imported['success']['memory'] == 42 and imported['success']['persisted'] == 42 and '导入成功' in imported['success']['toast'], str(imported))
    reset = page.evaluate("""() => { localStorage.setItem('shangan_fill_TEST','{}'); localStorage.setItem('shangan_papers_v1','{}'); const old=window.confirm; window.confirm=()=>true; confirmReset(); window.confirm=old; return {paper:localStorage.getItem('shangan_papers_v1'),fill:localStorage.getItem('shangan_fill_TEST')}; }""")
    check('清空全部学习数据包含试卷和回填', reset['paper'] is None and reset['fill'] is None, str(reset))
    reset_pomo = page.evaluate("""() => {
      pomo={running:true,work:true,left:12,total:1500,timer:setInterval(()=>{},1000)};
      const old=window.confirm; window.confirm=()=>true; confirmReset(); window.confirm=old;
      const out={running:pomo.running,timer:pomo.timer,left:pomo.left,total:pomo.total}; if(pomo.timer) clearInterval(pomo.timer); return out;
    }""")
    check('清空数据同时停止并重置番茄钟', reset_pomo == {'running':False,'timer':None,'left':1500,'total':1500}, str(reset_pomo))
    check('无JS运行错误', not errors, str(errors[:3]))
    browser.close()

print(f'==== v2.3回归：通过 {38-len(fails)}/38，失败 {fails or "无"} ====')
raise SystemExit(1 if fails else 0)
