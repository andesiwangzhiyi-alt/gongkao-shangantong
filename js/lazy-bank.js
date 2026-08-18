/* 上岸通 2.0 · 大题库分片懒加载器
 * 首屏不再同步解析约 352MB 的 questions6 模考库；空闲时按 manifest 分批加载。
 * 页面功能可调用 ensureFullBank() 等待完整题库就绪。
 */
(() => {
  const status = window.LAZY_BANK_STATUS = {
    loaded: false,
    loading: false,
    error: null,
    startedAt: 0,
    loadedAt: 0,
    loadedChunks: 0,
    totalChunks: 0,
    totalQuestions: 0
  };
  const loadedFiles = new Set();
  let promise = null;

  function loadScript(src){
    if(loadedFiles.has(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => {
        loadedFiles.add(src);
        status.loadedChunks = loadedFiles.size;
        window.dispatchEvent(new CustomEvent('sat:bank-progress', {detail: status}));
        resolve();
      };
      s.onerror = () => { s.remove(); reject(new Error(`题库分片加载失败：${src}`)); };
      document.head.appendChild(s);
    });
  }

  async function loadAll(){
    const [r1, r2] = await Promise.all([
      fetch('js/bank/questions6-manifest.json'),
      fetch('js/bank/questions9-manifest.json')
    ]);
    if(!r1.ok) throw new Error(`题库 manifest HTTP ${r1.status}`);
    const m1 = await r1.json();
    let chunks = m1.chunks || [];
    let total = m1.total || 0;
    if(r2.ok){
      const m2 = await r2.json();
      chunks = chunks.concat(m2.chunks || []);
      total += m2.total || 0;
    }
    status.totalChunks = chunks.length;
    status.totalQuestions = total;
    // 每批 3 个：兼顾网络并行和主线程 JSON/JS 解析压力
    for(let i=0; i<chunks.length; i+=3){
      await Promise.all(chunks.slice(i,i+3).map(x=>loadScript(x.file)));
      await new Promise(resolve=>setTimeout(resolve,0)); // 给 UI 一次绘制机会
    }
  }

  window.ensureFullBank = function ensureFullBank(){
    if(status.loaded) return Promise.resolve(status);
    if(promise) return promise;
    status.loading = true;
    status.error = null;
    status.startedAt = status.startedAt || Date.now();
    window.dispatchEvent(new CustomEvent('sat:bank-loading', {detail: status}));
    promise = loadAll().then(() => {
      status.loaded = true;
      status.loading = false;
      status.loadedAt = Date.now();
      window.dispatchEvent(new CustomEvent('sat:bank-loaded', {detail: status}));
      return status;
    }).catch(err => {
      status.loading = false;
      status.error = err.message || String(err);
      promise = null; // 已成功分片由 loadedFiles 记住，重试仅加载缺失分片
      window.dispatchEvent(new CustomEvent('sat:bank-error', {detail: status}));
      throw err;
    });
    return promise;
  };

  // 首屏完成后再利用空闲时间加载；不阻塞首页首次渲染。
  const start = () => {
    if('requestIdleCallback' in window){
      requestIdleCallback(() => window.ensureFullBank().catch(() => {}), {timeout: 3000});
    }else{
      setTimeout(() => window.ensureFullBank().catch(() => {}), 1200);
    }
  };
  if(document.readyState === 'complete') start();
  else window.addEventListener('load', start, {once:true});
})();
