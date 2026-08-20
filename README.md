# 致泽学堂 · 以学致知，以行泽民

> 公务员考试学习与成长平台：行测研习、申论书房、智能组卷、错题温习、能力画像与问泽学习助手。
>
> 当前版本：**v2.4.0** · 纯前端 · 学习数据保存在浏览器本地

![GitHub](https://img.shields.io/badge/license-MIT-green) ![Platform](https://img.shields.io/badge/platform-Web%2FMobile-lightgrey) ![Questions](https://img.shields.io/badge/questions-59%2C068-1c3f60)

## 在线使用

**https://andesiwangzhiyi-alt.github.io/gongkao-shangantong/**

首次进入会在后台加载完整题库；加载后写入 IndexedDB，后续访问可从本地缓存快速恢复。学习记录、错题、画像与题库缓存彼此独立，可单独清理题库缓存。

## 当前题库基线

共 **59,068 道去重题目**，精确重复题为 0；其中 **37,204 道题聚合了多个来源**，可显示年份、考试、地区/卷别和原卷题号。

| 模块 | 题量 |
|---|---:|
| 政治理论 | 2,077 |
| 常识判断 | 17,773 |
| 言语理解 | 14,282 |
| 数量关系 | 4,820 |
| 判断推理 | 11,477 |
| 资料分析 | 8,639 |

> 题库后续计划由独立规范题库「行测万卷」通过统一数据契约接入，本仓库不再长期维护多套并行转换逻辑。

## 主要功能

| 功能 | 说明 |
|---|---|
| 📝 **多方式刷题** | 六大模块、随机练习、每日一练、错题重练、检索结果单题直达 |
| 🔍 **全库检索** | 按题干、选项、解析、考点、来源、模块和正确率筛选，结果可练习或导出 |
| 🧩 **智能/自定义组卷** | 国考、省考联考、江苏 A、北京、上海、广东等模板；题量可调整 |
| 🖨️ **打印与 PDF** | 全真/练习双模式，支持材料图、题干图、选项图、答题卡、答案与解析 |
| 📥 **纸面答案回填** | 打印卷生成回填码；纸面作答后回填判分，成绩并入线上学习数据 |
| ⏱️ **在线模考** | 自定义题量与时长、自动交卷、成绩单与逐题回顾 |
| ❌ **错题与复习** | 答错自动收录；按 1/2/4/7/15 天安排复习，可标记掌握 |
| 📊 **能力画像** | 模块、考点、难度、来源和用时维度分析，生成薄弱点训练 |
| 📖 **申论积累** | 金句、热点、案例、框架、模板；支持搜索、收藏和自定义素材 |
| 🔥 **学习辅助** | 打卡热力图、连续学习、番茄钟、本地 JSON 备份/恢复 |
| ⚡ **题库缓存** | 分片并发加载、失败重试、版本指纹失效、IndexedDB 持久缓存 |
| ✦ **问泽入口** | 首页及每道题原始解析下方均可文字或语音提问；服务未接入时不发送数据、不伪造回答 |
| 🏞️ **书斋环境** | 八套淡墨背景、素宣与无背景；点击涟漪可关闭并尊重系统减少动态效果设置 |

## 快速开始

### 方式一：本地服务器（推荐）

```bash
python -m http.server 8080
```

浏览器打开：

```text
http://127.0.0.1:8080/
```

完整题库通过 manifest + JS 分片加载，因此不建议直接以 `file://` 打开 `index.html`。

### 方式二：GitHub Pages

Fork 仓库后，在 **Settings → Pages** 选择 `main` 分支即可部署。

## 目录结构

```text
gongkao-shangantong/
├── index.html                 # 应用入口
├── css/style.css              # 响应式样式与可访问性状态
├── js/
│   ├── app.js                 # 答题、组卷、画像、回填、打印等应用逻辑
│   ├── lazy-bank.js           # 题库分片加载、重试与 IndexedDB 缓存
│   ├── questions*.js          # 首屏基础题库与历史数据分片
│   ├── bank/                  # questions6/questions9 manifest 与 52 个分片
│   └── shenlun.js             # 申论素材
├── scripts/
│   ├── test_v01.py            # 全流程回归
│   ├── test_v21_quality.py    # 题库质量基线
│   ├── test_v21_ui.py         # 图片、来源、搜索、移动端验收
│   ├── test_v22_cache.py      # 缓存、失败回滚、重试与并发验收
│   ├── test_v23_regressions.py# 功能、安全与可访问性回归
│   ├── test_v24_zhize_ui.py   # 品牌壳、导航、偏好与移动端回归
│   └── test_v24_zhize_features.py # 问泽、一级页面与逐题入口回归
├── assets/backgrounds/        # 本地 WebP 淡墨背景资产
└── sketches/                  # 历史设计探索与融合原型
```

## 视觉/UI 设计记录

本地启动服务器后打开：

```text
http://127.0.0.1:8080/sketches/
```

设计阶段保留了三套独立方向与一套融合原型：

1. **墨蓝书院**：内容沉浸、可信、长期学习；
2. **清透效率台**：工具优先、高信息效率、适合承接行测万卷与高级组卷；
3. **暖阳成长**：移动优先、低压力、习惯养成。
4. **致泽融合版**：最终采用的品牌、导航、问泽、书斋与古风环境基线。

生产界面已在 v2.4.0 采用融合方向；草图仅作为设计过程记录。

## 数据与隐私

- 学习数据默认仅存于当前浏览器 `localStorage`；
- 完整题库缓存存于 IndexedDB，可从「我的书斋 → 题库与缓存」进入管理；
- 导入的自定义申论素材按纯文本渲染；
- 背景和涟漪偏好使用独立本地存储，不随学习备份导入或清空；
- 问泽服务未接入时不会发送问题；语音识别由浏览器提供，使用前会请求权限；
- 建议定期使用「我的书斋 → 数据管理 → 导出备份」。

## 验证

在仓库根目录启动本地服务器后，可运行：

```bash
python scripts/test_v21_quality.py
SAT_TEST_URL=http://127.0.0.1:8080/index.html python scripts/test_v22_cache.py
SAT_TEST_URL=http://127.0.0.1:8080/index.html python scripts/test_v21_ui.py
SAT_TEST_URL=http://127.0.0.1:8080/index.html python scripts/test_v2_acceptance.py
SAT_TEST_URL=http://127.0.0.1:8080/index.html python scripts/test_v23_regressions.py
SAT_TEST_URL=http://127.0.0.1:8080/index.html python scripts/test_v01.py
SAT_TEST_URL=http://127.0.0.1:8080/index.html python scripts/test_v24_zhize_ui.py
SAT_TEST_URL=http://127.0.0.1:8080/index.html python scripts/test_v24_zhize_features.py
SAT_TEST_URL=http://127.0.0.1:8080/index.html python scripts/test_review_blockers.py
SAT_TEST_URL=http://127.0.0.1:8080/index.html python scripts/verify_zhize_production.py
```

Windows 上 Playwright 测试使用系统 Chrome，避免浏览器二进制版本不匹配。

## 版权与许可

- 程序代码采用 [MIT](LICENSE) 许可；
- 题目与解析仅用于个人学习，相关内容版权归原始题库/命题与解析提供方所有，请勿将题库数据用于商业再分发。

如果这个工具对你有帮助，欢迎 Star ⭐，也欢迎提交 Issue 反馈功能问题。
