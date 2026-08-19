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
/* 多选/不定项判定与显示 */
function isCorrect(q, ans){
  if(ans===undefined||ans===null) return false;
  if(q.multi){
    const a = Array.isArray(ans)? ans.slice().sort().join(',') : '';
    const b = String(q.answer).split('').map(c=>'ABCD'.indexOf(c)).filter(x=>x>=0).sort().join(',');
    return a===b;
  }
  return ans===q.answer;
}
function qAnsText(q, ans){
  if(ans===undefined||ans===null) return '';
  if(q.multi) return (Array.isArray(ans)? ans.map(i=>'ABCD'[i]) : String(ans).split('')).join('、');
  return 'ABCD'[ans];
}
/* 渲染题干文本（替换 [图N] 占位为图片）与选项图片 */
function renderStem(q, stem){
  let s = esc(stem);
  if(q.images&&q.images.length){
    s = s.replace(/\[图(\d+)\]/g, (m,n)=>`<img class="q-img" src="${q.images[+n]}" alt="图" loading="lazy" onclick="event.stopPropagation();window.open(this.src)">`);
  }
  return s;
}
function optImgsHtml(q, i){
  if(!q.opt_images||!q.opt_images[i]||!q.opt_images[i].length) return '';
  return q.opt_images[i].map(u=>`<img class="q-img opt-img" src="${u}" alt="图" loading="lazy" onclick="event.stopPropagation();window.open(this.src)">`).join('');
}
function optTextHtml(q, i){
  /* 选项文本 + 图：替换 [图] 占位文字并附加图片 */
  let t=esc(String(q.options[i]||''));
  const imgs=(q.opt_images&&q.opt_images[i])||[];
  if(imgs.length){
    t=t.replace(/\[图\]/g,'');
    t+=imgs.map(u=>`<img class="q-img opt-img" src="${u}" alt="图" loading="lazy" onclick="event.stopPropagation();window.open(this.src)">`).join('');
  } else {
    t=t.replace(/\[图\]/g,'（图）');
  }
  return t;
}
/* 渲染材料（文本 + [图] 占位替换为材料图） */
function renderMat(q){
  let s=esc(q.mat);
  if(q.mat_images&&q.mat_images.length){
    let n=0;
    s=s.replace(/\[图\]/g,()=>`<img class="q-img" src="${q.mat_images[n++]}" alt="图" loading="lazy" onclick="event.stopPropagation();window.open(this.src)">`);
  } else {
    s=s.replace(/\[图\]/g,'（图）');
  }
  return s;
}
const MODS = Object.keys(QUESTION_BANK);
const MOD_ICO = {'常识判断':'🧠','言语理解':'🗣️','数量关系':'🔢','判断推理':'🧩','资料分析':'📊','政治理论':'🏛️'};
const MOD_COLOR = {'常识判断':'#3d7edb','言语理解':'#3aa876','数量关系':'#e0962f','判断推理':'#8e6fd8','资料分析':'#d96a4f','政治理论':'#c0392b'};

/* ---------- 存储 ---------- */
const KEY='shangan_tong_v1';
const DEF = { wrongs:{}, checkins:{}, stats:{answered:0,correct:0,byMod:{},daily:[]}, favs:[], customSl:[], pomo:{count:0,minutes:0}, attempts:[], settings:{dailyCount:10,reviewOn:true} };
let store = load();
function load(){ try{ const d=JSON.parse(localStorage.getItem(KEY)); return Object.assign({},DEF, d||{}, {stats:Object.assign({},DEF.stats,(d||{}).stats), attempts:Array.isArray((d||{}).attempts)?(d||{}).attempts:[], settings:Object.assign({},DEF.settings,(d||{}).settings)}); }catch(e){ return JSON.parse(JSON.stringify(DEF)); } }
function save(){ localStorage.setItem(KEY, JSON.stringify(store)); }
function allQuestions(){
  if(allQuestions._c) return allQuestions._c;   // 缓存题库展开结果
  allQuestions._c = MODS.flatMap(m=>QUESTION_BANK[m].map(q=>({...q,mod:m})));
  return allQuestions._c;
}
function bankProgressView(st, state){
  const el=$('#bankProgress'); if(!el) return;
  clearTimeout(bankProgressView._t);
  const total=st?.totalChunks||0, loaded=st?.loadedChunks||0;
  const pct=state==='loaded'?100:(total?Math.round(loaded/total*100):2);
  el.classList.remove('hidden','done','error');
  el.classList.toggle('done',state==='loaded');
  el.classList.toggle('error',state==='error');
  const bar=el.querySelector('i'), label=el.querySelector('span');
  if(bar) bar.style.width=`${pct}%`;
  if(label) label.textContent=state==='error'?'题库加载失败':state==='loaded'?(st?.cacheHit?'⚡ 缓存题库已就绪':'✓ 完整题库已就绪'):`完整题库 ${pct}%`;
  if(state==='loaded') bankProgressView._t=setTimeout(()=>el.classList.add('hidden'),3500);
}
window.addEventListener('sat:bank-loading',e=>bankProgressView(e.detail,'loading'));
window.addEventListener('sat:bank-progress',e=>bankProgressView(e.detail,'progress'));
window.addEventListener('sat:bank-loaded',e=>{
  allQuestions._c=null; // 懒加载追加完成后使缓存失效
  bankProgressView(e.detail,'loaded');
  if(typeof currentView==='function' && currentView()==='dashboard') renderDash();
  const via=e.detail?.cacheHit?'（本地缓存）':'';
  toast(`完整题库已就绪${via}：${allQuestions().length.toLocaleString()} 题`,'ok');
});
window.addEventListener('sat:bank-error',e=>{
  bankProgressView(e.detail,'error');
  toast('完整题库加载失败，请检查网络后重试','error');
});
window.addEventListener('sat:bank-cache-ready',()=>{
  const el=$('#bankProgress');
  if(el){ el.title='完整题库已持久缓存，下次访问可快速恢复'; }
});
function requireFullBank(then){
  if(!window.ensureFullBank || window.LAZY_BANK_STATUS?.loaded) return false;
  toast('正在加载完整题库，请稍候…');
  window.ensureFullBank().then(()=>then&&then()).catch(()=>{});
  return true;
}
function debounce(fn, ms){
  let t=null;
  return function(...args){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,args), ms||250); };
}

/* ---------- 逐题作答日志（C1：能力画像的数据层） ---------- */
const ATT_LIMIT=3000;
function qPointOf(q){ const m=(q.analysis||'').match(/考点：([^\n【】]+)/); return m? m[1].trim() : ''; }
function qRateOf(q){ const m=(q.analysis||'').match(/正确率\s*([\d.]+)%/); return m? +m[1] : null; }
function logAttempt(q, picked, correct, durSec){
  /* 每题一条：时间/模块/对错/来源/考点/难度(正确率代理)/用时/题型 */
  const att={
    t: Date.now(), d: today(), qid: q.id, mod: q.mod, ok: !!correct,
    src: (q.src&&q.src.name) ? [q.src.year,q.src.exam,q.src.province].filter(Boolean).join('·') : (q.tag||''),
    point: qPointOf(q) || '',
    rate: qRateOf(q),
    dur: durSec||0,
    multi: !!q.multi,
    type: q.type||'',
  };
  store.attempts.push(att);
  if(store.attempts.length>ATT_LIMIT) store.attempts.splice(0, store.attempts.length-ATT_LIMIT);
}
/* 能力画像聚合（attempts → 模块/考点/难度维度统计） */
function abilityByMod(mod){
  const list=store.attempts.filter(a=>a.mod===mod);
  const byPoint={};
  list.forEach(a=>{ const k=a.point||'未标注'; (byPoint[k]=byPoint[k]||{a:0,c:0}); byPoint[k].a++; a.ok&&byPoint[k].c++; });
  return {list, total:list.length, correct:list.filter(a=>a.ok).length, byPoint};
}
function weakPoints(mod, minN=2){
  const {byPoint}=abilityByMod(mod);
  return Object.entries(byPoint)
    .map(([p,s])=>({point:p, n:s.a, acc:Math.round(s.c/s.a*100)}))
    .filter(x=>x.n>=minN)
    .sort((a,b)=>a.acc-b.acc);
}
/* 难度分档（正确率代理）：>=80 简单 / 60-80 中等 / 40-60 较难 / <40 困难 */
function diffBand(rate){ if(rate==null) return '未知'; return rate>=80?'简单':rate>=60?'中等':rate>=40?'较难':'困难'; }
const BANDS=['简单','中等','较难','困难'];

