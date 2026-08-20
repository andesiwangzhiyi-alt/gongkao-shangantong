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
    signature: null, retries: 0, parallel: 0
  };
  const loadedFiles = new Set();
  let promise = null;
  let dbPromise = null;
  let batchGeneration = 0;
  let persistTask = null;
  let clearTask = null;

  class BankLoadCancelled extends Error {
    constructor(message='题库加载已取消'){
      super(message);
      this.name = 'BankLoadCancelled';
    }
  }
  function assertGeneration(generation, message){
    if(generation !== batchGeneration) throw new BankLoadCancelled(message);
  }
  function isCancellation(err){
    return err instanceof BankLoadCancelled;
  }

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

  function loadScript(src, attempt=0){
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
      s.onerror = () => {
        s.remove();
        if(attempt < 2){
          status.retries++;
          emit('sat:bank-retry');
          setTimeout(()=>loadScript(src, attempt+1).then(resolve,reject), 500 * (2 ** attempt));
        }else{
          reject(new Error(`题库分片加载失败（已重试3次）：${src}`));
        }
      };
      document.head.appendChild(s);
    });
  }

  async function fetchManifests(generation){
    const [r1, r2] = await Promise.all([
      fetch('js/bank/questions6-manifest.json', {cache:'no-cache'}),
      fetch('js/bank/questions9-manifest.json', {cache:'no-cache'})
    ]);
    assertGeneration(generation);
    if(!r1.ok) throw new Error(`题库 q6 manifest HTTP ${r1.status}`);
    if(!r2.ok) throw new Error(`题库 q9 manifest HTTP ${r2.status}`);
    const [m1, m2] = await Promise.all([r1.json(), r2.json()]);
    assertGeneration(generation);
    if(!Array.isArray(m1.chunks)||!m1.chunks.length||!Array.isArray(m2.chunks)||!m2.chunks.length){
      throw new Error('题库 manifest 内容不完整');
    }
    const chunks = [...m1.chunks, ...m2.chunks];
    const total = (m1.total||0) + (m2.total||0);
    const fallback = m => (m.chunks||[]).map(x=>`${x.file}:${x.bytes}:${x.count}`).join(',');
    const signature = `q6:${m1.build||fallback(m1)}|q9:${m2.build||fallback(m2)}`;
    return {chunks, total, signature};
  }

  async function restoreCache(signature, total, totalChunks, generation){
    assertGeneration(generation, '题库缓存加载已取消');
    const meta = await idbGet(META_KEY);
    assertGeneration(generation, '题库缓存加载已取消');
    if(!meta || meta.signature !== signature || meta.total !== total || !Array.isArray(meta.parts)) return false;
    const expectedKeys = new Set();
    const restored = {};
    let count = 0;
    for(const p of meta.parts){
      if(!p || typeof p.key!=='string'||!p.mod||expectedKeys.has(p.key)||!Number.isInteger(p.count)||p.count<=0){
        throw new Error('题库缓存索引无效');
      }
      expectedKeys.add(p.key);
      const rec = await idbGet(p.key);
      assertGeneration(generation, '题库缓存加载已取消');
      if(!rec || rec.key!==p.key || rec.mod!==p.mod || !Array.isArray(rec.items) || rec.items.length !== p.count){
        throw new Error('题库缓存不完整');
      }
      (restored[p.mod] ||= []).push(...rec.items);
      count += rec.items.length;
      status.loadedChunks = Math.min(totalChunks, Math.floor(count / total * totalChunks));
      emit('sat:bank-progress');
    }
    if(expectedKeys.size !== meta.parts.length || count !== total) throw new Error(`题库缓存题量异常：${count}/${total}`);
    assertGeneration(generation, '题库缓存加载已取消');
    // 完整校验后一次性合并，避免恢复中途失败留下半套题库。
    for(const [mod, items] of Object.entries(restored)){
      if(!QUESTION_BANK[mod]) QUESTION_BANK[mod] = [];
      QUESTION_BANK[mod].push(...items);
    }
    status.loadedChunks = totalChunks;
    status.cacheHit = true;
    status.source = 'indexeddb';
    return true;
  }

  async function persistCache(signature, total, baseLengths, generation){
    try{
      assertGeneration(generation, '题库缓存写入已取消');
      await idbClear(); // meta 最后写入；中途失败不会留下“可用”缓存
      assertGeneration(generation, '题库缓存写入已取消');
      const parts = [];
      let saved = 0;
      for(const [mod, list] of Object.entries(QUESTION_BANK)){
        assertGeneration(generation, '题库缓存写入已取消');
        const delta = list.slice(baseLengths[mod] || 0);
        for(let i=0; i<delta.length; i+=CACHE_PART_SIZE){
          assertGeneration(generation, '题库缓存写入已取消');
          const items = delta.slice(i, i + CACHE_PART_SIZE);
          const key = `part:${signature}:${mod}:${i/CACHE_PART_SIZE}`;
          await idbPut({key, mod, items});
          assertGeneration(generation, '题库缓存写入已取消');
          parts.push({key, mod, count:items.length});
          saved += items.length;
        }
      }
      assertGeneration(generation, '题库缓存写入已取消');
      if(saved !== total) throw new Error(`缓存写入题量异常：${saved}/${total}`);
      await idbPut({key:META_KEY, signature, total, parts, savedAt:Date.now()});
      assertGeneration(generation, '题库缓存写入已取消');
      status.cacheStored = true;
      status.cacheError = null;
      emit('sat:bank-cache-ready');
      if(navigator.storage?.persist) navigator.storage.persist().catch(()=>{});
    }catch(err){
      if(isCancellation(err)) return;
      status.cacheError = err?.message || String(err);
      status.cacheStored = false;
      emit('sat:bank-cache-error');
    }
  }

  function preferredParallel(){
    const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    if(conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType||'')) return 2;
    if((navigator.deviceMemory||4) <= 2) return 3;
    return 6;
  }

  function rollbackTo(baseLengths, chunks){
    for(const [mod, list] of Object.entries(QUESTION_BANK)){
      const keep = baseLengths[mod];
      if(Number.isInteger(keep)) list.length = keep;
      else delete QUESTION_BANK[mod];
    }
    for(const chunk of chunks) loadedFiles.delete(chunk.file);
    status.loadedChunks = 0;
  }

  async function loadAll(generation){
    const {chunks, total, signature} = await fetchManifests(generation);
    assertGeneration(generation);
    status.totalChunks = chunks.length;
    status.totalQuestions = total;
    status.signature = signature;
    const baseLengths = Object.fromEntries(Object.entries(QUESTION_BANK).map(([m,a])=>[m,a.length]));

    try{
      if(await restoreCache(signature, total, chunks.length, generation)) return;
    }catch(err){
      if(isCancellation(err)) throw err;
      status.cacheError = err?.message || String(err);
      try{ await idbClear(); }catch(_){ /* 网络回退不受缓存清理失败影响 */ }
    }

    status.source = 'network';
    const parallel=preferredParallel();
    status.parallel=parallel;
    try{
      for(let i=0; i<chunks.length; i+=parallel){
        assertGeneration(generation);
        const results = await Promise.allSettled(
          chunks.slice(i,i+parallel).map(x=>loadScript(x.file))
        );
        assertGeneration(generation);
        const failed = results.find(result => result.status === 'rejected');
        if(failed) throw failed.reason;
        await new Promise(resolve=>setTimeout(resolve,0));
        assertGeneration(generation);
      }
    }catch(err){
      rollbackTo(baseLengths, chunks);
      throw err;
    }
    assertGeneration(generation);
    // 缓存写入在后台执行，不延迟题库就绪事件。
    persistTask = new Promise(resolve => {
      setTimeout(() => resolve(persistCache(signature, total, baseLengths, generation)), 0);
    });
  }

  window.ensureFullBank = function ensureFullBank(){
    if(status.loaded) return Promise.resolve(status);
    if(clearTask) return clearTask.then(() => window.ensureFullBank());
    if(promise) return promise;
    const generation = ++batchGeneration;
    status.loading = true;
    status.error = null;
    status.startedAt = status.startedAt || Date.now();
    emit('sat:bank-loading');
    promise = loadAll(generation).then(() => {
      assertGeneration(generation);
      status.loaded = true;
      status.loading = false;
      status.loadedAt = Date.now();
      emit('sat:bank-loaded');
      return status;
    }).catch(err => {
      status.loading = false;
      status.error = isCancellation(err) ? null : (err.message || String(err));
      promise = null;
      if(!isCancellation(err)) emit('sat:bank-error');
      throw err;
    });
    return promise;
  };

  window.clearFullBankCache = function clearFullBankCache(){
    if(clearTask) return clearTask;
    const activeLoad = promise;
    ++batchGeneration;
    clearTask = (async () => {
      if(activeLoad){
        try{ await activeLoad; }catch(_){ /* 取消或失败后仍继续删除 */ }
      }
      if(persistTask){
        try{ await persistTask; }catch(_){ /* 删除动作仍继续 */ }
        persistTask = null;
      }
      try{
        if(dbPromise){ const db=await dbPromise; db.close(); }
      }catch(_){ /* 即使数据库未成功打开也继续删除 */ }
      dbPromise=null;
      await new Promise((resolve,reject)=>{
        if(!('indexedDB' in window)){ resolve(); return; }
        const req=indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess=resolve;
        req.onerror=()=>reject(req.error||new Error('题库缓存删除失败'));
        req.onblocked=()=>reject(new Error('题库缓存正在使用，请刷新页面后重试'));
      });
      status.cacheStored=false;
      status.cacheHit=false;
      status.cacheError=null;
    })().finally(() => { clearTask = null; });
    return clearTask;
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
