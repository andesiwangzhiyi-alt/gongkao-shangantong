# -*- coding: utf-8 -*-
"""上岸通 v2.1 题库质量验收：清洗、精确去重、多来源-题号绑定、manifest。"""
import glob, json, os, re, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []

def check(name, ok, detail=''):
    print(f'[{"PASS" if ok else "FAIL"}] {name} {detail}')
    if not ok:
        FAIL.append(name)

def load_concat(paths):
    out = []
    for path in paths:
        with open(path, encoding='utf-8', errors='replace') as f:
            for line in f.read().split('\n'):
                m = re.match(r'^QUESTION_BANK\["([^"]+)"\] = QUESTION_BANK\["[^"]+"\]\.concat\((\[.*\])\);\s*$', line)
                if not m:
                    continue
                rows = json.loads(m.group(2))
                for q in rows:
                    q['_mod'] = m.group(1)
                    q['_file'] = path
                    out.append(q)
    return out

base = [os.path.join(ROOT, 'js', f) for f in ['questions4.js','questions5.js','questions7.js','questions8.js']]
chunks6 = sorted(glob.glob(os.path.join(ROOT, 'js', 'bank', 'questions6_*.js')))
chunks9 = sorted(glob.glob(os.path.join(ROOT, 'js', 'bank', 'questions9_*.js')))
qs = load_concat(base + chunks6 + chunks9)
check('重建题库总数=58978（不含90原创）', len(qs) == 58978, str(len(qs)))

# 脏数据清零
analysis = '\n'.join(str(q.get('analysis','')) for q in qs)
check('解析无“视频解析”残留', '视频解析' not in analysis)
check('解析无“来源…第N题笔记”残留', not re.search(r'来源20\d{2}.{0,100}第\d+题笔记', analysis))
check('解析不以“第N题笔记”结尾', not any(re.search(r'第\d+题笔记\s*$', str(q.get('analysis',''))) for q in qs))
check('材料无冗余引导前缀', not any(re.match(r'^\s*材料根据所给材料', str(q.get('mat',''))) for q in qs))

# 精确去重：题干+选项集+图片指纹，不允许重复

def nstem(q):
    stem = str(q.get('stem',''))
    imgs = q.get('images') or []
    def repl(m):
        i = int(m.group(1)); return '[IMG:'+str(imgs[i] if i < len(imgs) else i)+']'
    stem = re.sub(r'\[图(\d+)\]', repl, stem)
    stem = re.sub(r'<[^>]+>', '', stem)
    stem = re.sub(r'[\s\u3000　，。；：、！？（）()"“”《》·—-]+', '', stem)
    return stem
keys = [(nstem(q), tuple(sorted(map(str, q.get('options',[]))))) for q in qs]
check('精确重复题=0', len(keys) == len(set(keys)), f'重复 {len(keys)-len(set(keys))}')

# 来源完整与题号绑定
all_sources = []
for q in qs:
    srcs = [q.get('src')] + list(q.get('srcs') or [])
    srcs = [s for s in srcs if isinstance(s, dict) and s.get('name')]
    all_sources.extend(srcs)
check('每题至少一个结构化来源', all(isinstance(q.get('src'), dict) and q['src'].get('name') for q in qs))
numbered_sources = [s for s in all_sources if s.get('exam') not in ('精选','原创')]
check('真题/模考每个来源均绑定原卷题号', all(s.get('num') is not None for s in numbered_sources), f'缺题号 {sum(s.get("num") is None for s in numbered_sources)}')
multi = [q for q in qs if q.get('srcs')]
check('多来源题数量充足', len(multi) >= 37000, str(len(multi)))
check('同题来源-题号对无重复', all(len({(s.get('name'),s.get('num')) for s in [q['src']]+q.get('srcs',[])}) == 1+len(q.get('srcs',[])) for q in qs))

# 选调来源已补全
xd = [q for q in qs if str(q.get('id','')).startswith('xd')]
check('选调真题已纳入清洗重建', len(xd) == 6425, str(len(xd)))
check('选调来源年份/地区已提取', sum(bool(q['src'].get('year')) for q in xd) >= 6300 and sum(bool(q['src'].get('province')) for q in xd) >= 6300)

# manifest 与文件一致
for prefix, files, manifest in [('questions6', chunks6, 'questions6-manifest.json'), ('questions9', chunks9, 'questions9-manifest.json')]:
    m = json.load(open(os.path.join(ROOT,'js','bank',manifest), encoding='utf-8'))
    n = len(load_concat(files))
    check(f'{prefix} manifest题数一致', m['total'] == n, f'{m["total"]}/{n}')
    check(f'{prefix} manifest分片数一致', len(m['chunks']) == len(files), f"{len(m['chunks'])}/{len(files)}")
    check(f'{prefix} manifest含内容指纹', m.get('version') == 4 and bool(re.fullmatch(r'[0-9a-f]{16}', m.get('build',''))), str({k:m.get(k) for k in ('version','build')}))

print(f'==== v2.1质量验收：通过 {20-len(FAIL)}/20，失败 {FAIL or "无"} ====')
raise SystemExit(1 if FAIL else 0)
