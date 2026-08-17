# -*- coding: utf-8 -*-
"""把超大 questions6.js 按题数拆成 GitHub 可发布的小分片。"""
import json
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'js', 'questions6.js')
OUT = os.path.join(ROOT, 'js', 'bank')
CHUNK_SIZE = 4000

if not os.path.exists(SRC):
    raise SystemExit(f'找不到源文件: {SRC}')
if os.path.exists(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT, exist_ok=True)

manifest = []
total = 0
part = 0
max_size = 0
rx = re.compile(r'^QUESTION_BANK\["([^"]+)"\]\s*=\s*QUESTION_BANK\["[^"]+"\]\.concat\((\[.*\])\);\s*$')

with open(SRC, encoding='utf-8') as f:
    for line_no, line in enumerate(f, 1):
        if not line.startswith('QUESTION_BANK['):
            continue
        m = rx.match(line.rstrip('\r\n'))
        if not m:
            raise ValueError(f'第 {line_no} 行无法识别')
        mod = m.group(1)
        questions = json.loads(m.group(2))
        print(f'{mod}: {len(questions)} 题')
        for start in range(0, len(questions), CHUNK_SIZE):
            part += 1
            batch = questions[start:start + CHUNK_SIZE]
            name = f'questions6_{part:03d}.js'
            path = os.path.join(OUT, name)
            prefix = '/* 上岸通2.0 模考题库懒加载分片：%s %d-%d */\n' % (mod, start + 1, start + len(batch))
            js = prefix + 'QUESTION_BANK[%s] = QUESTION_BANK[%s].concat(%s);\n' % (
                json.dumps(mod, ensure_ascii=False),
                json.dumps(mod, ensure_ascii=False),
                json.dumps(batch, ensure_ascii=False, separators=(',', ':')),
            )
            with open(path, 'w', encoding='utf-8', newline='\n') as out:
                out.write(js)
            size = os.path.getsize(path)
            max_size = max(max_size, size)
            manifest.append({'file': f'js/bank/{name}', 'module': mod, 'count': len(batch), 'bytes': size})
            total += len(batch)
        del questions

manifest_path = os.path.join(OUT, 'questions6-manifest.json')
with open(manifest_path, 'w', encoding='utf-8', newline='\n') as f:
    json.dump({'version': 2, 'total': total, 'chunkSize': CHUNK_SIZE, 'chunks': manifest}, f, ensure_ascii=False, indent=2)
    f.write('\n')

print(f'完成：{total} 题，{len(manifest)} 分片，最大 {max_size/1024/1024:.2f} MB')
if total != 140005:
    raise SystemExit(f'题数异常：期望 140005，实际 {total}')
if max_size >= 95 * 1024 * 1024:
    raise SystemExit('存在接近 GitHub 100MB 上限的分片，请减小 CHUNK_SIZE')