/* ---------- C2 能力分析页 ---------- */
function renderAnalysis(){
  const V=$('#view');
  const atts=store.attempts;
  if(!atts.length){ V.innerHTML=`<div class="card"><h3><span class="dot"></span>📊 能力分析</h3><div class="muted">还没有作答记录——先刷几题，这里会自动生成你的多维能力画像（模块×考点矩阵、难度适配、来源表现、用时分析）。</div></div>`; return; }
  const total=atts.length, correct=atts.filter(a=>a.ok).length, acc=Math.round(correct/total*100);
  // 模块维度
  const byMod={};
  atts.forEach(a=>{ (byMod[a.mod]=byMod[a.mod]||{a:0,c:0}); byMod[a.mod].a++; a.ok&&byMod[a.mod].c++; });
  // 难度维度
  const byBand={};
  BANDS.forEach(b=>byBand[b]={a:0,c:0});
  atts.forEach(a=>{ const b=diffBand(a.rate); if(byBand[b]){ byBand[b].a++; a.ok&&byBand[b].c++; } });
  // 来源维度
  const bySrc={};
  atts.forEach(a=>{ const k=(a.src||'未知').replace(/·.+$/,''); (bySrc[k]=bySrc[k]||{a:0,c:0}); bySrc[k].a++; a.ok&&bySrc[k].c++; });
  // 用时分析（每题平均秒数，分对/错）
  const durOk=atts.filter(a=>a.ok&&a.dur>0).map(a=>a.dur), durBad=atts.filter(a=>!a.ok&&a.dur>0).map(a=>a.dur);
  const avg=arr=>arr.length? Math.round(arr.reduce((s,x)=>s+x,0)/arr.length) : 0;
  // 近14天趋势（用 daily 数据）
  const trend=store.stats.daily.slice(-14);
  const modAcc=Object.entries(byMod).map(([m,s])=>({m, n:s.a, acc:Math.round(s.c/s.a*100)}));
  const weakestMod=modAcc.length? [...modAcc].sort((a,b)=>a.acc-b.acc)[0] : null;
  const topWeak=[];  // 全局薄弱考点 top8
  MODS.forEach(m=>{ weakPoints(m).slice(0,3).forEach(w=>topWeak.push({...w, mod:m})); });
  topWeak.sort((a,b)=>a.acc-b.acc);
  V.innerHTML=`
  <div class="card"><h3><span class="dot"></span>📊 能力分析 · 多维画像</h3>
    <div class="muted mb10">基于最近 ${total} 次作答的实时画像（覆盖 ${Object.keys(byMod).length} 个模块）</div>
    <div class="hero-stats">
      <div class="hs"><b>${acc}%</b><span>总正确率</span></div>
      <div class="hs"><b>${total}</b><span>作答次数</span></div>
      <div class="hs"><b>${avg(durOk)}s</b><span>答对均时</span></div>
      <div class="hs"><b>${avg(durBad)}s</b><span>答错均时</span></div>
    </div>
    ${weakestMod? `<div class="muted mt8">⚠️ 当前最薄弱模块：<b style="color:var(--gold)">${MOD_ICO[weakestMod.m]} ${weakestMod.m}</b>（${weakestMod.acc}%）——建议优先专项突破</div>`:''}
  </div>
  <div class="card"><h3><span class="dot"></span>🧩 模块掌握度</h3>
    ${modAcc.map(({m,n,acc})=>`<div class="r-mod"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${MOD_ICO[m]} ${m} <span class="muted" style="font-weight:400">(${n}题)</span></span><span style="color:${acc>=75?'var(--green)':acc>=60?'var(--gold)':'var(--red)'};font-weight:700">${acc}%</span></div>
      <div class="rm-bar"><div class="rm-fill" style="width:${acc}%;background:${MOD_COLOR[m]}"></div></div></div>`).join('')}
  </div>
  <div class="card"><h3><span class="dot"></span>🎯 难度适配（按全站正确率分档）</h3>
    <div class="muted mb10">简单/中等/较难/困难四档的正确率——如果简单档正确率低，说明基础不牢；较难档低是正常现象，困难档能到 50%+ 已属优秀</div>
    ${BANDS.map(b=>{ const s=byBand[b]; if(!s.a) return ''; const p=Math.round(s.c/s.a*100);
      return `<div class="r-mod"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${b} <span class="muted" style="font-weight:400">(${s.a}题)</span></span><span style="color:${p>=75?'var(--green)':p>=60?'var(--gold)':'var(--red)'};font-weight:700">${p}%</span></div>
      <div class="rm-bar"><div class="rm-fill" style="width:${p}%;background:${p>=75?'var(--green)':p>=60?'var(--gold)':'var(--red)'}"></div></div></div>`; }).join('')}
  </div>
  <div class="card"><h3><span class="dot"></span>📚 来源表现（真题 vs 模考）</h3>
    ${Object.entries(bySrc).sort((a,b)=>b[1].a-a[1].a).slice(0,6).map(([k,s])=>{ const p=Math.round(s.c/s.a*100);
      return `<div class="r-mod"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${esc(k)} <span class="muted" style="font-weight:400">(${s.a}题)</span></span><span style="font-weight:700">${p}%</span></div>
      <div class="rm-bar"><div class="rm-fill" style="width:${p}%"></div></div></div>`; }).join('')}
  </div>
  <div class="card"><h3><span class="dot"></span>📉 薄弱考点清单（按正确率升序）</h3>
    <div class="muted mb10">作答 ≥2 次且正确率 < 70% 的考点——智能组卷会优先补强这些考点</div>
    ${topWeak.slice(0,10).map((w,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px dashed var(--line)">
      <span><b>${i+1}.</b> ${MOD_ICO[w.mod]} ${esc(w.point)} <span class="muted" style="font-size:12px">(${w.n}次)</span></span>
      <span style="color:${w.acc>=60?'var(--gold)':'var(--red)'};font-weight:700">${w.acc}%</span></div>`).join('')||'<div class="muted">暂无（继续刷题积累数据）</div>'}
    <div class="btn-row"><button class="btn primary" onclick="smartQuiz()">🎯 针对薄弱点智能组卷</button></div>
  </div>
  <div class="card"><h3><span class="dot"></span>📈 近14天趋势</h3>
    <div class="rate-bar">${trend.map(d=>{ const p=d.answered? Math.round(d.correct/d.answered*100):0;
      return `<div class="rb-col"><div class="rb-bar" style="height:${Math.max(4,p*0.8)}px;background:${p>=75?'var(--green)':p>=50?'var(--gold)':'var(--red)'}"></div><div class="rb-day">${d.date.slice(5).replace('-','/')}</div><div class="rb-num">${p}%</div></div>`;}).join('')}</div>
  </div>`;
}

/* ---------- 数据操作 ---------- */
function recordResult(q, picked, correct, durSec){
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
  logAttempt(q, picked, correct, durSec);   // C1 逐题日志
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
function switchTab(v){
  const needsBank=['practice','daily','exam','wrongbook'].includes(v);
  if(needsBank && requireFullBank(()=>switchTab(v))) return;
  VIEWS.forEach(x=>{ const el=$$(`.tab[data-view="${x}"]`)[0]; if(el) el.classList.toggle('active', x===v); });
  renderView(v);
}
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
    <button class="gb" onclick="switchTab('exam')"><span class="gi">🧩</span><span class="gt">智能组卷</span></button>
    <button class="gb" onclick="renderFillback()"><span class="gi">📥</span><span class="gt">答案回填</span></button>
    <button class="gb" onclick="renderAnalysis()"><span class="gi">📊</span><span class="gt">能力分析</span></button>
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
  if(requireFullBank(()=>quickStart(which))) return;
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
      <button class="btn" onclick="smartQuiz()">🧠 智能组卷（薄弱点强化）</button>
    </div>
  </div>
  <div class="card"><h3><span class="dot"></span>🔍 题库检索</h3>
    <div class="muted mb10">按关键词/考点/来源/正确率筛选全库 ${allQuestions().length.toLocaleString()} 题，支持练习与导出</div>
    <div class="search-grid">
      <input id="searchKw" placeholder="关键词（题干/选项/解析）" oninput="searchDebounced()">
      <input id="searchTag" placeholder="标签/来源关键字（如 北京 / 2023 / 第三季 / 行政执法）" oninput="searchDebounced()">
      <input id="searchPoint" placeholder="考点关键词（如 逻辑推理/比重）" oninput="searchDebounced()">
      <select id="searchSrc" onchange="doSearch()">
        <option value="">全部来源</option><option>国考</option><option>省考</option><option>模考</option><option>原创</option><option>精选</option>
      </select>
      <select id="searchMod" onchange="doSearch()">
        <option value="">全部模块</option>${MODS.map(m=>`<option>${m}</option>`).join('')}
      </select>
      <select id="searchRate" onchange="doSearch()">
        <option value="">正确率不限</option><option value="80">正确率 ≥80%</option><option value="60">正确率 60-80%</option><option value="0">正确率 &lt;60%</option>
      </select>
      <button class="btn" onclick="doSearch()">搜索</button>
    </div>
    <div id="searchResults" class="search-results"><div class="muted">输入关键词开始检索…</div></div>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn" onclick="startQuiz(shuffle(__lastSearch||[]),'检索结果练习 '+ (__lastSearch||[]).length+'题')">▶ 练习所选</button>
      <button class="btn" onclick="exportFiltered('json')">⬇ 导出 JSON</button>
      <button class="btn" onclick="exportFiltered('txt')">⬇ 导出文本</button>
      <button class="btn gold" onclick="printFiltered()">🖨 打印 / PDF</button>
    </div>
  </div>`;
}

