/* ============ 上岸通 · 考公学习神器 ============ */
/* 纯前端、零依赖、本地存储、离线可用 */

/* ---------- 工具 ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function fmtDate(offset){ const d = new Date(Date.now()+offset*86400000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function shuffle(a){ const r=[...a]; for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];} return r; }
function mulberry32(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function seededShuffle(a, seed){ const rnd=mulberry32(seed); const r=[...a]; for(let i=r.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[r[i],r[j]]=[r[j],r[i]];} return r; }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toast(msg, type){ const t=$('#toast'); t.textContent=msg; t.className='toast '+ (type||''); t.classList.remove('hidden'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.add('hidden'), 2200); }
const MODS = Object.keys(QUESTION_BANK);
const MOD_ICO = {'常识判断':'🧠','言语理解':'🗣️','数量关系':'🔢','判断推理':'🧩','资料分析':'📊'};
const MOD_COLOR = {'常识判断':'#3d7edb','言语理解':'#3aa876','数量关系':'#e0962f','判断推理':'#8e6fd8','资料分析':'#d96a4f'};

/* ---------- 存储 ---------- */
const KEY='shangan_tong_v1';
const DEF = { wrongs:{}, checkins:{}, stats:{answered:0,correct:0,byMod:{},daily:[]}, favs:[], customSl:[], pomo:{count:0,minutes:0}, settings:{dailyCount:10,reviewOn:true} };
let store = load();
function load(){ try{ const d=JSON.parse(localStorage.getItem(KEY)); return Object.assign({},DEF, d||{}, {stats:Object.assign({},DEF.stats,(d||{}).stats), settings:Object.assign({},DEF.settings,(d||{}).settings)}); }catch(e){ return JSON.parse(JSON.stringify(DEF)); } }
function save(){ localStorage.setItem(KEY, JSON.stringify(store)); }
function allQuestions(){ return MODS.flatMap(m=>QUESTION_BANK[m].map(q=>({...q,mod:m}))); }

/* ---------- 数据操作 ---------- */
function recordResult(q, picked, correct){
  store.stats.answered++; correct && store.stats.correct++;
  const bm = store.stats.byMod[q.mod] = store.stats.byMod[q.mod]||{answered:0,correct:0};
  bm.answered++; correct && bm.correct++;
  if(!correct){
    const w = store.wrongs[q.id] = store.wrongs[q.id]||{count:0,mastered:false,lastWrong:''};
    w.count++; w.mastered=false; w.lastWrong=today();
  }
  store.checkins[today()] = store.checkins[today()]||{answered:0,correct:0};
  store.checkins[today()].answered++; correct && store.checkins[today()].correct++;
  const td=store.stats.daily; const last=td[td.length-1];
  if(last && last.date===today()){ last.answered++; correct&&last.correct++; } else td.push({date:today(),answered:1,correct:correct?1:0});
  if(td.length>60) td.shift();
  save();
}
function streakDays(){
  let n=0; const d=new Date();
  while(true){
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if(store.checkins[key]){ n++; d.setDate(d.getDate()-1); } else break;
  }
  return n;
}
function reviewDue(){
  if(!store.settings.reviewOn) return [];
  const days={1:1,2:2,3:4,4:7,5:15};
  const out=[];
  for(const qid in store.wrongs){
    const w=store.wrongs[qid]; if(w.mastered||!w.lastWrong) continue;
    const gap=Math.floor((Date.now()-new Date(w.lastWrong).getTime())/86400000);
    if(days[gap]===undefined) continue;
    const q=allQuestions().find(x=>x.id===qid);
    if(q && (w.count<=5||gap>=7)) out.push(q);
  }
  return out;
}

/* ---------- 视图路由 ---------- */
const VIEWS=['dashboard','practice','daily','exam','wrongbook','shenlun','more'];
function switchTab(v){ VIEWS.forEach(x=>{ $$(`.tab[data-view="${x}"]`)[0].classList.toggle('active', x===v); }); renderView(v); }
function renderView(v){
  $('#streakBadge').innerHTML=`🔥 <b>${streakDays()}</b>天`;
  const map={dashboard:renderDash,practice:renderPractice,daily:renderDaily,exam:renderExamConfig,wrongbook:renderWrong,shenlun:renderShenlun,more:renderMore};
  $('#view').innerHTML=''; map[v](); window.scrollTo(0,0);
}

