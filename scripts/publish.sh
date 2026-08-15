#!/usr/bin/env bash
# ============================================================
# 上岸通 — GitHub 发布：建仓 -> push -> topics -> release -> 验证
# 依赖：GCM 凭据（git credential fill）+ 系统代理
# ============================================================
set -uo pipefail
cd "$(dirname "$0")/.."

REPO="gongkao-shangantong"
API="https://api.github.com"

# ---- 1. 提取 token（GCM） ----
TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill 2>/dev/null | sed -n 's/^password=//p')
[ -n "$TOKEN" ] || { echo "❌ 无法从 GCM 提取 token"; exit 1; }
GH_USER=$(curl -sS -H "Authorization: token $TOKEN" "$API/user" | python -c "import sys,json;print(json.load(sys.stdin)['login'])" 2>/dev/null)
echo "账号: ${GH_USER}"

# ---- 2. 建仓 ----
python - <<'PYEOF'
import json
d = {
    "name": "gongkao-shangantong",
    "description": "上岸通 — 考公学习神器：行测刷题(90+原创题带解析)、每日一练、模拟考试、错题本(艾宾浩斯复习)、申论素材库、打卡追踪、番茄专注钟。纯前端零依赖离线可用，数据本地存储。",
    "homepage": "",
    "private": False, "has_issues": True, "has_wiki": False
}
open('_api_req.json', 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False))
PYEOF
RESP=$(curl -sS -X POST -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json; charset=utf-8" --data @_api_req.json "$API/user/repos")
echo "$RESP" | python -c "import sys,json;d=json.load(sys.stdin);print('建仓:', d.get('html_url') or d.get('message'))" || { echo "建仓失败: $RESP"; exit 1; }
rm -f _api_req.json

# ---- 3. 添加 remote 并 push ----
git remote remove origin 2>/dev/null
git remote add origin "https://github.com/${GH_USER}/${REPO}.git"
echo "推送代码..."
PUSH_OUT=$(git push -u origin main 2>&1)
echo "$PUSH_OUT" | tail -3
echo "$PUSH_OUT" | grep -qE "rejected|error|fatal|Failed to connect" && { echo "❌ push 失败"; exit 1; }
echo "✅ 代码已推送"

# ---- 4. topics ----
python - <<'PYEOF'
import json
open('_topics.json', 'w', encoding='utf-8').write(json.dumps({"names":["gongkao","civil-service-exam","xingce","shenlun","exam-prep","study-tool","pwa","offline-first"]}))
PYEOF
curl -sS -X PUT -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" --data @_topics.json "$API/repos/${GH_USER}/${REPO}/topics" | python -c "import sys,json;d=json.load(sys.stdin);print('topics:', len(d.get('names',[])), '个')"
rm -f _topics.json

# ---- 5. release ----
python - <<'PYEOF'
import json
d = {"tag_name": "v1.0", "name": "v1.0 · 上岸通", "body": "首个正式版本：\n- 行测题库 90 题（常识/言语/数量/判断/资料 5 大模块，原创+详解）\n- 每日一练 / 模拟考试（自定义题量时长）\n- 错题本 + 艾宾浩斯遗忘曲线复习提醒\n- 申论素材库（金句/热点/案例/框架/模板）\n- 打卡热力图 / 学习统计 / 番茄专注钟\n- 数据导出导入备份", "draft": False}
open('_rel.json', 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False))
PYEOF
curl -sS -X POST -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" --data @_rel.json "$API/repos/${GH_USER}/${REPO}/releases" | python -c "import sys,json;d=json.load(sys.stdin);print('release:', d.get('html_url') or d.get('message'))"
rm -f _rel.json

# ---- 6. 验证 ----
echo "--- 验证 ---"
curl -sS -H "Authorization: token $TOKEN" "$API/repos/${GH_USER}/${REPO}" | python -c "import sys,json;d=json.load(sys.stdin);print('仓库:', d['full_name'], '| 星标:', d['stargazers_count'], '| 默认分支:', d['default_branch'])"
git ls-remote "https://github.com/${GH_USER}/${REPO}.git" HEAD
echo "✅ 发布完成: https://github.com/${GH_USER}/${REPO}"
