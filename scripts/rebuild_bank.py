# -*- coding: utf-8 -*-
"""
上岸通题库重建管线 v2（可复用）
① 清洗垃圾词（来源页脚/视频解析/材料冗余前缀）
② 补全结构化 src（省考真题 tag→src；模考 province 从 name 提取；xc 开源题补 src）
③ 去重：题干归一化+图 URL 纳入键；选项集一致才合并；多来源聚合到 srcs
④ 重写 questions4/5/7.js 与 js/bank/questions6_*.js（questions/2/3 原创不动）
用法：
  python scripts/rebuild_bank.py --dry-run
  python scripts/rebuild_bank.py
"""
import re
import json
import glob
import os
import sys
import hashlib
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = '--dry-run' in sys.argv

# ---------- 读取 ----------

def read_bank_files():
    """读取全部题库文件，返回 (items, originals)"""
    items = []
    originals = []
    # 1) 对象式：const QUESTION_BANK = { ... };（原创题不参与重建，容错统计即可）
    for f in ['js/questions.js']:
        t = open(os.path.join(ROOT, f), encoding='utf-8', errors='replace').read()
        try:
            obj_txt = t[t.index('const QUESTION_BANK'):]
            obj_txt = obj_txt[obj_txt.index('{'): obj_txt.rindex('};') + 2]
            obj = json.loads(obj_txt)
        except Exception:
            # 键名可能无引号：给 { 或 , 后的裸键加引号后重试
            try:
                obj_txt = t[t.index('const QUESTION_BANK'):]
                obj_txt = obj_txt[obj_txt.index('{'): obj_txt.rindex('};') + 2]
                obj_txt = re.sub(r'([{,]\s*)([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)(\s*:)', r'\1"\2"\3', obj_txt)
                obj = json.loads(obj_txt)
            except Exception:
                obj = {}
        if obj:
            for mod, lst in obj.items():
                if isinstance(lst, list):
                    for q in lst:
                        q['mod'] = mod
                        q['_is_original'] = True
                        originals.append(q)
        else:
            # 容错统计：数题目对象 id 数
            n = len(re.findall(r'\{id:"', t)) + len(re.findall(r'\{id:\'', t))
            print(f'{f} 对象式解析失败，按匹配统计约 {n} 题')
    # 2) 直接赋值 + concat 追加（逐行）
    for f in ['js/questions2.js', 'js/questions3.js', 'js/questions4.js',
              'js/questions5.js', 'js/questions7.js', 'js/questions8.js'] + sorted(glob.glob(os.path.join(ROOT, 'js/bank/questions6_*.js'))) + sorted(glob.glob(os.path.join(ROOT, 'js/bank/questions9_*.js'))):
        path = os.path.join(ROOT, f) if not os.path.isabs(f) else f
        base = os.path.basename(path)
        t = open(path, encoding='utf-8', errors='replace').read()
        for line in t.split('\n'):
            m1 = re.match(r'^QUESTION_BANK\["([^"]+)"\] = QUESTION_BANK\["[^"]+"\]\.concat\((\[.*\])\);\s*$', line)
            m2 = re.match(r'^QUESTION_BANK\["([^"]+)"\] = (\[.*?\]);\s*$', line)
            m = m1 or m2
            if not m:
                continue
            mod = m.group(1)
            try:
                lst = json.loads(m.group(2))
            except Exception as e:
                print(f'{base} 段{mod} 解析失败: {e}')
                continue
            for q in lst:
                q['mod'] = mod
                q['_file'] = path
                if base == 'questions2.js' or base == 'questions3.js':
                    q['_is_original'] = True
                    originals.append(q)
                else:
                    # xc 开源题：参与去重，补 src
                    if base == 'questions4.js' and not isinstance(q.get('src'), dict):
                        q['src'] = {'year': '', 'exam': '精选', 'province': '', 'category': '开源题库', 'season': '', 'name': '开源题库精选（xingce-practice）'}
                    items.append(q)
    return items, originals

# ---------- 清洗 ----------

