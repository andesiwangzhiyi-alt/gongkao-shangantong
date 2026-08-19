# -*- coding: utf-8 -*-
"""上岸通 v2.2 持久题库缓存验收：首次网络加载→后台写缓存→刷新命中缓存。"""
import time
from playwright.sync_api import sync_playwright

URL='http://127.0.0.1:8124/index.html?v=cache-v22'
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
    check('无JS运行错误',not errors,str(errors[:3]))
    print(f'PERF first={first_ms}ms cached={second_ms}ms speedup={first_ms/max(second_ms,1):.1f}x')
    browser.close()

print(f'==== v2.2缓存验收：通过 {17-len(fails)}/17，失败 {fails or "无"} ====')
raise SystemExit(1 if fails else 0)
