/* 上岸通 2.2 · 大题库懒加载 + IndexedDB 持久缓存
 * 首次访问按 manifest 加载分片并在后台缓存结构化题目；后续访问直接从 IndexedDB 恢复。
 * manifest 内容指纹变化时自动失效，缓存不可用/损坏时无感回退网络。
 */
(() => {
  const DB_NAME = 'shangantong-bank';
  const DB_VERSION = 1;
  const STORE = 'parts';
  const META_KEY = 'meta';
  const CACHE_PART_SIZE = 250;
  const status = window.LAZY_BANK_STATUS = {
    loaded: false, loading: false, error: null,
    startedAt: 0, loadedAt: 0,
    loadedChunks: 0, totalChunks: 0, totalQuestions: 0,
    source: null, cacheHit: false, cacheStored: false, cacheError: null,
    signature: null
  };
  const loadedFiles = new Set();
  let promise = null;
  let dbPromise = null;

  function emit(name){
    window.dispatchEvent(new CustomEvent(name, {detail: {...status}}));
  }
  function openDb(){
    if(!('indexedDB' in window)) return Promise.reject(new Error('浏览器不支持 IndexedDB'));
    if(dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath:'key'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
    });
    return dbPromise;
  }
  async function idbGet(key){
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbPut(value){
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB 写入中止'));
    });
  }
  async function idbClear(){
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function loadScript(src){
    if(loadedFiles.has(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => {
        loadedFiles.add(src);
        status.loadedChunks = loadedFiles.size;
        emit('sat:bank-progress');
        resolve();
      };
      s.onerror = () => { s.remove(); reject(new Error(`题库分片加载失败：${src}`)); };
      document.head.appendChild(s);
    });
  }

  async function fetchManifests(){
    const [r1, r2] = await Promise.all([
      fetch('js/bank/questions6-manifest.json', {cache:'no-cache'}),
      fetch('js/bank/questions9-manifest.json', {cache:'no-cache'})
    ]);
    if(!r1.ok) throw new Error(`题库 manifest HTTP ${r1.status}`);
    const m1 = await r1.json();
    const m2 = r2.ok ? await r2.json() : {version:0, build:'none', total:0, chunks:[]};
    const chunks = [...(m1.chunks||[]), ...(m2.chunks||[])];
    const total = (m1.total||0) + (m2.total||0);
    const fallback = m => (m.chunks||[]).map(x=>`${x.file}:${x.bytes}:${x.count}`).join(',');
    const signature = `q6:${m1.build||fallback(m1)}|q9:${m2.build||fallback(m2)}`;
    return {chunks, total, signature};
  }

  async function restoreCache(signature, total, totalChunks){
    const meta = await idbGet(META_KEY);
    if(!meta || meta.signature !== signature || meta.total !== total || !Array.isArray(meta.parts)) return false;
    const restored = {};
    let count = 0;
    for(const p of meta.parts){
      const rec = await idbGet(p.key);
      if(!rec || !Array.isArray(rec.items) || rec.items.length !== p.count) throw new Error('题库缓存不完整');
      (restored[p.mod] ||= []).push(...rec.items);
      count += rec.items.length;
      status.loadedChunks = Math.min(totalChunks, Math.floor(count / total * totalChunks));
      emit('sat:bank-progress');
    }
    if(count !== total) throw new Error(`题库缓存题量异常：${count}/${total}`);
    for(const [mod, items] of Object.entries(restored)){
      if(!QUESTION_BANK[mod]) QUESTION_BANK[mod] = [];
      QUESTION_BANK[mod].push(...items);
    }
    status.loadedChunks = totalChunks;
    status.cacheHit = true;
    status.source = 'indexeddb';
    return true;
  }

  async function persistCache(signature, total, baseLengths){
    try{
      await idbClear(); // meta 最后写入；中途失败不会留下“可用”缓存
      const parts = [];
      let saved = 0;
      for(const [mod, list] of Object.entries(QUESTION_BANK)){
        const delta = list.slice(baseLengths[mod] || 0);
        for(let i=0; i<delta.length; i+=CACHE_PART_SIZE){
          const items = delta.slice(i, i + CACHE_PART_SIZE);
          const key = `part:${signature}:${mod}:${i/CACHE_PART_SIZE}`;
          await idbPut({key, items});
          parts.push({key, mod, count:items.length});
          saved += items.length;
        }
      }
      if(saved !== total) throw new Error(`缓存写入题量异常：${saved}/${total}`);
      await idbPut({key:META_KEY, signature, total, parts, savedAt:Date.now()});
      status.cacheStored = true;
      status.cacheError = null;
      emit('sat:bank-cache-ready');
      if(navigator.storage?.persist) navigator.storage.persist().catch(()=>{});
    }catch(err){
      status.cacheError = err?.message || String(err);
      status.cacheStored = false;
      emit('sat:bank-cache-error');
    }
  }

  async function loadAll(){
    const {chunks, total, signature} = await fetchManifests();
    status.totalChunks = chunks.length;
    status.totalQuestions = total;
    status.signature = signature;
    const baseLengths = Object.fromEntries(Object.entries(QUESTION_BANK).map(([m,a])=>[m,a.length]));

    try{
      if(await restoreCache(signature, total, chunks.length)) return;
    }catch(err){
      status.cacheError = err?.message || String(err);
      try{ await idbClear(); }catch(_){ /* 网络回退不受缓存清理失败影响 */ }
    }

    status.source = 'network';
    for(let i=0; i<chunks.length; i+=3){
      await Promise.all(chunks.slice(i,i+3).map(x=>loadScript(x.file)));
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    // 缓存写入在后台执行，不延迟题库就绪事件。
    setTimeout(()=>persistCache(signature, total, baseLengths), 0);
  }

  window.ensureFullBank = function ensureFullBank(){
    if(status.loaded) return Promise.resolve(status);
    if(promise) return promise;
    status.loading = true;
    status.error = null;
    status.startedAt = status.startedAt || Date.now();
    emit('sat:bank-loading');
    promise = loadAll().then(() => {
      status.loaded = true;
      status.loading = false;
      status.loadedAt = Date.now();
      emit('sat:bank-loaded');
      return status;
    }).catch(err => {
      status.loading = false;
      status.error = err.message || String(err);
      promise = null;
      emit('sat:bank-error');
      throw err;
    });
    return promise;
  };

  window.clearFullBankCache = async function clearFullBankCache(){
    try{
      if(dbPromise){ const db=await dbPromise; db.close(); }
    }catch(_){ /* 即使数据库未成功打开也继续删除 */ }
    dbPromise=null;
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){ resolve(); return; }
      const req=indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess=()=>{ status.cacheStored=false; status.cacheHit=false; resolve(); };
      req.onerror=()=>reject(req.error||new Error('题库缓存删除失败'));
      req.onblocked=()=>reject(new Error('题库缓存正在使用，请刷新页面后重试'));
    });
  };

  const start = () => {
    if('requestIdleCallback' in window){
      requestIdleCallback(() => window.ensureFullBank().catch(() => {}), {timeout:3000});
    }else{
      setTimeout(() => window.ensureFullBank().catch(() => {}), 1200);
    }
  };
  if(document.readyState === 'complete') start();
  else window.addEventListener('load', start, {once:true});
})();