/* ============ 仪表盘 ============ */
function renderDash(){
  const t=today(); const ci=store.checkins[t]||{answered:0,correct:0};
  const acc=store.stats.answered? Math.round(store.stats.correct/store.stats.answered*100):0;
  const due=reviewDue();
  const V=$('#view');
  V.innerHTML=`
  <div class="hero">
    <h1>上岸通 · 今日备考</h1>
    <div class="sub">${ci.answered? `今日已练 ${ci.answered} 题，正确 ${ci.correct} 题`:'今日还没开始，刷几题保持手感吧！'}</div>
    <div class="hero-stats">
      <div class="hs"><b>${store.stats.answered}</b><span>累计做题</span></div>
      <div class="hs"><b>${acc}%</b><span>总正确率</span></div>
      <div class="hs"><b>${streakDays()}</b><span>连续打卡(天)</span></div>
      <div class="hs"><b>${due.length}</b><span>今日待复习</span></div>
    </div>
  </div>
  <div class="grid-btns mb10">
    <button class="gb" onclick="quickStart('每日一练')"><span class="gi">📅</span><span class="gt">每日一练</span></button>
    <button class="gb" onclick="quickStart('随机刷题')"><span class="gi">🎲</span><span class="gt">随机刷题</span></button>
    <button class="gb" onclick="quickStart('错题重练')"><span class="gi">🔁</span><span class="gt">错题重练</span></button>
    <button class="gb" onclick="quickStart('模拟考试')"><span class="gi">⏱️</span><span class="gt">模拟考试</span></button>
  </div>
  <div class="card">
    <h3><span class="dot"></span>模块掌握度</h3>
    ${MODS.map(m=>{const b=store.stats.byMod[m]||{answered:0,correct:0}; const p=b.answered?Math.round(b.correct/b.answered*100):0;
      return `<div class="r-mod"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${MOD_ICO[m]} ${m}</span><span>${b.answered?p+'%':'未练习'}</span></div>
      <div class="rm-bar"><div class="rm-fill" style="width:${b.answered?p:0}%;background:${MOD_COLOR[m]}"></div></div></div>`;}).join('')}
  </div>
  <div class="card">
    <h3><span class="dot"></span>近14天做题趋势</h3>
    <div class="rate-bar">${last14Bars()}</div>
  </div>
  ${due.length? `<div class="card" style="border-left:3px solid var(--gold)">
    <h3><span class="dot"></span>艾宾浩斯复习提醒</h3>
    <div class="muted mb10">按遗忘曲线（1/2/4/7/15天），今日有 <b style="color:var(--gold)">${due.length}</b> 道错题需要复习</div>
    <button class="btn primary" onclick="quickStart('错题重练')">开始复习 →</button>
  </div>`:''}
  <div class="card">
    <h3><span class="dot"></span>备考小贴士</h3>
    <div class="muted">行测 120 分钟 135 题，平均每题不到 1 分钟——<b>时间优先留给有把握的题</b>。建议按「言语→判断→资料→常识→数量」顺序作答，数量关系最后做，不会就蒙，不恋战。</div>
  </div>`;
}
function last14Bars(){
  const days=store.stats.daily.slice(-14);
  const byDate={}; days.forEach(d=>byDate[d.date]=d);
  let html='';
  for(let i=13;i>=0;i--){
    const key=fmtDate(-i); const d=byDate[key];
    const pct=d&&d.answered?Math.min(100,Math.round(d.correct/d.answered*100)):0;
    const h=d&&d.answered?Math.max(8,pct):2;
    html+=`<div class="rate-col"><div class="bar" style="height:${h}%" title="${key}: ${pct}%"></div><div class="lb">${key.slice(5)}</div></div>`;
  }
  return html;
}
function quickStart(which){
  if(which==='每日一练') startQuiz(makeDaily(),'每日一练 · '+today());
  else if(which==='随机刷题') startQuiz(shuffle(allQuestions()).slice(0,10),'随机刷题 10 题');
  else if(which==='错题重练'){ const due=reviewDue(); const list=due.length?due:wrongList();
    startQuiz(shuffle(list),'错题重练 · '+(due.length?'待复习':'全部错题')+' '+list.length+'题'); }
  else if(which==='模拟考试') renderExamConfig();
}

/* ============ 刷题 ============ */
function renderPractice(){
  $('#view').innerHTML=`
  <div class="card"><h3><span class="dot"></span>选择模块开始刷题</h3><div class="muted mb10">每模块 ${MODS.map(m=>`${m} ${QUESTION_BANK[m].length}题`).join(' · ')}</div>
    <div class="mod-list">
      ${MODS.map(m=>{const b=store.stats.byMod[m]||{answered:0,correct:0};const p=b.answered?Math.round(b.correct/b.answered*100):0;
        return `<button class="mod-card" onclick="startQuiz(shuffle(QUESTION_BANK['${m}']),'${m} · 顺序练习')">
        <span class="mi" style="background:${MOD_COLOR[m]}22">${MOD_ICO[m]}</span>
        <span class="mt"><b>${m}${b.answered?`<span class="acc">${p}%</span>`:''}</b><span>${QUESTION_BANK[m].length} 题 · 含解析</span></span></button>`;}).join('')}
    </div>
  </div>
  <div class="card"><h3><span class="dot"></span>更多练习方式</h3>
    <div class="btn-row">
      <button class="btn" onclick="startQuiz(shuffle(allQuestions()),'全模块随机 15 题')">🎲 全模块随机</button>
      <button class="btn gold" onclick="startQuiz(shuffle(allQuestions().filter(q=>q.mod==='数量关系'||q.mod==='资料分析')).slice(0,8),'数量+资料强化')">💪 数量+资料</button>
    </div>
  </div>`;
}