/* ---------- 标签与来源解析 ---------- */
function qSource(q){
  const exams=[q.src,...(q.srcs||[])].filter(Boolean).map(s=>String(s.exam||''));
  if(exams.length) return [...new Set(exams)].join(' / ');
  if(!q.tag) return '';
  const t = String(q.tag);
  if(t.includes('国考')) return '国考真题';
  if(t.includes('模考')) return '模考';
  if(/^[\u4e00-\u9fa5]{2,4}\d{4}$/.test(t)||t.includes('20')) return t.includes('年')? '省考真题':'省考';
  return t;
}
/* 来源短标签：真题=某年·某地·卷别；模考=某年·某考·第某季·地区
   支持多来源（q.srcs 聚合数组） */
function fmtSrc(s){
  if(!s || typeof s!=='object') return '';
  const parts=[];
  if(s.exam==='国考'||s.exam==='省考'){                      // 真题
    const y=s.year||''; const p=s.province||''; const c=s.category||'';
    parts.push(...[y, s.exam==='国考'?'国考':'省考', p, c].filter(Boolean));
  } else {                                                   // 模考/精选
    const y=s.year||'';
    const e=s.exam||'';
    const se=s.season? `第${s.season}季` : '';
    const p=s.province||'';
    const c=s.category||'';
    parts.push(...[y, e, se, p, c].filter(Boolean));
  }
  const base=parts.join('·');
  return base && s.num!=null? `${base}·第${s.num}题` : base;
}
function srcTags(q){
  const out=[];
  const push=s=>{ s=s.trim(); if(s && !out.includes(s)) out.push(s); };
  push(fmtSrc(q.src));
  (q.srcs||[]).forEach(s=>push(fmtSrc(s)));
  if(!out.length && q.tag) {
    // 兜底旧 tag（如 北京2022）
    const m=String(q.tag).match(/^(.+?)(\d{4})$/);
    out.push(m? `${m[2]}·${m[1]}·省考` : String(q.tag));
  }
  return out;
}
function srcLineHtml(q){
  const tags=srcTags(q);
  return tags.length? tags.map(t=>`<span class="tag" style="background:#e6f7ec;color:#18794e;margin-right:4px">${esc(t)}</span>`).join('') : '';
}
function qRate(q){
  const m = (q.analysis||'').match(/正确率\s*([\d.]+)%/);
  return m? m[1] : '';
}
function qPoints(q){
  const m = (q.analysis||'').match(/考点：([^\n【】]+)/);
  return m? m[1].trim() : '';
}
function qTagHtml(q){
  const parts=[];
  if(q.multi) parts.push('<span class="tag" style="background:#e8d9ff;color:#8e6fd8">多选</span>');
  if(q.type) parts.push(`<span class="tag" style="background:#e8f0fe;color:#3d7edb">${esc(q.type)}</span>`);
  parts.push(srcLineHtml(q));  // 多来源标签
  const rt=qRate(q); if(rt) parts.push(`<span class="tag" style="background:#fdf3e2;color:#e0962f">正确率 ${rt}%</span>`);
  const pt=qPoints(q); if(pt) parts.push(`<span class="tag" style="background:#fdeaea;color:#d96a4f">${esc(pt.split(' ')[0])}</span>`);
  return parts.filter(Boolean).join('');
}

/* ---------- 题库检索 ---------- */
let __lastSearch=[];
const runSearchDebounced=debounce(()=>setTimeout(()=>doSearch(),0),320);
function searchDebounced(){
  const box=$('#searchResults');
  if(box) box.innerHTML=`<div class="muted search-busy">正在检索 ${allQuestions().length.toLocaleString('zh-CN')} 题…</div>`;
  runSearchDebounced();
}
function doSearch(){
  const resultBox=$('#searchResults');
  if(!resultBox) return; // 防抖期间切换页面时，搜索容器可能已销毁
  const kw=($('#searchKw')?.value||'').trim().toLowerCase();
  const tg=($('#searchTag')?.value||'').trim().toLowerCase();
  const pt=($('#searchPoint')?.value||'').trim().toLowerCase();
  const src=$('#searchSrc')?.value||'';
  const mod=$('#searchMod')?.value||'';
  const rate=$('#searchRate')?.value||'';
  if(!kw&&!tg&&!pt&&!src&&!mod&&!rate){ $('#searchResults').innerHTML='<div class="muted">输入关键词开始检索…</div>'; __lastSearch=[]; return; }
  const list=allQuestions().filter(q=>{
    if(mod&&q.mod!==mod) return false;
    if(src){
      const s=qSource(q);
      if(src==='国考'&&!s.includes('国考')) return false;
      if(src==='省考'&&!s.includes('省考')) return false;
      if(src==='模考'&&!s.includes('模考')) return false;
      if(src==='原创'&&!String(q.tag||'').includes('原创')) return false;
      if(src==='精选'&&!String(q.tag||'').includes('精选')) return false;
    }
    if(rate){
      const r=parseFloat(qRate(q));
      if(rate==='80'&&(isNaN(r)||r<80)) return false;
      if(rate==='60'&&(isNaN(r)||r<60||r>=80)) return false;
      if(rate==='0'&&(isNaN(r)||r>=60)) return false;
    }
    if(kw){
      const hay=(q.stem+' '+q.options.join(' ')+' '+q.analysis).toLowerCase();
      if(!hay.includes(kw)) return false;
    }
    if(pt){
      const hay=(qPoints(q)+' '+q.analysis).toLowerCase();
      if(!hay.includes(pt)) return false;
    }
    if(tg){
      // 标签/来源关键字：匹配 tag、结构化来源全字段、多来源聚合
      const s=q.src||{};
      let hay=[q.tag||'', s.year||'', s.exam||'', s.province||'', s.category||'', s.season||'', s.name||''];
      (q.srcs||[]).forEach(x=>hay.push(x.year||'', x.exam||'', x.province||'', x.category||'', x.season||'', x.name||''));
      if(!hay.join(' ').toLowerCase().includes(tg)) return false;
    }
    return true;
  });
  __lastSearch=list;
  const show=list.slice(0,100);  // 分页：最多渲染100条
  $('#searchResults').innerHTML = list.length
    ? `<div class="muted" style="margin-bottom:8px">共 ${list.length} 题（点击任意题直接练习）</div>`+
      show.map((q,i)=>`<div class="sr-item" onclick="startQuiz(shuffle(__lastSearch),'检索结果练习')">
        <span class="sr-no">${i+1}</span>
        <span class="sr-stem">${esc(q.stem.slice(0,60))}${q.stem.length>60?'…':''}</span>
        ${qTagHtml(q)}
      </div>`).join('') + (list.length>100?`<div class="muted">…还有 ${list.length-100} 题，点击上方按钮直接练习全部</div>`:'')
    : '<div class="muted">没有匹配的题目，换个关键词试试</div>';
}

