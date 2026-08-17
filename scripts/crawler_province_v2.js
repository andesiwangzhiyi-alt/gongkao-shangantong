// ============================================================
// 上岸通 2.0 · 省考真题完整重爬专用脚本
// 目标：仅爬「省考」标签；完整保留题目、共享材料、图表与解析 HTML
// 使用：登录 fenbi.com → F12 Console → 粘贴整份脚本 → Enter
// 停止：Console 执行 window.fbStop = true（当前套保存后停止）
// 进度：继承 fb_done；独立队列 fb_queue_province_v2；失败 fb_skip_province_v2
// ============================================================
(async () => {
  'use strict';
  const LABEL = '省考';
  const QUEUE_KEY = 'fb_queue_province_v2';
  const SKIP_KEY = 'fb_skip_province_v2';
  const DONE_KEY = 'fb_done';
  const PAUSE_AFTER = 40;          // 低于 45 套风控上限
  const PAUSE_MS = 5 * 60 * 1000; // 每 40 套暂停 5 分钟
  const BETWEEN_MS = 6500;
  const QS = 'app=web&kav=100&av=100&hav=100&version=3.0.0.0';
  const P = (u, o) => fetch(u, Object.assign({credentials: 'include'}, o || {}));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const safe = s => String(s || '').replace(/[\\/:*?"<>|]/g, '_');

  window.fbStop = false;
  window.fbProgressBackup = () => JSON.stringify({
    done: JSON.parse(localStorage.getItem(DONE_KEY) || '[]'),
    queue: JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'),
    skip: JSON.parse(localStorage.getItem(SKIP_KEY) || '[]')
  });

  const doneSet = new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]').map(String));
  const skipSet = new Set(JSON.parse(localStorage.getItem(SKIP_KEY) || '[]').map(String));

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('上岸通 2.0：省考真题完整重爬');
  console.log('⚠️ 请先允许 fenbi.com「自动下载多个文件」；否则日志显示成功但文件不会落盘。');
  console.log('停止命令：window.fbStop = true');
  console.log('备份进度：copy(window.fbProgressBackup())');

  // 登录检测
  const login = await P('https://tiku.fenbi.com/activity/userexamcategory/getCurrent');
  if (login.status === 401 || login.status === 453) {
    throw new Error('粉笔未登录，请登录后再运行脚本');
  }

  // 独立构建省考队列，避免复用旧的国考/模考混合 fb_queue
  let queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || 'null');
  if (!Array.isArray(queue) || !queue.length) {
    const raw = await (await P('https://tiku.fenbi.com/api/xingce/comptroller/subLabels')).json();
    const labels = Array.isArray(raw) ? raw : (raw.list || raw.data || []);
    const lab = labels.find(x => x && x.name === LABEL);
    if (!lab) throw new Error('未找到「省考」标签，请在 Console 输出 subLabels 检查标签名称');
    const meta = lab.labelMeta || lab;
    const labelId = meta.id;
    const paperCount = Number(meta.paperCount || 0);
    queue = [];
    for (let page = 0; page * 50 < Math.max(paperCount, 1); page++) {
      const url = `https://tiku.fenbi.com/api/xingce/comptroller/papers?toPage=${page}&pageSize=50&labelId=${labelId}`;
      const d = await (await P(url)).json();
      const list = d.list || (d.data && d.data.list) || [];
      queue.push(...list.map(p => ({label: LABEL, id: String(p.id), name: p.name})));
      console.log(`队列页 ${page + 1}：累计 ${queue.length} 套`);
      if (list.length < 50) break;
      await sleep(900);
    }
    // paperCount 偶尔为 0，仍保留接口实际返回的列表
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  const pending = queue.filter(p => !doneSet.has(String(p.id)) && !skipSet.has(String(p.id)));
  console.log(`省考队列 ${queue.length} 套；已完成 ${doneSet.size}；本轮待爬 ${pending.length}`);
  if (!pending.length) {
    console.log('✅ 没有待处理省考真题。若要重爬失败项：localStorage.removeItem("fb_skip_province_v2")');
    return;
  }

  let success = 0, failed = 0, batchDone = 0;
  const limitWaits = [5, 10, 20, 40, 60]; // 分钟，逐级退避

  for (let i = 0; i < pending.length; i++) {
    if (window.fbStop) { console.log('⏹ 已按要求停止，进度已保存，下次重跑自动续爬'); break; }
    const job = pending[i];
    console.log(`[${i + 1}/${pending.length}] ${job.name}`);

    // 创建练习；403 时自适应冷却，最终按 60 分钟等待
    let ex = null;
    for (let attempt = 0; !ex && attempt < 12; attempt++) {
      const r = await P('https://tiku.fenbi.com/api/xingce/exercises?' + QS, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
        body: `type=1&paperId=${encodeURIComponent(job.id)}&exerciseTimeMode=2`
      });
      if (r.status === 200) {
        ex = await r.json();
        break;
      }
      const min = limitWaits[Math.min(attempt, limitWaits.length - 1)];
      const until = new Date(Date.now() + min * 60000).toLocaleTimeString();
      console.warn(`  创建练习 HTTP ${r.status}；冷却 ${min} 分钟，${until} 自动重试`);
      await sleep(min * 60000);
      if (window.fbStop) break;
    }
    if (!ex || window.fbStop) {
      if (!window.fbStop) {
        skipSet.add(String(job.id));
        localStorage.setItem(SKIP_KEY, JSON.stringify([...skipSet]));
        failed++;
        console.error('  ❌ 创建练习失败，已记入省考失败清单');
      }
      continue;
    }

    // 空交卷，解锁成绩页完整解析
    const submitUrl = `https://tiku.fenbi.com/combine/exercise/submit?key=${encodeURIComponent(ex.key)}&routecs=xingce&kav=125&av=127&hav=125&app=web&apcid=0&deviceId=&gav=2`;
    const sr = await P(submitUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    if (!sr.ok) console.warn(`  交卷返回 HTTP ${sr.status}，仍尝试读取成绩页`);
    await sleep(1600);

    const expectCount = Number((ex.sheet && ex.sheet.questionCount) || 120);
    const items = await loadSolutionPage(ex.key, expectCount);
    const qcount = items ? items.filter(x => x.type === 'question').length : 0;
    const mcount = items ? items.filter(x => x.type === 'material').length : 0;

    if (items && qcount >= Math.max(20, expectCount * 0.8)) {
      const payload = {paper: {label: LABEL, id: job.id, name: job.name}, items};
      const blob = new Blob([JSON.stringify(payload)], {type: 'application/json'});
      const a = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = `fb_${safe(LABEL)}_${job.id}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

      doneSet.add(String(job.id));
      localStorage.setItem(DONE_KEY, JSON.stringify([...doneSet]));
      success++; batchDone++;
      console.log(`  ✅ ${qcount}/${expectCount} 题，${mcount} 组材料；已触发下载`);
    } else {
      skipSet.add(String(job.id));
      localStorage.setItem(SKIP_KEY, JSON.stringify([...skipSet]));
      failed++;
      console.error(`  ❌ 渲染不完整：${qcount}/${expectCount} 题；已记失败清单`);
    }

    if (batchDone > 0 && batchDone % PAUSE_AFTER === 0) {
      const until = new Date(Date.now() + PAUSE_MS).toLocaleTimeString();
      console.log(`  🫖 已完成 ${batchDone} 套，主动暂停 5 分钟，${until} 继续`);
      await sleep(PAUSE_MS);
    } else {
      await sleep(BETWEEN_MS);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`本轮结束：成功 ${success}，失败 ${failed}，累计 done ${doneSet.size}`);
  console.log('务必打开 chrome://downloads 核对 JSON 文件真实落盘；不要只看 Console 的 ✅。');

  async function loadSolutionPage(key, expectCount) {
    return new Promise(resolve => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:900px;opacity:0;pointer-events:none';
      f.src = '/ti/exam/solution/' + encodeURIComponent(key) + '?routecs=xingce';
      document.body.appendChild(f);
      let tries = 0, lastN = -1, stable = 0, settled = false;
      const finish = out => { if (settled) return; settled = true; clearInterval(timer); f.remove(); resolve(out); };
      const timer = setInterval(() => {
        tries++;
        try {
          const doc = f.contentDocument;
          const n = doc ? doc.querySelectorAll('app-ti[data-question-key]').length : 0;
          stable = n === lastN ? stable + 1 : 0;
          lastN = n;

          // 触发分章/懒加载
          if (doc && n < expectCount) {
            f.contentWindow.scrollTo(0, doc.documentElement.scrollHeight);
            doc.querySelectorAll('*').forEach(el => {
              if (el.scrollHeight > el.clientHeight + 80) el.scrollTop = el.scrollHeight;
            });
          }

          const enough = n >= expectCount;
          const stableEnough = stable >= 8 && n >= Math.max(100, Math.floor(expectCount * 0.8));
          const timeout = tries > 180; // 最长约 3 分钟
          if (enough || stableEnough || timeout) {
            clearInterval(timer);
            setTimeout(() => {
              try {
                const doc2 = f.contentDocument;
                const els = doc2.querySelectorAll('.materials-container, app-ti[data-question-key]');
                const out = [...els].map(el => {
                  const clone = el.cloneNode(true);
                  clone.querySelectorAll('svg,script,style').forEach(x => x.remove());
                  if (el.tagName.toLowerCase() === 'app-ti') {
                    return {type: 'question', key: el.getAttribute('data-question-key'), html: clone.innerHTML};
                  }
                  return {type: 'material', html: clone.innerHTML};
                });
                finish(out);
              } catch (e) {
                console.error('  成绩页提取失败', e);
                finish(null);
              }
            }, 2200);
          }
        } catch (e) {
          console.error('  iframe 读取失败', e);
          finish(null);
        }
      }, 1000);
    });
  }
})().catch(e => console.error('省考重爬脚本终止：', e));
