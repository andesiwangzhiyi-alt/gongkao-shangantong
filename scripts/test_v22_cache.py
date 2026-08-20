# -*- coding: utf-8 -*-
"""上岸通 v2.2 持久题库缓存验收：首次网络加载→后台写缓存→刷新命中缓存。"""
import os
import time
from playwright.sync_api import sync_playwright

URL=os.environ.get('SAT_TEST_URL', 'http://127.0.0.1:8124/index.html?v=cache-v22')
CHROME=r'C:\Program Files\Google\Chrome\Application\chrome.exe'
fails=[]
def check(name, ok, detail=''):
    print(f'[{"PASS" if ok else "FAIL"}] {name} {detail}')
    if not ok: fails.append(name)

def wait_loaded(page, timeout=180):
    end=time.time()+timeout
    while time.time()<end:
        st=page.evaluate('() => window.LAZY_BANK_STATUS')
        if st and (st.get('loaded') or st.get('error')): return st
        time.sleep(.2)
    raise TimeoutError('题库加载超时')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROME, headless=True)
    context=browser.new_context()
    page=context.new_page()
    errors=[]; page.on('pageerror',lambda e: errors.append(str(e)))
    flaky={'requests':0}
    def fail_once(route):
        flaky['requests']+=1
        route.abort('failed') if flaky['requests']==1 else route.continue_()
    page.route('**/js/bank/questions6_001.js', fail_once)
    page.goto(URL,wait_until='domcontentloaded',timeout=60000)
    page.evaluate('() => ensureFullBank()')
    first=wait_loaded(page)
    first_ms=first['loadedAt']-first['startedAt']
    check('首次从网络分片加载',first['source']=='network',str(first))
    check('瞬时分片失败自动重试成功',first.get('retries')==1 and flaky['requests']==2,str({'status':first.get('retries'),'requests':flaky['requests']}))
    check('普通设备采用6路并发',first.get('parallel')==6,str(first.get('parallel')))
    check('首次完整题量59068',page.evaluate('() => allQuestions().length')==59068)
    check('manifest带内容指纹',bool(first.get('signature')) and 'q6:' in first['signature'])

    end=time.time()+180
    while time.time()<end:
        st=page.evaluate('() => LAZY_BANK_STATUS')
        if st.get('cacheStored') or st.get('cacheError'): break
        time.sleep(.25)
    stored=page.evaluate('() => LAZY_BANK_STATUS')
    check('首次加载后缓存写入成功',stored.get('cacheStored'),str(stored.get('cacheError')))
    meta=page.evaluate('''() => new Promise((resolve,reject)=>{
      const r=indexedDB.open('shangantong-bank',1);
      r.onsuccess=()=>{const db=r.result,q=db.transaction('parts').objectStore('parts').get('meta');q.onsuccess=()=>{const v=q.result;db.close();resolve(v)};q.onerror=()=>{db.close();reject(q.error)}};
      r.onerror=()=>reject(r.error);
    })''')
    check('缓存元数据题量正确',meta and meta.get('total')==45113,str(meta and {'parts':len(meta.get('parts',[])), 'total':meta.get('total')}))

    page.reload(wait_until='domcontentloaded',timeout=60000)
    page.evaluate('() => ensureFullBank()')
    second=wait_loaded(page)
    second_ms=second['loadedAt']-second['startedAt']
    check('刷新命中IndexedDB缓存',second.get('cacheHit') and second.get('source')=='indexeddb',str(second))
    check('缓存恢复题量无重复',page.evaluate('() => allQuestions().length')==59068)
    check('缓存恢复分片进度完成',second['loadedChunks']==second['totalChunks']==52,str(second))
    check('缓存恢复速度快于首次',second_ms < first_ms,f'首次{first_ms}ms / 缓存{second_ms}ms')
    check('加载进度组件存在',page.locator('#bankProgress').count()==1)

    # 模拟部署新题库：缓存签名过期时必须自动回退网络，且不能重复追加。
    page.evaluate('''() => new Promise((resolve,reject)=>{
      const r=indexedDB.open('shangantong-bank',1);
      r.onsuccess=()=>{const db=r.result,tx=db.transaction('parts','readwrite'),s=tx.objectStore('parts'),g=s.get('meta');
        g.onsuccess=()=>{const m=g.result;m.signature='stale-signature';s.put(m)};
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)};
      r.onerror=()=>reject(r.error);
    })''')
    page.reload(wait_until='domcontentloaded',timeout=60000)
    page.evaluate('() => ensureFullBank()')
    stale=wait_loaded(page)
    check('版本变化自动回退网络',stale.get('source')=='network' and not stale.get('cacheHit'),str(stale))
    check('缓存失效回退无重复题',page.evaluate('() => allQuestions().length')==59068)

    end=time.time()+180
    while time.time()<end:
        s=page.evaluate('() => LAZY_BANK_STATUS')
        if s.get('cacheStored') or s.get('cacheError'): break
        time.sleep(.25)
    page.evaluate("localStorage.setItem('__cache_clear_guard','keep')")
    page.evaluate('() => clearFullBankCache()')
    cleared=page.evaluate("() => indexedDB.databases().then(ds => !ds.some(d => d.name==='shangantong-bank'))")
    check('一键清理移除题库缓存',cleared)
    check('清理缓存不影响个人localStorage',page.evaluate("() => localStorage.getItem('__cache_clear_guard')==='keep'"))

    # 最后一批仍在途时清理：旧 load 必须取消、回滚且不能在清理后提交 loaded/持久化。
    held={}
    def hold_last_batch(route):
        held['route']=route
    page.route('**/js/bank/questions9_013.js', hold_last_batch)
    page.add_init_script('window.requestIdleCallback=()=>0')
    page.reload(wait_until='domcontentloaded',timeout=60000)
    page.evaluate('''() => {
      window.__raceEvents=[];
      addEventListener('sat:bank-loaded',()=>__raceEvents.push('loaded'));
      window.__raceLoad={settled:false,ok:null,error:null};
      ensureFullBank().then(()=>{__raceLoad.settled=true;__raceLoad.ok=true},e=>{
        __raceLoad.settled=true;__raceLoad.ok=false;__raceLoad.error=e?.message||String(e)
      });
    }''')
    end=time.time()+180
    while time.time()<end and 'route' not in held:
        page.wait_for_timeout(50)
    check('确定性进入最后一批在途窗口','route' in held)
    page.evaluate('''() => {
      window.__raceClear={settled:false,error:null};
      clearFullBankCache().then(()=>{__raceClear.settled=true},e=>{
        __raceClear.settled=true;__raceClear.error=e?.message||String(e)
      });
    }''')
    if 'route' in held: held['route'].continue_()
    page.unroute('**/js/bank/questions9_013.js', hold_last_batch)
    end=time.time()+180
    while time.time()<end:
        race=page.evaluate('() => ({load:__raceLoad,clear:__raceClear,status:{...LAZY_BANK_STATUS},events:[...__raceEvents]})')
        if race['load']['settled'] and race['clear']['settled']: break
        page.wait_for_timeout(50)
    check('清理取消旧load且不提交loaded',race['load']['settled'] and not race['load']['ok'] and not race['status']['loaded'] and 'loaded' not in race['events'],str(race))
    check('取消load已回滚尾批数据',page.evaluate('() => allQuestions().length')==13955)
    race_db_absent=page.evaluate("() => indexedDB.databases().then(ds => !ds.some(d => d.name==='shangantong-bank'))")
    check('取消load未在清理后持久化',race['clear']['settled'] and not race['clear']['error'] and not race['status']['cacheStored'] and race_db_absent,str(race))
    page.evaluate('() => ensureFullBank()')
    race_recovered=wait_loaded(page)
    check('清理取消后同页重试成功',race_recovered.get('loaded') and race_recovered.get('source')=='network' and page.evaluate('() => allQuestions().length')==59068,str(race_recovered))

    end=time.time()+180
    while time.time()<end:
        s=page.evaluate('() => LAZY_BANK_STATUS')
        if s.get('cacheStored') or s.get('cacheError'): break
        time.sleep(.25)
    check('restore取消回归前缓存已就绪',s.get('cacheStored'),str(s.get('cacheError')))

    # 在首个缓存 part 读取后立即 clear；取消不是缓存损坏，restore catch 不得调用 objectStore.clear()。
    page.add_init_script('''(() => {
      if(localStorage.getItem('__restore_cancel_test')!=='1') return;
      localStorage.removeItem('__restore_cancel_test');
      const originalGet=IDBObjectStore.prototype.get;
      const originalClear=IDBObjectStore.prototype.clear;
      window.__restoreRace={armed:true,triggered:false,clearSettled:false,clearError:null,idbClearCalls:0};
      IDBObjectStore.prototype.clear=function(...args){
        __restoreRace.idbClearCalls++;
        return originalClear.apply(this,args);
      };
      IDBObjectStore.prototype.get=function(key){
        const req=originalGet.call(this,key);
        if(__restoreRace.armed && key!=='meta'){
          __restoreRace.armed=false;
          queueMicrotask(()=>{
            __restoreRace.triggered=true;
            clearFullBankCache().then(()=>{__restoreRace.clearSettled=true},e=>{
              __restoreRace.clearSettled=true;__restoreRace.clearError=e?.message||String(e)
            });
          });
        }
        return req;
      };
    })()''')
    page.evaluate("localStorage.setItem('__restore_cancel_test','1')")
    page.reload(wait_until='domcontentloaded',timeout=60000)
    page.evaluate('''() => {
      window.__restoreLoad={settled:false,ok:null,error:null};
      ensureFullBank().then(()=>{__restoreLoad.settled=true;__restoreLoad.ok=true},e=>{
        __restoreLoad.settled=true;__restoreLoad.ok=false;__restoreLoad.error=e?.message||String(e)
      });
    }''')
    end=time.time()+180
    while time.time()<end:
        restore_race=page.evaluate('() => ({race:{...__restoreRace},load:{...__restoreLoad},status:{...LAZY_BANK_STATUS}})')
        if restore_race['load']['settled'] and restore_race['race']['clearSettled']: break
        page.wait_for_timeout(50)
    check('确定性进入restore取消窗口',restore_race['race']['triggered'],str(restore_race))
    restore_db_absent=page.evaluate("() => indexedDB.databases().then(ds => !ds.some(d => d.name==='shangantong-bank'))")
    check('restore取消不触发损坏缓存清理',not restore_race['load']['ok'] and not restore_race['race']['clearError'] and restore_race['race']['idbClearCalls']==0 and restore_db_absent,str(restore_race))

    # 永久分片失败时必须回滚本次已追加数据；网络恢复后同页重试可完整加载且不重复。
    page.route('**/js/bank/questions6_002.js', lambda route: route.abort('failed'))
    page.reload(wait_until='domcontentloaded',timeout=60000)
    page.evaluate('() => ensureFullBank().catch(() => null)')
    failed=wait_loaded(page)
    check('永久分片失败后回滚本批追加',not failed.get('loaded') and page.evaluate('() => allQuestions().length')==13955,str(failed))
    page.unroute('**/js/bank/questions6_002.js')
    page.evaluate('() => ensureFullBank()')
    recovered=wait_loaded(page)
    check('网络恢复后同页可重试成功',recovered.get('loaded') and recovered.get('source')=='network',str(recovered))
    check('失败重试后题量无重复',page.evaluate('() => allQuestions().length')==59068)
    check('无JS运行错误',not errors,str(errors[:3]))
    print(f'PERF first={first_ms}ms cached={second_ms}ms speedup={first_ms/max(second_ms,1):.1f}x')
    browser.close()

print(f'==== v2.2缓存验收：通过 {28-len(fails)}/28，失败 {fails or "无"} ====')
raise SystemExit(1 if fails else 0)