/* ---------- 导出 ---------- */
function exportFiltered(kind){
  const list=__lastSearch||[];
  if(!list.length){ toast('请先搜索出题目再导出'); return; }
  if(kind==='json'){
    const data={exported:new Date().toISOString(), count:list.length, questions:list.map(q=>({mod:q.mod,id:q.id,type:q.type,multi:q.multi||false,stem:q.stem,options:q.options,answer:q.multi?q.answer:('ABCD'[q.answer]),analysis:q.analysis,tag:q.tag,images:q.images||[],opt_images:q.opt_images||[]}))};
    downloadFile('上岸通_检索导出_'+Date.now()+'.json', JSON.stringify(data,null,1), 'application/json');
  } else {
    let txt='上岸通题库导出（共'+list.length+'题）\n生成时间：'+new Date().toLocaleString()+'\n'+'='.repeat(40)+'\n\n';
    list.forEach((q,i)=>{
      txt+=`【${i+1}】[${q.mod}] ${q.type}${q.multi?'（多选）':''} ${qSource(q)}\n`;
      txt+=q.stem+'\n';
      q.options.forEach((o,j)=>txt+=`  ${'ABCD'[j]}. ${o}\n`);
      txt+=`答案：${q.multi?q.answer:('ABCD'[q.answer])}\n`;
      if(qRate(q)) txt+=`正确率：${qRate(q)}%\n`;
      if(qPoints(q)) txt+=`考点：${qPoints(q)}\n`;
      txt+=`解析：${q.analysis.replace(/【[^】]*】\n?/g,'')}\n\n${'-'.repeat(30)}\n\n`;
    });
    downloadFile('上岸通_检索导出_'+Date.now()+'.txt', txt, 'text/plain;charset=utf-8');
  }
  toast('已导出 '+list.length+' 题');
}
function downloadFile(name, content, mime){
  const blob=new Blob([content],{type:mime});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}