def clean_analysis(an):
    an = str(an)
    # 0. 通用尾部页脚：考点…来源…第N题笔记（包括“模拟卷4-四川”等非20XX来源）
    an = re.sub(r'\n[^\n]{0,240}来源[^\n]{0,180}第\d+题笔记\s*$', '', an)
    # 1. 尾部爬虫页脚：最后一个"来源20XX"距末尾 <150 字则截断
    pos = an.rfind('来源20')
    if pos >= 0 and len(an) - pos < 150:
        an = an[:pos].rstrip(' \n')
    # 1b. 尾部直接以"第N题笔记"结尾的残留
    an = re.sub(r'\s*第\d+题笔记\s*$', '', an)
    # 2. 删除"（来源：20XX...）"行（a2 阶段加的冗余标签行）
    an = re.sub(r'\n?[（(]来源[：:]\s*20\d\d[^）)]*[）)]', '', an)
    an = re.sub(r'\n?来源[：:]\s*20\d\d[^\n]*', '', an)
    # 3. 视频解析字样
    an = an.replace('视频解析', '')
    # 4. 压缩多余空行
    an = re.sub(r'\n{3,}', '\n\n', an).strip()
    return an

def clean_mat(mt):
    mt = str(mt).strip()
    mt = mt.replace('复制高亮', '').strip()
    mt = re.sub(r'^材料[ \u3000]{2,}', '', mt)
    if mt.startswith('材料根据所给材料，回答下列问题：'):
        mt = mt[len('材料根据所给材料，回答下列问题：'):].lstrip('\n')
    # 容忍前面有空白/换行的变体
    mt = re.sub(r'^\s*材料根据所给材料，?(?:回答下列问题)?[：:]?\s*', '', mt)
    return mt.strip()

# ---------- 来源构建 ----------

def build_src_shengkao(tag):
    m = re.match(r'^(.+?)(\d{4})$', str(tag or '').strip())
    if not m:
        return None
    province, year = m.group(1), m.group(2)
    if province.endswith('省') or province.endswith('市'):
        p2 = province
    else:
        p2 = province + '省'
    name = f'{year}年{p2}公务员录用考试《行测》题（网友回忆版）'
    return {'year': year, 'exam': '省考', 'province': province, 'category': '', 'season': '', 'name': name}

def extract_province_from_name(name, exam):
    name = name or ''
    m = re.search(r'[（(]([^（()）]+?卷)[）)]', name)
    if m:
        return m.group(1)[:-1]
    # 真题名称通常含“广东省2021年度…”“北京市2023年…”
    m = re.search(r'(北京|天津|上海|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|内蒙古|广西|西藏|宁夏|新疆)(?:省|市|自治区)?', name)
    if m:
        return m.group(1)
    return '通用' if exam == '省考模考' else ''

# ---------- 去重 ----------

def norm_key(q):
    """题干归一化 + 图片URL纳入：图不同则键不同"""
    stem = q.get('stem', '') or ''
    images = q.get('images') or []
    # 替换 [图N] 为图URL指纹
    def repl(m):
        idx = int(m.group(1))
        url = images[idx] if idx < len(images) else f'?{idx}'
        return f'[IMG:{url[:40]}]'
    s = re.sub(r'\[图(\d+)\]', repl, stem)
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'[\s\u3000　]+', '', s)
    s = re.sub(r'[，。；：、！？（）()""''《》、·—-]', '', s)
    return s.strip()

def options_tuple(q):
    return tuple(sorted(str(o) for o in q.get('options', [])))