/* ============ 每日一练 ============ */
function makeDaily(){
  const seed = Number(today().replace(/-/g,''));
  const plan={常识判断:2,言语理解:3,数量关系:1,判断推理:3,资料分析:1};
  let out=[];
  MODS.forEach(m=>{ out=out.concat(seededShuffle(QUESTION_BANK[m], seed+m.length).slice(0, plan[m]||0)); });
  return seededShuffle(out, seed);
}
function renderDaily(){
  const seed=Number(today().replace(/-/g,''));
  const qs=makeDaily(); const t=today(); const ci=store.checkins[t]||{};
  const best = ci.answered? `${ci.correct}/${ci.answered}`:'未完成';
  $('#view').innerHTML=`
  <div class="card">
    <h3><span class="dot"></span>每日一练 · ${t}</h3>
    <div class="muted">每天固定 ${qs.length} 题（按日期生成，当天题目不变），保持手感、积少成多。</div>
    <div class="mt14" style="display:flex;gap:10px;align-items:center">
      <button class="btn primary" onclick="startQuiz(makeDaily(),'每日一练 · ${t}')">开始今日练习 (${qs.length}题)</button>
      <span class="pill">今日成绩：${best}</span>
    </div>
  </div>
  <div class="card"><h3><span class="dot"></span>本周打卡</h3><div class="cal-wrap"><div class="weekdays">${'一二三四五六日'.split('').map((w,i)=>`<span>${w}</span>`).join('')}</div><div class="cal-grid">${weekStrip()}</div></div></div>`;
}
function weekStrip(){
  const t=new Date(); const dow=(t.getDay()+6)%7; let html='';
  for(let i=6;i>=0;i--){
    const d=new Date(Date.now()-(dow+i)*86400000);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const done=!!store.checkins[key]; const isT=key===today();
    html+=`<div class="cal-cell ${done?'done':''} ${isT?'today':''}">${d.getDate()}</div>`;
  }
  return html;
}

/* ============ 模拟考试 ============ */
function renderExamConfig(){
  $('#view').innerHTML=`
  <div class="card"><h3><span class="dot"></span>模拟考试</h3>
    <div class="muted mb10">按真实国考题型结构组卷：常识/言语/数量/判断/资料 混合计时作答，交卷后出具成绩单。可自定义题量。</div>
    <div class="exam-config mt14">
      <div class="ec" onclick="examQuick(20)"><b>20题</b><span>20分钟 · 快速自测</span></div>
      <div class="ec" onclick="examQuick(35)"><b>35题</b><span>35分钟 · 半套</span></div>
      <div class="ec" onclick="examQuick(50)"><b>50题</b><span>50分钟 · 标准套</span></div>
      <div class="ec" onclick="renderExamCustom()"><b>自定义</b><span>自选题量/时间</span></div>
    </div>
  </div>
  <div class="card"><h3><span class="dot"></span>模考技巧</h3><div class="muted">
    • 资料分析性价比最高，建议优先完成<br>
    • 数量关系放最后，不会的果断放弃<br>
    • 全程控制节奏：平均每题 1 分钟<br>
    • 答完立即涂卡（练习即模拟）</div>
  </div>`;
}
function examQuick(n){ startQuiz(makeExam(n), `模拟考试 · ${n}题/${n}分钟`, n*60); }
function renderExamCustom(){
  $('#view').innerHTML=`
  <div class="card"><h3><span class="dot"></span>自定义模考</h3>
    <div class="field"><label>题目数量（10-70）</label><input id="exN" type="number" min="10" max="70" value="40"></div>
    <div class="field"><label>考试时长（分钟）</label><input id="exT" type="number" min="5" max="150" value="40"></div>
    <button class="btn primary" onclick="examCustom()">开始考试</button>
  </div>`;
}
function examCustom(){ const n=+$('#exN').value, t=+$('#exT').value; startQuiz(makeExam(n), `模拟考试 · ${n}题/${t}分钟`, t*60); }
function makeExam(n){
  const ratio={常识判断:0.2,言语理解:0.3,数量关系:0.1,判断推理:0.25,资料分析:0.15};
  let out=[];
  MODS.forEach(m=>{ const cnt=Math.max(1, Math.round(n*ratio[m])); out=out.concat(seededShuffle(QUESTION_BANK[m], 20260815).slice(0,cnt)); });
  out=seededShuffle(out, n*7+2026);
  return out.slice(0, n);
}