function printFiltered(){
  const list=__lastSearch||[];
  if(!list.length){ toast('请先搜索出题目再导出'); return; }
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${baseHref()}"><title>上岸通 · 题目与解析</title>
  <style>body{font-family:'Microsoft YaHei',sans-serif;padding:24px;color:#222;max-width:820px;margin:0 auto}
  .q{margin-bottom:22px;padding-bottom:16px;border-bottom:1px dashed #ccc;page-break-inside:avoid}
  .no{font-weight:700;color:#3d7edb;margin-bottom:6px}.stem{margin-bottom:8px;line-height:1.7}
  .opt{margin:3px 0 3px 18px}.ans{color:#3aa876;font-weight:600;margin-top:6px}
  .ana{background:#f6f8fb;border-left:3px solid #3d7edb;padding:10px 12px;margin-top:8px;line-height:1.7;font-size:13.5px;white-space:pre-wrap}
  .tag{display:inline-block;font-size:11px;padding:1px 8px;border-radius:8px;background:#eee;margin:0 4px 2px 0}
  img{max-width:100%}
  h1{color:#1b2a4a;text-align:center}@media print{.q{break-inside:avoid}}</style></head><body>
  <h1>📘 上岸通 · 题目与解析（${list.length} 题）</h1>
  <p style="text-align:center;color:#888">生成时间：${new Date().toLocaleString()}</p>
  ${list.map((q,i)=>`<div class="q"><div class="no">${i+1}. [${q.mod}] ${q.type}${q.multi?'（多选）':''}</div>
    <div style="margin:4px 0">${srcLineHtml(q)}</div>${qRate(q)?`<div class="tag" style="background:#fdf3e2;color:#e0962f">正确率 ${qRate(q)}%</div>`:''}${qPoints(q)?`<div class="tag" style="background:#fdeaea;color:#d96a4f">${esc(qPoints(q))}</div>`:''}
    ${q.mat?`<div class="ana" style="background:#f8f9fa;border-color:#999">${printMatHtml(q)}</div>`:''}
    <div class="stem">${printStemHtml(q)}</div>
    <div class="opt">${printOptsHtml(q)}</div>
    <div class="ans">✅ 答案：${q.multi?q.answer:('ABCD'[q.answer])}</div>
    <div class="ana">${esc(cleanAnalysisText(q.analysis))}</div></div>`).join('')}
  ${printWaitScript()}
  </body></html>`);
  w.document.close();
}

/* ---------- 卷种配置（组卷依据：2025-2026 新大纲 + 各省结构） ---------- */
const PAPER_CONFIGS = {
  '国考·副省级': {total:135, time:120, mods:{政治理论:20,常识判断:15,言语理解:30,数量关系:15,判断推理:35,资料分析:20}},
  '国考·地市级': {total:130, time:120, mods:{政治理论:20,常识判断:15,言语理解:30,数量关系:10,判断推理:35,资料分析:20}},
  '国考·行政执法': {total:130, time:120, mods:{政治理论:20,常识判断:15,言语理解:30,数量关系:10,判断推理:35,资料分析:20}},
  '国考·旧大纲(2024前)': {total:130, time:120, mods:{常识判断:20,言语理解:40,数量关系:10,判断推理:40,资料分析:20}},
  '省考联考': {total:120, time:120, mods:{常识判断:20,言语理解:40,数量关系:10,判断推理:35,资料分析:15}},
  '省考联考(2025新大纲)': {total:120, time:120, mods:{政治理论:5,常识判断:15,言语理解:40,数量关系:10,判断推理:35,资料分析:15}},
  '江苏A类': {total:135, time:120, mods:{常识判断:15,言语理解:45,数量关系:20,判断推理:45,资料分析:10}},
  '浙江': {total:120, time:120, mods:{常识判断:20,言语理解:40,数量关系:15,判断推理:35,资料分析:10}},
  '北京': {total:135, time:120, mods:{常识判断:35,言语理解:35,数量关系:20,判断推理:30,资料分析:15}},
  '广东': {total:100, time:90, mods:{常识判断:15,言语理解:15,数量关系:15,判断推理:35,资料分析:20}},
  '上海': {total:130, time:120, mods:{常识判断:25,言语理解:25,数量关系:15,判断推理:35,资料分析:30}},
};
const MOD_ORDER = ['政治理论','常识判断','言语理解','数量关系','判断推理','资料分析'];

/* ---------- 自定义组卷 ---------- */
let __paperCfg = null;
function renderCustomQuiz(){
  $('#view').innerHTML=`
  <div class="card"><h3><span class="dot"></span>🎯 自定义组卷</h3>
    <div class="muted mb10">按各地国省考卷种结构智能组卷（上岸通特色）——可选完整模考卷或小卷子，在线答题或导出打印</div>
    <div class="field"><label>卷种模板（自动填充各模块题量，可改）</label>
      <select id="pcType" onchange="applyPaperCfg()">
        ${Object.keys(PAPER_CONFIGS).map(k=>`<option value="${k}">${k}（${PAPER_CONFIGS[k].total}题/${PAPER_CONFIGS[k].time}分钟）</option>`).join('')}
        <option value="custom">自定义（手动填写）</option>
      </select></div>
    <div class="field"><label>题目范围</label>
      <select id="pcScope"><option value="all">全部题库（含解析）</option><option value="真题">仅真题（国考/省考）</option><option value="模考">仅模考题</option></select></div>
    <div class="field"><label>导出样式 <span class="muted">（全真模式=真题卷版式，隐藏来源注明/正确率，模拟真实考场；练习模式=每题标注详细来源与难度）</span></label>
      <label class="switch-inline"><input type="checkbox" id="pcFullReal" checked> <b>全真模式</b>（隐藏来源、模拟考场）</label>
    </div>
    <div id="pcMods"></div>
    <div class="btn-row">
      <button class="btn primary" onclick="buildPaper()">📝 生成试卷</button>
      <button class="btn gold" onclick="buildPaperAndPrint()">🖨 生成并导出 PDF</button>
    </div>
    <div class="muted mt8">题库池：政治理论 ${(QUESTION_BANK['政治理论']||[]).length} · 常识 ${(QUESTION_BANK['常识判断']||[]).length} · 言语 ${(QUESTION_BANK['言语理解']||[]).length} · 数量 ${(QUESTION_BANK['数量关系']||[]).length} · 判断 ${(QUESTION_BANK['判断推理']||[]).length} · 资料 ${(QUESTION_BANK['资料分析']||[]).length}</div>
  </div>`;
  applyPaperCfg();
}
function applyPaperCfg(){
  const t=$('#pcType').value;
  const cfg=PAPER_CONFIGS[t]||{mods:{常识判断:20,言语理解:30,数量关系:10,判断推理:30,资料分析:10}};
  $('#pcMods').innerHTML=MOD_ORDER.filter(m=>cfg.mods[m]).map(m=>`
    <div class="pc-row"><span>${MOD_ICO[m]} ${m}</span>
      <input type="number" class="pc-num" data-mod="${m}" value="${cfg.mods[m]}" min="0" max="100" onchange="pcTotal()">
      <span class="muted">题</span></div>`).join('')
    + `<div class="pc-total mt8"><b>合计：<span id="pcTotalNum">${MOD_ORDER.reduce((s,m)=>s+(cfg.mods[m]||0),0)}</span> 题</b> <span class="muted">（小于卷种题量即小卷子）</span></div>`;
}
function pcTotal(){
  let t=0;
  document.querySelectorAll('.pc-num').forEach(i=>t+=+i.value||0);
  $('#pcTotalNum').textContent=t;
}
function selectedPaperMinutes(){
  const name=$('#pcType')?.value||'';
  return (PAPER_CONFIGS[name]&&PAPER_CONFIGS[name].time)||120;
}
function buildPaper(){
  const qs=paperQuestions();
  if(!qs.length){ toast('所选范围内题目不足，换个范围'); return; }
  const minutes=selectedPaperMinutes();
  __paperCfg={list:qs, time:minutes};
  startQuiz(qs, `🎯 ${$('#pcType')?.value||'自定义卷'} · ${qs.length}题（${minutes}分钟）`, minutes*60);
}
function buildPaperAndPrint(){
  const qs=paperQuestions();
  if(!qs.length){ toast('所选范围内题目不足'); return; }
  printPaper(qs);
}
function paperQuestions(){
  const scope=$('#pcScope')?.value||'all';
  const out=[];
  document.querySelectorAll('.pc-num').forEach(inp=>{
    const mod=inp.dataset.mod; const n=+inp.value||0;
    if(n<=0) return;
    let pool=QUESTION_BANK[mod]||[];
    if(scope==='真题') pool=pool.filter(q=>{const s=qSource(q);return s.includes('国考')||s.includes('省考');});
    if(scope==='模考') pool=pool.filter(q=>qSource(q).includes('模考'));
    out.push(...shuffle(pool).slice(0,n).map(q=>q.mod?q:{...q,mod}));
  });
  return out;
}
function timeStr(sec){ return Math.floor(sec/60)+'分'+(sec%60?sec%60+'秒':''); }

/* ---------- 打印卷注册 + 答案回填（打印→做题→回填判卷闭环） ---------- */
const PAPER_KEY='shangan_papers_v1';
function loadPapers(){ try{ return JSON.parse(localStorage.getItem(PAPER_KEY))||{}; }catch(e){ return {}; } }
function savePapers(p){ try{ localStorage.setItem(PAPER_KEY, JSON.stringify(p)); }catch(e){ toast('本地存储已满，请先清理旧试卷'); } }
function registerPaper(title, qs){
  /* 导出 PDF 时注册一份卷，返回回填码；题目只存判卷所需的摘要 */
  const ps=loadPapers();
  const d=new Date();
  let id;
  do{ id=`SAT-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000+1000)}`; }while(ps[id]);
  ps[id]={
    title, ts:Date.now(), n:qs.length,
    // 单选 ans=数字下标；多选 ans=字母串（如 "AB"）
    qs: qs.map((q,i)=>({i:i+1, id:q.id, mod:q.mod, ans:q.multi?String(q.answer):q.answer, multi:!!q.multi})),
  };
  savePapers(ps);
  return id;
}
function renderFillback(){
  const V=$('#view');
  const ps=loadPapers();
  const list=Object.entries(ps).sort((a,b)=>b[1].ts-a[1].ts);
  V.innerHTML=`
  <div class="card"><h3><span class="dot"></span>📥 答案回填</h3>
    <div class="muted mb10">打印了真题卷？做完后在答题卡上涂卡，回到这里输入卷面右上角的<b>回填码</b>，把答案逐题填进来——自动判卷、记录成绩与错题，与线上做题数据合并分析。</div>
    <div class="field"><label>回填码（试卷右上角 🔑 处，如 SAT-20260817-1234）</label>
      <input id="fbCode" placeholder="SAT-20260817-1234" onkeydown="if(event.key==='Enter')loadFillPaper()"></div>
    <button class="btn primary" onclick="loadFillPaper()">📖 载入试卷</button>
    <div id="fbBody"></div>
  </div>
  <div class="card"><h3><span class="dot"></span>🗂 已导出的试卷（${list.length}）</h3>
    <div class="muted mb10">点击可回填，或删除释放空间</div>
    ${list.length? list.map(([id,p])=>`
      <div class="row" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px dashed var(--line)">
        <div><b>${esc(p.title)}</b> · ${p.n} 题<br><span class="muted" style="font-size:12px">${new Date(p.ts).toLocaleString()} · ${id}</span></div>
        <div><button class="btn sm" onclick="loadFillPaper('${id}')">回填</button> <button class="btn sm danger" onclick="delPaper('${id}')">删</button></div>
      </div>`).join('') : '<div class="muted">还没有导出的试卷——去「智能组卷」生成并导出 PDF 吧</div>'}
  </div>`;
}
function delPaper(id){
  const ps=loadPapers(); delete ps[id]; savePapers(ps); renderFillback(); toast('已删除');
}
function loadFillPaper(id){
  const code=(id||$('#fbCode').value||'').trim().toUpperCase();
  if(!code){ toast('请输入回填码'); return; }
  const ps=loadPapers();
  const p=ps[code];
  if(!p){ toast('未找到该试卷，请检查回填码'); return; }
  const answers=JSON.parse(localStorage.getItem('shangan_fill_'+code)||'{}');
  $('#fbBody').innerHTML=`
    <div class="mt12" style="border-top:2px solid var(--line);padding-top:12px">
      <h4>📝 ${esc(p.title)} · ${p.n} 题</h4>
      <div class="muted mb10">按题号填入答案（单选填 A/B/C/D，多选填如 AB）。已填 ${Object.keys(answers).length} 题。</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px">
        ${p.qs.map(q=>`<div style="border:1px solid var(--line);border-radius:10px;padding:6px 8px;text-align:center">
          <div style="font-size:11px;color:#888">${q.i}. ${q.mod.slice(0,2)}${q.multi?'·多选':''}</div>
          <input data-q="${q.i}" value="${answers[q.i]||''}" placeholder="-" style="width:100%;text-align:center;border:1px solid var(--line);border-radius:8px;padding:4px;margin-top:2px;font-weight:700" oninput="saveFill('${code}')"></div>`).join('')}
      </div>
      <div class="btn-row">
        <button class="btn primary" onclick="submitFill('${code}')">✅ 交卷判分</button>
        <button class="btn" onclick="renderFillback()">返回</button>
      </div>
      <div id="fbResult" class="mt12"></div>
    </div>`;
}
function saveFill(code){
  const vals={};
  $$('#fbBody input[data-q]').forEach(i=>{ if(i.value.trim()) vals[i.dataset.q]=i.value.trim().toUpperCase(); });
  try{ localStorage.setItem('shangan_fill_'+code, JSON.stringify(vals)); }catch(e){}
}
function submitFill(code){
  const ps=loadPapers(); const p=ps[code];
  if(!p) return;
  const vals=JSON.parse(localStorage.getItem('shangan_fill_'+code)||'{}');
  let filled=0, correct=0;
  const detail=p.qs.map(q=>{
    const raw=(vals[q.i]||'').trim().toUpperCase();
    if(!raw){ return {...q, filled:false}; }
    filled++;
    // 归一化用户答案 → 下标/下标数组
    let userAns;
    if(q.multi){ userAns=raw.split('').map(c=>'ABCD'.indexOf(c)).filter(x=>x>=0).sort().join(','); }
    else { const idx='ABCD'.indexOf(raw); userAns=idx>=0? idx : -1; }
    let ok=false;
    if(q.multi){ ok = userAns===String(q.ans).split('').map(c=>'ABCD'.indexOf(c)).filter(x=>x>=0).sort().join(','); }
    else { ok = userAns===q.ans; }
    if(ok) correct++;
    return {...q, filled:true, ok, userRaw:raw};
  });
  if(!filled){ toast('至少填一题再交卷'); return; }
  // 逐题记入学习数据（与线上做题同一套 recordResult 逻辑）
  detail.forEach(d=>{
    if(!d.filled) return;
    const q=allQuestions().find(x=>x.id===d.id);
    if(!q) return;
    recordResult(q, d.multi? (d.userRaw.split('').map(c=>'ABCD'.indexOf(c)).filter(x=>x>=0)) : ('ABCD'.indexOf(d.userRaw)), d.ok);
  });
  const acc=Math.round(correct/filled*100);
  // 按模块统计
  const byMod={};
  detail.filter(d=>d.filled).forEach(d=>{ byMod[d.mod]=byMod[d.mod]||{a:0,c:0}; byMod[d.mod].a++; d.ok&&byMod[d.mod].c++; });
  $('#fbResult').innerHTML=`
    <div class="card" style="border:2px solid var(--green)">
      <h3>🎉 判卷完成：${correct}/${filled} 正确（${acc}%）</h3>
      <div class="muted mb10">成绩已并入学习数据（正确率、错题本、打卡、每日统计）。</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
        ${Object.entries(byMod).map(([m,s])=>`<div class="hs"><b>${MOD_ICO[m]} ${s.c}/${s.a}</b><span>${m}</span></div>`).join('')}
      </div>
      <details class="mt8"><summary>逐题详情</summary>
        ${detail.map(d=>`<div style="padding:3px 0;border-bottom:1px dashed #eee">${d.i}. ${d.filled? (d.ok?'✅':'❌')+' '+d.userRaw : '— 未填'} <span class="muted">${esc(d.mod)}</span></div>`).join('')}
      </details>
    </div>`;
  // 判完后删除试卷记录，释放空间
  // 保留，用户可再回看；空间由 delPaper 管理
}

/* ---------- 真题卷格式 PDF 导出 v2（全真/练习双模式） ---------- */
function srcText(q){
  /* 打印/导出用文本来源：多来源合并展示 */
  const tags=srcTags(q);
  return tags.length? tags.join(' / ') : String(q.tag||'');
}
function srcNo(q){ return q.num? `第${q.num}题` : ''; }
function srcLine(q){
  /* 题干前的来源注明行：结构化来源标签已自带原卷题号 */
  const t=srcText(q);
  if(q.src) return t;
  const no=srcNo(q);
  return t + (no? '·'+no : '');
}
/* ---------- 打印/导出图片修复（v2.1） ---------- */
function cleanAnalysisText(an){
  /* 运行时兜底：数据层已清洗，这里再清一次防旧缓存 */
  an=String(an||'');
  const pos=an.lastIndexOf('来源20');
  if(pos>=0 && an.length-pos<150) an=an.slice(0,pos).replace(/[\s\u3000　]+$/,'');
  an=an.replace(/\n?[（(]来源[：:]\s*20\d\d[^）)]*[）)]/g,'');
  an=an.replace(/\n?来源[：:]\s*20\d\d[^\n]*/g,'');
  an=an.replace(/视频解析/g,'');
  return an.trim();
}
function printImg(url, alt){
  if(!url) return '';
  return `<img src="${url}" alt="${alt||'图'}" style="max-width:100%;max-height:280px;vertical-align:middle">`;
}
function printStemHtml(q){
  let s=esc(String(q.stem||''));
  if(q.images&&q.images.length) s=s.replace(/\[图(\d+)\]/g,(m,n)=>printImg(q.images[+n]));
  return s;
}
function printMatHtml(q){
  let s=esc(String(q.mat||''));
  if(q.mat_images&&q.mat_images.length){ let n=0; s=s.replace(/\[图\]/g,()=>printImg(q.mat_images[n++])); }
  return s;
}
function printOptsHtml(q){
  return q.options.map((o,j)=>{
    let t=esc(String(o));
    if(q.opt_images&&q.opt_images[j]&&q.opt_images[j].length){
      t=t.replace(/\[图\]/g,'');  // 去掉占位文字
      t+=q.opt_images[j].map(u=>printImg(u)).join('');
    }
    return `<div>${'ABCD'[j]}. ${t}</div>`;
  }).join('');
}
function printWaitScript(){
  /* 等图片加载完成再触发打印（最多等4秒） */
  return `<script>window.onload=function(){
    var imgs=[].slice.call(document.images);
    if(!imgs.length){ setTimeout(function(){window.print()},300); return; }
    var done=0, fired=false;
    function tryPrint(){ if(fired) return; done++; if(done>=imgs.length){ fired=true; setTimeout(function(){window.print()},300); } }
    imgs.forEach(function(im){ if(im.complete) tryPrint(); else { im.onload=tryPrint; im.onerror=tryPrint; } });
    setTimeout(function(){ if(!fired){ fired=true; window.print(); } }, 4000);
  }<\/script>`;
}
function baseHref(){
  const p=location.href.split('/'); p.pop();
  return p.join('/')+'/';
}
function printPaper(qs){
  const w=window.open('','_blank');
  const cfgName=$('#pcType')?.value||'模拟卷';
  const fullReal=$('#pcFullReal')?.checked!==false;
  const now=new Date();
  const dateStr=`${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`;
  const paperMinutes=selectedPaperMinutes();
  // 注册打印卷 → 回填码（供答案回填判卷）
  const paperId=registerPaper(cfgName, qs);
  // 每题来源行（练习模式）
  const srcNote=q=>{
    if(fullReal) return '';
    const s=srcLine(q);
    return s? `<div class="src-note">【来源：${esc(s)}】${qRate(q)?` 正确率 ${qRate(q)}%`:''}${qPoints(q)?` 考点：${esc(qPoints(q).split(' ')[0])}`:''}</div>` : '';
  };
  // 按模块分组（保持卷面顺序）
  const parts=MOD_ORDER.filter(m=>qs.some(q=>q.mod===m)).map(m=>({mod:m, list:qs.filter(q=>q.mod===m)}));
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${baseHref()}"><title>${cfgName}${fullReal?'·全真模拟卷':'·练习卷'}</title>
  <style>
  @page{size:A4;margin:18mm 16mm}
  body{font-family:SimSun,'Songti SC','Microsoft YaHei',serif;color:#000;font-size:12px;line-height:1.7}
  img{max-width:100%}
  .head{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px}
  .head h1{font-size:18px;letter-spacing:2px;margin-bottom:2px}
  .head .sub{font-size:12px}
  .notice{border:1.5px solid #000;padding:8px 12px;margin-bottom:14px;font-size:11px}
  .notice b{display:block;text-align:center;margin-bottom:4px;font-size:12px}
  .part{font-weight:700;font-size:14px;margin:16px 0 8px;padding:4px 10px;background:#f2f4f7;border-left:4px solid #000}
  .part-dir{font-size:11px;color:#333;margin:-4px 0 10px 4px}
  .q{margin-bottom:14px;page-break-inside:avoid}
  .q .no{font-weight:700}
  .q .stem{display:inline;margin-left:4px}
  .q .opts{margin:3px 0 3px 22px}
  .q .opts div{margin:1px 0}
  .src-note{font-size:10px;color:#8a6d3b;background:#fdf6ec;border-left:3px solid #d4a017;padding:2px 6px;margin-bottom:6px}
  .material{background:#f8f9fa;border:1px dashed #999;padding:8px 10px;margin-bottom:10px;font-size:11.5px;white-space:pre-wrap}
  .ans-page{page-break-before:always}
  .ans-table{width:100%;border-collapse:collapse;margin-top:8px}
  .ans-table td,.ans-table th{border:1px solid #000;padding:4px;text-align:center;font-size:11px}
  .ans-table .ahead{background:#f2f4f7;font-weight:700}
  .card-page{page-break-before:always}
  .card{width:100%;border-collapse:collapse;margin-top:8px}
  .card td,.card th{border:1px solid #000;padding:3px;text-align:center;font-size:10px}
  .card .chunk{border:1px solid #000}
  .foot{text-align:center;color:#666;margin-top:20px;font-size:10px}
  </style></head><body>
  <div class="head">
    <h1>${cfgName}${fullReal?'·全真模拟卷':'·练习卷'}</h1>
    <div class="sub">《行政职业能力测验》 · 作答时限 ${paperMinutes} 分钟 · 满分 100 分</div>
    <div class="sub">上岸通 智能组卷 · ${dateStr} · 共 ${qs.length} 题${fullReal?'':' · 练习模式（含来源标注）'}</div>
    ${fullReal?`<div class="sub" style="color:#c0392b">🔑 答案回填码：<b>${paperId}</b>（做完后在上岸通「答案回填」输入此码，自动判卷并记录学习数据）</div>`:''}
  </div>
  <div class="notice"><b>注意事项</b>
  1. 本试卷为行测模拟题，请用 2B 铅笔在答题卡上作答，在题本上作答一律无效。<br>
  2. 监考人员宣布考试开始时，方可开始答题。<br>
  3. 监考人员宣布考试结束时，应立即停止答题，将题本、答题卡翻放桌上。<br>
  4. 答题前请认真阅读答题卡上的注意事项，按规定填涂姓名与准考证号。
  </div>
  ${parts.map(p=>{
    return `<div class="part">${MOD_ICO[p.mod]} ${p.mod}（${p.list.length} 题）</div>
    <div class="part-dir">${p.mod==='资料分析'?'本部分题目提供材料，请根据材料内容作答。':p.mod==='言语理解'?'本部分包括表达与理解两方面的内容，请根据题目要求，在四个选项中选出一个最恰当的答案。':p.mod==='判断推理'?'本部分包括图形推理、定义判断、类比推理与逻辑判断等内容，请根据题目要求作答。':p.mod==='数量关系'?'在这部分试题中，每道题呈现一段表述数字关系的文字，要求你迅速、准确地计算出答案。':p.mod==='常识判断'?'本部分涵盖政治、经济、法律、人文、科技等方面的知识，请根据题目要求作答。':p.mod==='政治理论'?'本部分主要测查报考者学习理解掌握党的创新理论及党和国家方针政策的情况。':'请根据题目要求作答。'}</div>`
    +p.list.map(q=>{
      const no=qs.indexOf(q)+1;
      return (q.mat?`<div class="material">${printMatHtml(q)}</div>`:'')+
        `<div class="q">${srcNote(q)}<span class="no">${no}.</span><div class="stem">${printStemHtml(q)}</div>
        <div class="opts">${printOptsHtml(q)}</div></div>`;
    }).join('');
  }).join('')}
  <div class="card-page"><div class="part">📝 答题卡（可打印后涂卡，做完扫码/回填线上判卷）</div>
  <table class="card">
    ${Array.from({length:Math.ceil(qs.length/10)},(_,row)=>{
      const cols=Array.from({length:10},(_,c)=>{const n=row*10+c+1; if(n>qs.length) return '<td></td>';
        return `<td class="chunk"><b>${n}</b><br><span style="font-size:9px">A B C D</span></td>`;}).join('');
      return `<tr><td class="ahead" style="width:26px">${row+1}</td>${cols}</tr>`;
    }).join('')}
  </table>
  <div class="foot">打印后可在上方涂卡；做完后用「上岸通 · 答案回填」扫码或拍照回填，自动判卷并记录个人数据</div></div>
  <div class="ans-page"><div class="part">📋 参考答案与解析（${qs.length} 题）</div>
  ${qs.map((q,i)=>`<div class="q"><b>${i+1}. ${q.mod} · ${q.type}</b> 答案：<b>${q.multi?q.answer:('ABCD'[q.answer])}</b>${qRate(q)?`（正确率 ${qRate(q)}%）`:''}${qPoints(q)?` · 考点：${esc(qPoints(q))}`:''}${fullReal?'':'<div style="font-size:10px;color:#8a6d3b">来源：'+esc(srcLine(q))+'</div>'}<div class="material" style="border:none;background:transparent;padding:4px 0 0">${esc(cleanAnalysisText(q.analysis))}</div></div>`).join('')}
  <div class="foot">本卷由上岸通智能生成，仅供学习使用 · 解析版权归原题库方所有</div></div>
  ${printWaitScript()}
  </body></html>`);
  w.document.close();
}
function smartQuiz(){
  if(requireFullBank(()=>smartQuiz())) return;
  // 按错题考点 + attempts 薄弱考点 + 模块正确率生成薄弱点练习（C2 联动）
  const wrong=Object.keys(store.wrongs).map(id=>allQuestions().find(q=>q.id===id)).filter(Boolean);
  const pointCount={};
  wrong.forEach(q=>{ const p=qPoints(q)||'未分类'; pointCount[p]=(pointCount[p]||0)+1; });
  // C2: 从逐题日志里取薄弱考点（正确率最低的）
  store.attempts.forEach(a=>{ if(!a.point) return; const key=a.point.split(' ')[0];
    (pointCount[key]=pointCount[key]||0); });
  const weakPoints=Object.entries(pointCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]);
  const weakMods=MODS.map(m=>{const b=store.stats.byMod[m]||{answered:0,correct:0};return {m,acc:b.answered?b.correct/b.answered:0,n:b.answered};})
    .filter(x=>x.n>=5).sort((a,b)=>a.acc-b.acc).slice(0,2).map(x=>x.m);
  let pool=[];
  if(weakPoints.length){
    pool=allQuestions().filter(q=>{ const p=qPoints(q); return weakPoints.some(wp=>p&&p.includes(wp.split(' ')[0])); });
  }
  if(pool.length<15 && weakMods.length){
    pool=pool.concat(allQuestions().filter(q=>weakMods.includes(q.mod)));
  }
  if(pool.length<15){ pool=allQuestions().filter(q=>wrong.some(w=>w.mod===q.mod)); }
  const list=shuffle([...new Set(pool)]).slice(0,15);
  if(!list.length){ toast('题库为空或暂无错题数据'); return; }
  const info=weakPoints.length?('薄弱考点：'+weakPoints.slice(0,3).join('、')):(weakMods.length?('薄弱模块：'+weakMods.join('、')):'随机强化');
  startQuiz(list, '🧠 智能组卷 · '+info+' · '+list.length+'题');
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
    <div class="btn-row">
      <button class="btn gold" onclick="renderCustomQuiz()">🎯 卷种定制组卷（上岸通特色）</button>
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
function bankCacheStatusText(){
  const s=window.LAZY_BANK_STATUS;
  if(!s) return '当前浏览器不支持完整题库缓存';
  if(s.cacheHit) return '本次已从本地缓存快速恢复完整题库';
  if(s.cacheStored) return '完整题库已缓存，下次访问可快速恢复';
  if(s.loading) return '完整题库正在加载，完成后会自动缓存';
  if(s.loaded) return '完整题库已加载，正在后台写入缓存';
  return '完整题库尚未加载';
}
async function clearBankCache(){
  if(!confirm('只清理约 150MB 的完整题库缓存？作答记录、错题本和个人画像不会删除。')) return;
  try{
    if(window.clearFullBankCache) await window.clearFullBankCache();
    toast('题库缓存已清理，下次访问将重新下载','ok');
    if(currentView()==='more') renderMore();
  }catch(e){ toast(e?.message||'题库缓存清理失败','error'); }
}
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
  <div class="card"><h3><span class="dot"></span>⚡ 题库离线加速</h3>
    <div class="muted">${bankCacheStatusText()}。缓存仅保存公共题库，约占 150MB；版本更新后会自动失效并重建。</div>
    <div class="btn-row"><button class="btn" onclick="clearBankCache()">清理题库缓存</button></div>
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
    <div class="muted">上岸通 v2.2 — 考公一站式学习工具。纯前端、题库持久缓存、离线加速，题库与素材持续扩充中。祝你一战成公！🎉</div>
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
  Q._qEnter=Date.now();   // C1: 记录本题进入时间（算用时）
  $('#quizProgress').textContent=`${Q.idx+1}/${Q.list.length}`;
  const chosen=Q.answers[q.id];
  const multi=!!q.multi;
  const answered=chosen!==undefined;
  const sel = multi&&answered&&Array.isArray(chosen)? chosen : (multi&&!answered? (Q._multiSel||[]) : []);
  const matHtml=q.mat? `<div class="q-analy" style="background:var(--navy-3);border-color:#cddcea;color:var(--ink-2);margin-bottom:14px"><b>📄 材料：</b>${renderMat(q)}</div>`:'';
  const stem=matHtml? q.stem : q.stem;
  $('#quizBody').innerHTML=`
  <div class="q-stem"><span class="q-tag">${MOD_ICO[q.mod]} ${q.mod} · ${q.type}${multi?' · 多选题':''}</span>
    <div class="q-tags">${qTagHtml(q)}</div>
    <div class="q-text">${renderStem(q,stem)}</div></div>
  ${q.options.map((op,i)=>{
    let cls='q-opt'+(answered?' disabled':'');
    let mark='';
    if(answered){
      const right = multi? String(q.answer).includes('ABCD'[i]) : i===q.answer;
      const picked = multi? sel.includes(i) : chosen===i;
      if(right) cls+=' correct';
      if(picked && !right) cls+=' wrong';
      if(multi){
        if(picked&&right) mark='<span class="mark">✅</span>';
        else if(picked&&!right) mark='<span class="mark">❌</span>';
        else if(right) mark='<span class="mark" style="right:38px">✓</span>';
      } else if(picked){
        mark=`<span class="mark">${right?'✅':'❌'}</span>`;
      }
    } else if(multi && sel.includes(i)){
      cls+=' multi-sel';
      mark='<span class="mark">✓</span>';
    }
    return `<button class="${cls}" onclick="pick(${i})">
      <span class="ol">${'ABCD'[i]}</span>${optTextHtml(q,i)}${mark}
      ${Q.marks[q.id]&&!answered?'<span class="marked-tag">⚑ 已标记</span>':''}
    </button>`;
  }).join('')}
  ${multi&&!answered? `<button class="btn primary" style="margin-top:14px" onclick="submitMulti()">✓ 确定选择（${sel.length} 项）</button>`:''}
  ${answered? `
    <div class="q-analy"><b>💡 解析：</b>${esc(cleanAnalysisText(q.analysis))}</div>`:''}
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
  const multiUnanswered = q.multi && chosen===undefined;
  $('#footNext').textContent = multiUnanswered? '确定选择' : (isLast?'交卷':'下一题');
  $('#footNext').className='btn primary';
  $('#footNext').onclick = multiUnanswered? submitMulti : nextQ;
}
function pick(i){
  const q=Q.list[Q.idx];
  if(Q.answers[q.id]!==undefined) return;
  if(q.multi){
    let sel = Q._multiSel || [];
    if(sel.includes(i)) sel = sel.filter(x=>x!==i); else sel = [...sel, i].sort();
    Q._multiSel = sel;
    renderQ();
    return;
  }
  Q.answers[q.id]=i;
  const dur=Math.max(0, Math.round((Date.now()-(Q._qEnter||Date.now()))/1000));
  recordResult(q,i,i===q.answer,dur);
  renderQ();
}
function submitMulti(){
  const q=Q.list[Q.idx];
  if(!q||!q.multi||Q.answers[q.id]!==undefined) return;
  const sel=(Q._multiSel||[]).slice().sort();
  if(!sel.length){ toast('请至少选择一个选项'); return; }
  Q.answers[q.id]=sel;
  Q._multiSel=null;
  const dur=Math.max(0, Math.round((Date.now()-(Q._qEnter||Date.now()))/1000));
  recordResult(q,sel,isCorrect(q,sel),dur);
  renderQ();
}
function nextQ(){ if(Q.idx<Q.list.length-1){ Q.idx++; Q._multiSel=null; renderQ(); } else finishQuiz(); }
function prevQ(){ if(Q.idx>0){ Q.idx--; Q._multiSel=null; renderQ(); } }
function markQ(){ const id=Q.list[Q.idx].id; if(Q.answers[id]!==undefined) return; Q.marks[id]=!Q.marks[id]; renderQ(); }
function finishQuiz(forced){
  clearInterval(Q.timer); Q.timer=null;
  const total=Q.list.length;
  const answered=Object.keys(Q.answers).length;
  const correct=Q.list.filter(q=>isCorrect(q,Q.answers[q.id])).length;
  const unans=total-answered;
  $('#quizLayer').classList.add('hidden');
  document.body.style.overflow='';
  const acc=answered?Math.round(correct/answered*100):0;
  const mods={}; Q.list.forEach(q=>{ (mods[q.mod]=mods[q.mod]||{n:0,c:0}); mods[q.mod].n++; if(isCorrect(q,Q.answers[q.id])) mods[q.mod].c++; });
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
  const multi=!!q.multi;
  const sel = multi&&Array.isArray(chosen)? chosen : [];
  $('#quizBody').innerHTML=`
  <div class="q-stem"><span class="q-tag">${MOD_ICO[q.mod]} ${q.mod} · ${q.type}${multi?' · 多选题':''}</span>
    <div class="q-tags">${qTagHtml(q)}</div>
    ${q.mat?`<div class="q-analy" style="background:var(--navy-3);border-color:#cddcea;color:var(--ink-2);margin-bottom:10px"><b>📄 材料：</b>${renderMat(q)}</div>`:''}
    <div class="q-text">${renderStem(q,q.stem)}</div></div>
  ${q.options.map((op,i)=>{
    const right = multi? String(q.answer).includes('ABCD'[i]) : i===q.answer;
    const picked = multi? sel.includes(i) : chosen===i;
    let cls='q-opt disabled'+(right?' correct':(picked?' wrong':''));
    let mark='';
    if(multi){
      if(picked&&right) mark='<span class="mark">✅</span>';
      else if(picked&&!right) mark='<span class="mark">❌</span>';
      else if(right) mark='<span class="mark" style="right:38px">✓</span>';
    } else if(picked){
      mark=`<span class="mark">${right?'✅':'❌'}</span>`;
    }
    return `<div class="${cls}">
      <span class="ol">${'ABCD'[i]}</span>${optTextHtml(q,i)}${mark}
    </div>`;
  }).join('')}
  <div class="q-analy"><b>💡 解析：</b>${esc(cleanAnalysisText(q.analysis))}<br><span class="muted">你${chosen!==undefined? '选了 '+qAnsText(q,chosen)+(isCorrect(q,chosen)?'，回答正确':'，回答错误'):'未作答'} · 正确答案 ${qAnsText(q,q.answer)}</span></div>`;
  updateFoot();
}
function reviewNav(dir){ Q.idx+=dir; if(Q.idx<0)Q.idx=0; if(Q.idx>=Q.list.length)Q.idx=Q.list.length-1; renderReview(); }
document.addEventListener('keydown',e=>{
  if($('#quizLayer').classList.contains('hidden')) return;
  if(e.key==='Escape'){ $('#quizClose').click(); return; }
  if(e.key>='1'&&e.key<='4') pick(+e.key-1);
  else if(e.key==='Enter'){ const q=Q.list[Q.idx]; if(q&&q.multi&&Q.answers[q.id]===undefined) submitMulti(); }
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
window.renderCustomQuiz=renderCustomQuiz; window.applyPaperCfg=applyPaperCfg; window.pcTotal=pcTotal;
window.buildPaper=buildPaper; window.buildPaperAndPrint=buildPaperAndPrint; window.smartQuiz=smartQuiz;
window.renderFillback=renderFillback; window.loadFillPaper=loadFillPaper; window.delPaper=delPaper;
window.saveFill=saveFill; window.submitFill=submitFill; window.registerPaper=registerPaper;
window.renderAnalysis=renderAnalysis; window.smartQuiz=smartQuiz;
window.doSearch=doSearch; window.searchDebounced=searchDebounced; window.exportFiltered=exportFiltered; window.printFiltered=printFiltered;
window.exportData=exportData; window.importData=importData; window.confirmReset=confirmReset; window.clearBankCache=clearBankCache;
window.openUrl=(u)=>{ window.open(u,'_blank'); };
window.toggleReview=toggleReview; window.pomoToggle=pomoToggle; window.pomoReset=pomoReset;
window.reviewQuiz=reviewQuiz; window.reviewNav=reviewNav; window.closeResult=closeResult;
pomoRender();
renderDash();