def quality(q):
    sc = 0
    s = q.get('src') or {}
    exam = s.get('exam', '') if isinstance(s, dict) else ''
    if isinstance(s, dict) and s.get('name'): sc += 100
    if exam == '国考': sc += 60
    elif exam == '省考': sc += 50
    elif exam == '精选': sc += 10
    elif exam: sc += 20
    if q.get('analysis'): sc += min(len(q['analysis']) // 100, 20)
    if q.get('images'): sc += 3
    if q.get('opt_images'): sc += 2
    return sc

# ---------- 主流程 ----------

def main():
    print('读取题库...')
    all_items, originals = read_bank_files()
    print(f'参与重建题数: {len(all_items)}  原创(不动): {len(originals)}')

    # 清洗：先从旧解析页脚提取原卷题号，再删除页脚
    cleaned = 0
    for q in all_items:
        an0 = str(q.get('analysis', ''))
        if q.get('num') is None:
            nums = re.findall(r'第(\d+)题', an0[-300:])
            if nums:
                q['num'] = int(nums[-1])
        an1 = clean_analysis(an0)
        mt1 = clean_mat(q.get('mat', ''))
        if an1 != an0 or mt1 != str(q.get('mat', '')):
            cleaned += 1
        q['analysis'] = an1
        if q.get('mat'):
            q['mat'] = mt1
    print(f'清洗变动题目: {cleaned}')

    # 来源补全
    src_fixed = 0
    for q in all_items:
        if not isinstance(q.get('src'), dict):
            ns = build_src_shengkao(q.get('tag'))
            if ns:
                q['src'] = ns
                src_fixed += 1
            else:
                q['src'] = {}
        else:
            s = q['src']
            if not s.get('province'):
                province = extract_province_from_name(s.get('name'), s.get('exam',''))
                if province:
                    s['province'] = province
                    src_fixed += 1
            if not s.get('year'):
                ym = re.search(r'(20\d{2})', s.get('name',''))
                if ym:
                    s['year'] = ym.group(1)
                    src_fixed += 1
            # category 带"卷"（如 安徽卷）→ 提取省份
            if not s.get('province') and s.get('category','').endswith('卷'):
                s['province'] = s['category'][:-1]
                src_fixed += 1
    print(f'来源补全/省份提取: {src_fixed}')

    # 去重
    groups = defaultdict(list)
    for q in all_items:
        key = norm_key(q)
        groups[key].append(q)

    keep = []
    removed = 0
    multi_src = 0
    src_count_dist = Counter()
    def sources_of(q):
        """返回题目的全部来源；每个来源都绑定对应原卷题号。"""
        out = []
        primary = q.get('src') or {}
        if isinstance(primary, dict) and primary.get('name'):
            s = dict(primary)
            if s.get('num') is None and q.get('num') is not None:
                s['num'] = q.get('num')
            out.append(s)
        for old in q.get('srcs') or []:
            if isinstance(old, dict) and old.get('name'):
                out.append(dict(old))
        return out

    def normalize_sources(q):
        seen = set()
        out = []
        for s in sources_of(q):
            key = (s.get('name',''), s.get('num'))
            if key not in seen:
                seen.add(key)
                out.append(s)
        if out:
            q['src'] = out[0]
            q['num'] = out[0].get('num', q.get('num'))
            if len(out) > 1:
                q['srcs'] = out[1:]
            else:
                q.pop('srcs', None)
        return q

    for key, members in groups.items():
        if len(members) == 1:
            keep.append(normalize_sources(members[0]))
            continue
        by_opts = defaultdict(list)
        for q in members:
            by_opts[options_tuple(q)].append(q)
        for opt_key, sub in by_opts.items():
            if len(sub) == 1:
                keep.append(normalize_sources(sub[0]))
                continue
            main = max(sub, key=quality)
            # 主记录的来源优先，其余记录与既有 srcs 全部并入；按“来源名+原卷题号”去重
            candidates = sources_of(main)
            for q in sub:
                if q is not main:
                    candidates.extend(sources_of(q))
            srcs = []
            seen_pairs = set()
            for sm in candidates:
                pair = (sm.get('name',''), sm.get('num'))
                if pair[0] and pair not in seen_pairs:
                    seen_pairs.add(pair)
                    srcs.append(sm)
            removed += len(sub) - 1
            if srcs:
                main['src'] = srcs[0]
                main['num'] = srcs[0].get('num', main.get('num'))
                if len(srcs) > 1:
                    main['srcs'] = srcs[1:]
                    multi_src += 1
                    src_count_dist[len(srcs)] += 1
                else:
                    main.pop('srcs', None)
            keep.append(main)

    print(f'去重后保留: {len(keep)}  删除: {removed}  多来源题: {multi_src}')
    top_src = src_count_dist.most_common(8)
    print('多来源数分布:', top_src)

    # 分组输出
    out_map = defaultdict(list)
    for q in keep:
        out_map[q['_file']].append(q)
    print('\n输出计划:')
    for f, qs in sorted(out_map.items()):
        print(f'  {os.path.relpath(f, ROOT).replace(chr(92), "/")}: {len(qs)} 题')

    if DRY:
        print('\n[DRY-RUN] 未写文件')
        return

    # ---------- 写文件 ----------
    def dump_concat(path, items, header=None):
        by_mod = defaultdict(list)
        for q in items:
            clean_q = {k: v for k, v in q.items() if not k.startswith('_')}
            by_mod[q['mod']].append(clean_q)
        lines = []
        for mod in ['常识判断', '言语理解', '数量关系', '判断推理', '资料分析', '政治理论']:
            if mod in by_mod:
                lines.append(f'QUESTION_BANK["{mod}"] = QUESTION_BANK["{mod}"].concat({json.dumps(by_mod[mod], ensure_ascii=False)});')
        with open(path, 'w', encoding='utf-8') as f:
            if header:
                f.write(header + '\n')
            f.write('\n'.join(lines) + '\n')

    headers = {
        'js/questions4.js': '/* ============ 上岸通 · 题库扩充（来自 xingce-practice 开源题库，已清洗去重） ============ */',
        'js/questions5.js': '/* ============ 上岸通 · 国考真题题库（2012-2026，已清洗去重+多来源标注） ============ */',
        'js/questions7.js': '/* ============ 上岸通 · 省考真题题库（已清洗去重+来源结构化） ============ */',
        'js/questions8.js': '/* ============ 上岸通 · 选调真题题库（已清洗去重+来源结构化） ============ */',
    }
    for f, qs in out_map.items():
        rel = os.path.relpath(f, ROOT).replace('\\', '/')
        if rel in headers:
            dump_concat(f, qs, headers.get(rel))
            print(f'已写 {rel}')
        elif rel.startswith('js/bank/'):
            dump_concat(f, qs)
            print(f'已写 {rel}')

    total = sum(len(qs) for qs in out_map.values())
    print(f'\n最终题库总数(不含原创): {total}  含原创: {total + len(originals)}')

    # ---------- 清理不再使用的分片文件 ----------
    kept_files = {os.path.abspath(f) for f in out_map.keys()}
    removed_files = 0
    for pat in ['js/bank/questions6_*.js', 'js/bank/questions9_*.js']:
        for fp in glob.glob(os.path.join(ROOT, pat)):
            if os.path.abspath(fp) not in kept_files:
                os.remove(fp)
                removed_files += 1
                print(f'清理分片: {os.path.relpath(fp, ROOT)}')
    print(f'清理分片数: {removed_files}')

    # ---------- 重算分片 manifest ----------
    def write_manifest(pat, out_name):
        files = sorted(glob.glob(os.path.join(ROOT, pat)))
        chunks = []
        tot = 0
        digest = hashlib.sha256()
        for fp in files:
            # 统计该分片题数与模块，同时生成内容版本指纹供前端缓存失效
            cnt = 0
            mods = set()
            raw = open(fp, 'rb').read()
            digest.update(raw)
            t = raw.decode('utf-8')
            for line in t.split('\n'):
                m = re.match(r'^QUESTION_BANK\["([^"]+)"\] = QUESTION_BANK\["[^"]+"\]\.concat\((\[.*\])\);\s*$', line)
                if m:
                    mods.add(m.group(1))
                    try:
                        cnt += len(json.loads(m.group(2)))
                    except Exception:
                        pass
            tot += cnt
            chunks.append({'file': os.path.relpath(fp, ROOT).replace('\\', '/'), 'module': '、'.join(sorted(mods)), 'count': cnt, 'bytes': os.path.getsize(fp)})
        man = {'version': 4, 'build': digest.hexdigest()[:16], 'total': tot, 'chunks': chunks}
        with open(os.path.join(ROOT, f'js/bank/{out_name}'), 'w', encoding='utf-8') as f:
            json.dump(man, f, ensure_ascii=False, indent=1)
        print(f'manifest 已写 {out_name}: total={tot} chunks={len(chunks)}')

    write_manifest('js/bank/questions6_*.js', 'questions6-manifest.json')
    write_manifest('js/bank/questions9_*.js', 'questions9-manifest.json')

if __name__ == '__main__':
    main()