/* ============ 错题本 ============ */
function wrongList(){ const ids=Object.keys(store.wrongs).filter(id=>!store.wrongs[id].mastered); return allQuestions().filter(q=>ids.includes(q.id)); }
function renderWrong(){
  const list=wrongList();
  const all=allQuestions(); const tot=Object.keys(store.wrongs).length;
  $('#view').innerHTML=`
  <div class="card"><h3><span class="dot"></span>错题本</h3>
    <div class="muted mb10">答错的题自动收录，共 ${tot} 题（待重练 ${list.length} 题）。按艾宾浩斯遗忘曲线安排复习，掌握后可标记移除。</div>
    <div class="btn-row">
      <button class="btn primary" onclick="startQuiz(shuffle(list),'错题重练 · '+list.length+'题')">重练全部错题 (${list.length})</button>
      <button class="btn" onclick="renderWrongByMod()">按模块筛选</button>
    </div>
  </div>
  ${list.length===0? `<div class="empty"><span class="big">🎉</span>太棒了，没有待重练的错题！<br><span class="muted">继续刷题保持手感吧</span></div>`:
  `<div class="card"><h3><span class="dot"></span>错题列表（${list.length}）</h3>
   ${list.slice(0,50).map(q=>{const w=store.wrongs[q.id];
     return `<div class="wrong-item"><div class="wt">${esc(q.stem).slice(0,60)}…</div>
     <div class="wm"><span class="tag">${q.mod}</span><span class="tag">错${w.count}次</span><span class="tag">${w.lastWrong}</span>
     <button class="btn small" style="margin-left:auto" onclick="startQuiz([allQuestions().find(x=>x.id==='${q.id}')],'单题精练')">重练</button>
     <button class="btn small green" onclick="markMastered('${q.id}')">已掌握 ✓</button></div></div>`;}).join('')}
  </div>`}`;
}
function renderWrongByMod(){
  const list=wrongList(); const byMod={};
  list.forEach(q=>{ (byMod[q.mod]=byMod[q.mod]||[]).push(q); });
  $('#view').innerHTML=`
  <div class="card"><h3><span class="dot"></span>按模块重练</h3><button class="btn small" onclick="renderWrong()" style="margin-bottom:10px">← 返回错题本</button>
    <div class="mod-list">${Object.keys(byMod).map(m=>`<button class="mod-card" onclick="startQuiz(shuffle(byMod['${m}']),'${m}错题 · '+${byMod[m].length}+'题')"><span class="mi">${MOD_ICO[m]}</span><span class="mt"><b>${m}</b><span>${byMod[m].length} 题待重练</span></span></button>`).join('')}
    </div></div>`;
}
function markMastered(qid){ store.wrongs[qid].mastered=true; save(); toast('已标记掌握 ✅','ok'); renderWrong(); }

/* ============ 申论素材 ============ */
function renderShenlun(cat){
  const cats=['全部',...new Set(SHENLUN_BANK.map(s=>s.cat))];
  const cur=cat||'全部';
  const items=[...SHENLUN_BANK.filter(s=>cur==='全部'||s.cat===cur), ...store.customSl.filter(s=>cur==='全部'||s.cat===cur)];
  $('#view').innerHTML=`
  <div class="card"><h3><span class="dot"></span>申论素材库</h3>
    <div class="muted mb10">金句 · 热点 · 案例 · 框架，分类积累，考前冲刺背一背。</div>
    <div class="field"><input id="slSearch" placeholder="🔍 搜索素材关键词…" oninput="renderShenlunSearch()"></div>
    <div class="sl-nav">${cats.map(c=>`<button class="chip ${c===cur?'active':''}" onclick="renderShenlun('${c}')">${c}</button>`).join('')}</div>
  </div>
  <div id="slList">${shenlunItems(items)}</div>
  <div class="card"><h3><span class="dot"></span>添加自定义素材</h3>
    <div class="field"><label>分类</label><select id="slCat"><option>名言金句</option><option>时政热点</option><option>案例素材</option><option>写作框架</option><option>应用文模板</option><option>我的笔记</option></select></div>
    <div class="field"><label>标题</label><input id="slTitle" placeholder="如：基层减负素材"></div>
    <div class="field"><label>内容</label><textarea id="slBody" rows="3" placeholder="输入素材内容…"></textarea></div>
    <button class="btn primary" onclick="addCustomSl()">保存素材</button>
  </div>`;
}
function shenlunItems(items){
  if(!items.length) return '<div class="empty"><span class="big">📭</span>暂无素材</div>';
  return items.map((s,i)=>{ const isFav=store.favs.includes(s.title);
    return `<div class="sl-item ${isFav?'fav':''}"><div class="sl-title"><span>${esc(s.title)} <span class="tag">${s.cat}</span></span>
    <span style="display:flex;gap:8px"><button class="star ${isFav?'on':''}" onclick="toggleFav('${esc(s.title)}')">★</button>
    ${s.custom?`<button class="star" onclick="delCustomSl('${esc(s.title)}')">🗑</button>`:''}</span></div>
    <div class="sl-body">${esc(s.body)}</div></div>`;}).join('');
}
function renderShenlunSearch(){
  const kw=$('#slSearch').value.trim();
  const items=[...SHENLUN_BANK,...store.customSl].filter(s=>!kw||s.title.includes(kw)||s.body.includes(kw)||s.cat.includes(kw));
  $('#slList').innerHTML=shenlunItems(items);
}
function toggleFav(title){
  const i=store.favs.indexOf(title);
  i>=0?store.favs.splice(i,1):store.favs.push(title);
  save(); renderShenlun(); toast(i>=0?'已取消收藏':'已收藏 ❤️', i>=0?'':'ok');
}
function addCustomSl(){
  const title=$('#slTitle').value.trim(), body=$('#slBody').value.trim(), cat=$('#slCat').value;
  if(!title||!body){ toast('标题和内容不能为空','error'); return; }
  store.customSl.push({cat,title,body,custom:true});
  save(); toast('素材已保存 ✅','ok'); renderShenlun();
}
function delCustomSl(title){
  store.customSl=store.customSl.filter(s=>s.title!==title);
  save(); toast('已删除'); renderShenlun();
}

/* ============ 更多 ============ */
function renderMore(){
  const due=reviewDue();
  $('#view').innerHTML=`
  <div class="card"><h3><span class="dot"></span>打卡日历</h3>
    <div class="muted mb10">连续打卡 ${streakDays()} 天，共打卡 ${Object.keys(store.checkins).length} 天。每天首次完成练习即自动打卡。</div>
    <div class="cal-wrap"><div class="weekdays">${'一二三四五六日'.split('').map(w=>`<span>${w}</span>`).join('')}</div><div class="cal-grid">${heatmap()}</div></div>
  </div>
  <div class="card"><h3><span class="dot"></span>🍅 番茄专注钟</h3>
    <div class="pomo-circle" id="pomoC"><div class="pomo-time" id="pomoT">25:00</div></div>
    <div class="pomo-state" id="pomoS">工作 25 分钟 · 休息 5 分钟</div>
    <div class="btn-row">
      <button class="btn primary" id="pomoBtn" onclick="pomoToggle()">开始专注</button>
      <button class="btn" onclick="pomoReset()">重置</button>
    </div>
    <div class="center muted mt8">今日已完成 <b id="pomoCnt">${store.pomo.count}</b> 个番茄 · 累计专注 <b>${store.pomo.minutes}</b> 分钟</div>
  </div>
  <div class="card"><h3><span class="dot"></span>复习与提醒</h3>
    <div class="list-row"><div><div class="l-title">艾宾浩斯复习提醒</div><div class="l-sub">错题按 1/2/4/7/15 天提醒复习，今日 ${due.length} 题</div></div>
    <div class="switch ${store.settings.reviewOn?'on':''}" onclick="toggleReview()"></div></div>
  </div>
  <div class="card"><h3><span class="dot"></span>📄 真题资源库（全网精选）</h3>
    <div class="muted mb10">以下为全网公开的历年真题与题库资源，点开即可使用：</div>
    <div class="sl-item"><div class="sl-title"><span>🏛️ 历年省考行测真题 PDF（2003-2025）</span></div>
      <div class="sl-body">全网最全省考真题库：30+ 省市历年《行测》真题+答案解析 PDF（1.1GB，持续更新），含联考/选调/深圳市考等。
      获取：github.com/SGHCN0762/civil-provice-exam-xingce → 下载 ZIP 或按需下载单个 PDF 打印刷题。</div>
      <div class="btn-row"><button class="btn small primary" onclick="openUrl('https://github.com/SGHCN0762/civil-provice-exam-xingce')">打开仓库</button></div>
    </div>
    <div class="sl-item"><div class="sl-title"><span>📱 粉笔真题在线刷（含 2026 国考最新）</span></div>
      <div class="sl-body">粉笔官网真题页免登录可看：国考 36 套（2026 行政执法/地市级/副省级最新）+ 30 省市真题 + 国考/省考模拟题，在线作答。登录粉笔账号可解锁解析与更多功能。</div>
      <div class="btn-row"><button class="btn small primary" onclick="openUrl('https://www.fenbi.com/spa/tiku/guide/realTest/xingce/xingce')">打开粉笔真题</button>
      <button class="btn small" onclick="openUrl('https://www.fenbi.com/spa/tiku/guide/mock/xingce/xingce')">粉笔模考</button></div>
    </div>
    <div class="sl-item"><div class="sl-title"><span>📚 申论/综应题库（3853+1035 题）</span></div>
      <div class="sl-body">结构化申论题库（公文写作/概括/对策/文章写作等）+ 事业单位综应题库，含题干、参考答案、答题演示、考点解析。
      获取：github.com/2421873411a-rgb/gongkao-tiku</div>
      <div class="btn-row"><button class="btn small primary" onclick="openUrl('https://github.com/2421873411a-rgb/gongkao-tiku')">打开仓库</button></div>
    </div>
    <div class="sl-item"><div class="sl-title"><span>🤖 粉笔历年真题批量下载（爬虫）</span></div>
      <div class="sl-body">开源爬虫，填入粉笔账号密码即可批量下载粉笔历年真题（含国考/省考 PDF）。需要粉笔账号，账号密码仅用于本机登录。</div>
      <div class="btn-row"><button class="btn small primary" onclick="openUrl('https://github.com/dduutt/fenbi')">打开项目</button></div>
    </div>
  </div>
  <div class="card"><h3><span class="dot"></span>数据管理</h3>
    <div class="btn-row">
      <button class="btn" onclick="exportData()">📤 导出备份</button>
      <button class="btn" onclick="document.getElementById('importFile').click()">📥 导入备份</button>
      <button class="btn red" onclick="confirmReset()">🗑 清空数据</button>
      <input type="file" id="importFile" accept=".json" class="hidden" onchange="importData(this)">
    </div>
    <div class="muted mt8">数据保存在浏览器本地（localStorage），导出为 JSON 文件可随时恢复或迁移到其他设备。</div>
  </div>
  <div class="card"><h3><span class="dot"></span>关于</h3>
    <div class="muted">上岸通 v1.0 — 考公一站式学习工具。纯前端离线可用，题库与素材持续扩充中。祝你一战成公！🎉</div>
  </div>`;
}
function heatmap(){
  const t=new Date(); const todayIdx=(t.getDay()+6)%7; const totalDays=16*7;
  const start=new Date(Date.now()-(totalDays-1)*86400000);
  let html='';
  for(let week=0;week<16;week++){
    for(let d=0;d<7;d++){
      const date=new Date(start.getTime()+(week*7+d)*86400000);
      const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const ci=store.checkins[key];
      const level=ci? (ci.answered>=10?3:ci.answered>=5?2:1):0;
      html+=`<div class="cal-cell ${level>0?'done':''}" style="opacity:${level?0.5+level*0.17:1}" title="${key} ${ci?ci.answered+'题':'未打卡'}">${date.getDate()}</div>`;
    }
  }
  return html;
}
function exportData(){
  const blob=new Blob([JSON.stringify(store,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`上岸通备份_${today()}.json`; a.click();
  toast('备份已导出 ✅','ok');
}
function importData(input){
  const f=input.files[0]; if(!f) return;
  const reader=new FileReader();
  reader.onload=e=>{ try{ const d=JSON.parse(e.target.result);
    if(!d.stats||!d.wrongs) throw 0;
    store=Object.assign({},DEF,d,{settings:Object.assign({},DEF.settings,d.settings)});
    save(); toast('导入成功 ✅','ok'); renderView('more');
  }catch(err){ toast('备份文件格式不正确','error'); } };
  reader.readAsText(f);
}
function confirmReset(){
  if(confirm('确定清空全部学习数据吗？此操作不可恢复，建议先导出备份。')){
    store=JSON.parse(JSON.stringify(DEF)); save(); renderView('more'); toast('已清空');
  }
}
function toggleReview(){ store.settings.reviewOn=!store.settings.reviewOn; save(); renderMore(); }

/* ============ 番茄钟 ============ */
let pomo={running:false,work:true,left:25*60,timer:null,total:25*60};
function pomoRender(){
  if(!$('#pomoT')) return;
  const m=String(Math.floor(pomo.left/60)).padStart(2,'0'), s=String(pomo.left%60).padStart(2,'0');
  $('#pomoT').textContent=`${m}:${s}`;
  const pct=pomo.left/pomo.total;
  $('#pomoC').style.background=`conic-gradient(var(--gold) ${pct*360}deg, #eef1f5 0deg)`;
  $('#pomoS').textContent=pomo.work? (pomo.running?'专注中…':'工作 25 分钟 · 休息 5 分钟') : '休息时间 ☕';
  $('#pomoBtn').textContent=pomo.running?'暂停':'开始专注';
  $('#pomoBtn').className='btn '+(pomo.work?'primary':'gold');
}
function pomoToggle(){
  if(pomo.running){ pomo.running=false; clearInterval(pomo.timer); }
  else{ pomo.running=true; pomo.timer=setInterval(()=>{
    pomo.left--;
    if(pomo.left<=0){
      if(pomo.work){ store.pomo.count++; store.pomo.minutes+=25; save(); $('#pomoCnt').textContent=store.pomo.count; toast('🍅 专注完成，休息 5 分钟吧！','ok'); }
      else toast('休息结束，开始下一轮！');
      pomo.work=!pomo.work;
      pomo.left=pomo.work?25*60:5*60; pomo.total=pomo.left;
    }
    pomoRender();
  },1000); }
  pomoRender();
}
function pomoReset(){ pomo={running:false,work:true,left:25*60,timer:null,total:25*60}; pomoRender(); }

/* ============ 答题引擎 ============ */
let Q={list:[],idx:0,answers:{},marks:{},mode:'practice',start:0,limit:0,timer:null,elapsed:0,mods:[]};
function startQuiz(list,title,seconds){
  Q={list,idx:0,answers:{},marks:{},mode:list.length>1?'multi':'single',start:Date.now(),limit:seconds||0,timer:null,elapsed:0};
  $('#quizTitle').textContent=title;
  $('#resultLayer').classList.add('hidden');
  $('#quizLayer').classList.remove('hidden');
  document.body.style.overflow='hidden';
  if(seconds){ Q.timer=setInterval(()=>{ Q.elapsed++; const left=seconds-Q.elapsed;
    $('#quizTimer').textContent='⏱ '+fmtClock(Math.max(0,left));
    if(left<=0){ clearInterval(Q.timer); Q.timer=null; finishQuiz(true); }
  },1000); }
  renderQ();
}
function fmtClock(sec){ return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`; }
function renderQ(){
  const q=Q.list[Q.idx]; if(!q) return;
  $('#quizProgress').textContent=`${Q.idx+1}/${Q.list.length}`;
  const chosen=Q.answers[q.id];
  const matHtml=q.mat? `<div class="q-analy" style="background:var(--navy-3);border-color:#cddcea;color:var(--ink-2);margin-bottom:14px"><b>📄 材料：</b>${esc(q.stem.split('\n\n')[0])}</div>`:'';
  const stem=matHtml? q.stem.split('\n\n').slice(1).join('\n\n') : q.stem;
  $('#quizBody').innerHTML=`
  <div class="q-stem"><span class="q-tag">${MOD_ICO[q.mod]} ${q.mod} · ${q.type}</span>
    <div class="q-text">${esc(stem)}</div></div>
  ${q.options.map((op,i)=>`
    <button class="q-opt ${chosen!==undefined?'disabled':''} ${chosen!==undefined?(i===q.answer?'correct':(i===chosen&&chosen!==q.answer?'wrong':'')):''}" onclick="pick(${i})">
      <span class="ol">${'ABCD'[i]}</span>${esc(op)}
      ${chosen!==undefined&&i===chosen?`<span class="mark">${chosen===q.answer?'✅':'❌'}</span>`:''}
      ${Q.marks[q.id]&&chosen===undefined?'<span class="marked-tag">⚑ 已标记</span>':''}
    </button>`).join('')}
  ${chosen!==undefined? `
    <div class="q-analy"><b>💡 解析：</b>${esc(q.analysis)}</div>`:''}
  `;
  updateFoot();
  if(Q.limit){ $('#quizTimer').textContent='⏱ '+fmtClock(Math.max(0,Q.limit-Q.elapsed)); }
}
function updateFoot(){
  const q=Q.list[Q.idx]; const chosen=Q.answers[q.id];
  const answeredCount=Object.keys(Q.answers).length;
  const isLast=Q.idx===Q.list.length-1;
  const reviewing=Q.mode==='review';
  $('#footPrev').textContent=Q.idx>0?'上一题':'';
  $('#footPrev').style.visibility=Q.idx>0?'visible':'hidden';
  if(reviewing){
    $('#footMark').style.display='none';
    $('#footNext').textContent=isLast?'返回结果':'下一题';
    $('#footNext').className='btn primary';
    $('#footNext').onclick=()=>{ if(isLast){ $('#quizLayer').classList.add('hidden'); document.body.style.overflow=''; $('#resultLayer').classList.remove('hidden'); } else { Q.idx++; renderReview(); } };
    return;
  }
  $('#footMark').style.display='';
  $('#footMark').textContent=Q.marks[q.id]?'⚑ 取消标记':'⚑ 标记';
  $('#footNext').textContent=isLast?'交卷':'下一题';
  $('#footNext').className='btn primary';
  $('#footNext').onclick=nextQ;
}
function pick(i){
  const q=Q.list[Q.idx];
  if(Q.answers[q.id]!==undefined) return;
  Q.answers[q.id]=i;
  recordResult(q,i,i===q.answer);
  renderQ();
}
function nextQ(){ if(Q.idx<Q.list.length-1){ Q.idx++; renderQ(); } else finishQuiz(); }
function prevQ(){ if(Q.idx>0){ Q.idx--; renderQ(); } }
function markQ(){ const id=Q.list[Q.idx].id; if(Q.answers[id]!==undefined) return; Q.marks[id]=!Q.marks[id]; renderQ(); }
function finishQuiz(forced){
  clearInterval(Q.timer); Q.timer=null;
  const total=Q.list.length;
  const answered=Object.keys(Q.answers).length;
  const correct=Q.list.filter(q=>Q.answers[q.id]===q.answer).length;
  const unans=total-answered;
  $('#quizLayer').classList.add('hidden');
  document.body.style.overflow='';
  const acc=answered?Math.round(correct/answered*100):0;
  const mods={}; Q.list.forEach(q=>{ (mods[q.mod]=mods[q.mod]||{n:0,c:0}); mods[q.mod].n++; if(Q.answers[q.id]===q.answer) mods[q.mod].c++; });
  const tips=acc>=90?'状态极佳，保持！':acc>=75?'发挥稳定，查漏补缺更上一层楼':acc>=60?'基础尚可，错题本多复习': '别灰心，错题就是提分空间，复习后再来！';
  $('#resultBox').innerHTML=`
    <h3 style="color:var(--navy)">${forced?'⏰ 时间到 · 交卷':'✅ 答题完成'}</h3>
    <div class="r-score">${acc}<small>%</small></div>
    <div class="r-row">
      <div class="r-cell"><b>${correct}/${total}</b><span>答对/总题数</span></div>
      <div class="r-cell"><b>${unans}</b><span>未作答</span></div>
      <div class="r-cell"><b>${fmtClock(Q.elapsed)}</b><span>用时</span></div>
      <div class="r-cell"><b>✅</b><span>错题已入错题本</span></div>
    </div>
    <div class="center mb10">${Object.keys(mods).map(m=>{const p=Math.round(mods[m].c/mods[m].n*100);return `<span class="tag" style="background:${MOD_COLOR[m]}22;color:${MOD_COLOR[m]};font-weight:600">${m} ${p}%</span>`;}).join('')}</div>
    <div class="r-tip">💬 ${tips}</div>
    <div class="btn-row">
      <button class="btn primary" onclick="reviewQuiz()">🔍 逐题回顾</button>
      <button class="btn" onclick="closeResult()">完成</button>
    </div>`;
  $('#resultLayer').classList.remove('hidden');
}
function reviewQuiz(){
  $('#resultLayer').classList.add('hidden');
  Q.idx=0; Q.mode='review';
  $('#quizTitle').textContent='逐题回顾（含解析）';
  $('#quizLayer').classList.remove('hidden');
  document.body.style.overflow='hidden';
  renderReview();
}
function renderReview(){
  const q=Q.list[Q.idx];
  $('#quizProgress').textContent=`${Q.idx+1}/${Q.list.length}`;
  const chosen=Q.answers[q.id];
  $('#quizBody').innerHTML=`
  <div class="q-stem"><span class="q-tag">${MOD_ICO[q.mod]} ${q.mod} · ${q.type}</span>
    <div class="q-text">${esc(q.stem)}</div></div>
  ${q.options.map((op,i)=>`
    <div class="q-opt disabled ${i===q.answer?'correct':(i===chosen&&chosen!==q.answer?'wrong':'')}">
      <span class="ol">${'ABCD'[i]}</span>${esc(op)}
      ${i===chosen?`<span class="mark">${chosen===q.answer?'✅':'❌'}</span>`:''}
      ${i===q.answer&&chosen!==q.answer?'<span class="mark" style="right:38px">✓</span>':''}
    </div>`).join('')}
  <div class="q-analy"><b>💡 解析：</b>${esc(q.analysis)}<br><span class="muted">你${chosen!==undefined?'选了 '+('ABCD'[chosen])+(chosen===q.answer?'，回答正确':'，回答错误'):'未作答'} · 正确答案 ${'ABCD'[q.answer]}</span></div>`;
  updateFoot();
}
function reviewNav(dir){ Q.idx+=dir; if(Q.idx<0)Q.idx=0; if(Q.idx>=Q.list.length)Q.idx=Q.list.length-1; renderReview(); }
document.addEventListener('keydown',e=>{
  if($('#quizLayer').classList.contains('hidden')) return;
  if(e.key>='1'&&e.key<='4') pick(+e.key-1);
  else if(e.key==='ArrowRight') Q.mode==='review'?reviewNav(1):nextQ();
  else if(e.key==='ArrowLeft') Q.mode==='review'?reviewNav(-1):prevQ();
});
$('#quizClose').onclick=function(){
  clearInterval(Q.timer);
  const answering=Q.mode!=='review'&&Object.keys(Q.answers).length<Q.list.length;
  if(answering&&!confirm('还有题目未作答，确定退出？')) return;
  $('#quizLayer').classList.add('hidden'); document.body.style.overflow='';
};

/* 底部导航 */
$$('.tab').forEach(t=>t.onclick=()=>switchTab(t.dataset.view));

/* 初始化 */
window.closeResult=()=>{ $('#resultLayer').classList.add('hidden'); renderView(currentView()); };
function currentView(){ const a=$('.tab.active'); return a?a.dataset.view:'dashboard'; }
window.pick=pick; window.nextQ=nextQ; window.prevQ=prevQ; window.markQ=markQ;
window.startQuiz=startQuiz; window.quickStart=quickStart; window.markMastered=markMastered;
window.renderShenlun=renderShenlun; window.renderShenlunSearch=renderShenlunSearch;
window.toggleFav=toggleFav; window.addCustomSl=addCustomSl; window.delCustomSl=delCustomSl;
window.renderWrongByMod=renderWrongByMod; window.renderExamConfig=renderExamConfig;
window.renderExamCustom=renderExamCustom; window.examCustom=examCustom; window.examQuick=examQuick;
window.exportData=exportData; window.importData=importData; window.confirmReset=confirmReset;
window.openUrl=(u)=>{ window.open(u,'_blank'); };
window.toggleReview=toggleReview; window.pomoToggle=pomoToggle; window.pomoReset=pomoReset;
window.reviewQuiz=reviewQuiz; window.reviewNav=reviewNav; window.closeResult=closeResult;
pomoRender();
renderDash();
