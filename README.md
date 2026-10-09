# 念头 · Niantou

> **An AI companion that catches your fleeting thoughts and invites you back to act on them.**  
> 一个 AI 伴侣，帮你接住散落的念头，在合适的时机轻轻唤你去做。

**Live demo:** https://niantou-omega.vercel.app  
**Backend API:** https://web-production-71137.up.railway.app

---

## What it does

Most to-do apps ask you to *decide* and *commit*. Niantou doesn't.

You press and hold the mic button, say a thought out loud ("I want to try that new bakery"), and swipe **up** to let it sink into the pool. Later, when you feel stuck or restless, you swipe **down** — and the AI surfaces one thought as a warm, friend-like invitation tailored to your current energy and the time of day.

No lists. No reminders. No pressure. Just a gentle nudge at the right moment.

### Core interaction

| Gesture | Action |
|---------|--------|
| Hold + swipe ↑ | Capture a thought — voice → AI extraction → pool |
| Hold + swipe ↓ | Pull an invitation — AI picks one thought, writes the invite |
| "好，去看看" | Accept — thought enters 14-day cooldown |
| "今天先这样" | Decline — thought enters 5-day cooldown |
| Hold mic again | Ignore & redraw — 3-day cooldown |

### Why it works this way

- **Analysis paralysis** is real. Choosing from a list costs cognitive energy you don't have.  
- **Body doubles the decision.** A swipe gesture bypasses the "should I?" loop.  
- **AI does the choosing.** Weighted by recency decay, cooldown state, scene filter (indoor / outdoor / either), and your current energy level.  
- **Witnessing matters.** Saying a thought out loud — even to an app — gives it the social weight needed to feel real.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite (PWA) |
| Backend | Python + FastAPI |
| Database | SQLite |
| LLM | GLM-4-Flash (Zhipu AI — permanently free, strong Chinese) |
| Frontend deploy | Vercel |
| Backend deploy | Railway |
| Voice input | Web Speech API |

**LLM abstraction:** `LLMService` base class supports swapping to Claude / DeepSeek without changing business logic.

---

## Recommendation algorithm

Each thought gets a weight at invite time:

```
weight = freshness_decay × cooldown_multiplier × scene_match
```

- **Freshness decay:** `e^(-Δt / 7days)` — newer thoughts float up naturally  
- **Cooldown:** accepted = 14 days, declined = 5 days, ignored = 3 days  
- **Scene filter:** user's current state (e.g. "feeling lazy indoors") is parsed → hard-filters outdoor thoughts  
- **Variety sampling:** weighted-random draw from top candidates, preventing the same thought from dominating

---

## Prompt engineering highlights

- **Two-tier tone system:**  
  - Tier A (low energy) → gentle, slow-paced, low-commitment  
  - Tier B (okay mood) → curious, forward-imagining ("what if you just went to see?")  
- **Anti-overfitting:** diversified few-shot examples prevent the model from latching onto one phrasing pattern  
- **Hard rules in prompt:** cross-thought splicing forbidden; scene classification has explicit examples to reduce ambiguity  
- **Unclear input filter:** mumbles or noise return "Hmm, didn't quite catch that — want to try again?" and are not stored

---

## Project structure

```
niantou/
├── PRD.md                  # Full product requirements doc (v1.1)
├── Procfile                # Railway entry: web: python backend/run.py
├── requirements.txt        # Root-level copy for Railpack detection
├── runtime.txt             # python-3.11
├── backend/
│   ├── main.py             # FastAPI app, CORS, all API routes
│   ├── llm_service.py      # LLM abstraction + extract_thought_info + generate_invitation
│   ├── ranking.py          # Weight formula + scene filter + weighted-random sampling
│   ├── database.py         # SQLAlchemy models + migration logic
│   └── run.py              # Railway entry point (sys.path fix)
└── frontend/
    └── src/
        ├── App.jsx         # Main UI + state machine + all interactions
        ├── App.css         # Watercolor UI + animations
        ├── api.js          # API client (VITE_API_BASE env var support)
        ├── userId.js       # Anonymous UUID (localStorage)
        └── sounds/         # drop.mp3, ripple.mp3 (splash screen SFX)
```

---

## Local setup

### Backend

```bash
cd backend
pip install -r requirements.txt

# Copy env template and add your GLM API key
cp ../.env.example .env
# edit .env: GLM_API_KEY=your_key_here

uvicorn main:app --reload
# → http://localhost:8000
```

Get a free GLM-4-Flash key at [open.bigmodel.cn](https://open.bigmodel.cn).

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

To point the frontend at a local backend, create `frontend/.env.local`:
```
VITE_API_BASE=http://localhost:8000
```

---

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/thoughts` | Capture a thought (voice transcript → AI extraction → store) |
| POST | `/thoughts/invite` | Request an AI-generated invitation |
| POST | `/thoughts/invite/respond` | Record user response (accepted / declined / ignored) |
| POST | `/thoughts/{id}/archive` | Undo / archive a thought |

---

## Design decisions (the "why nots")

| Decision | Reasoning |
|----------|-----------|
| No thought list view | Would turn it into a to-do app; defeats the "AI chooses for you" core |
| No "next one" button | Invites analysis paralysis — swipe down again to redraw |
| No habit tracking | Not a productivity tool; no streaks, no scores |
| No default sample thoughts | Breaks the "witnessed by you" value prop |
| Removed playful tone tier | Clashed with the app's quiet, watercolor aesthetic |
| `either` scene deprioritized | Prevents `either` from dominating when there's a clear indoor/outdoor signal |

---

## Watercolor UI

Background `#FDFCF8` (warm paper white). Four soft ellipses:

- Upper-left: `#B5D4F4` (sky blue) — capture zone  
- Upper-right: `#CECBF6` (lavender) — accent  
- Lower-left: `#FAC775` (warm amber) — invite zone  
- Lower-right: `#F4C0D1` (blush pink) — accent  

Ellipses are asymmetric and diagonal — they blend at the center rather than sitting in the four corners. During submission, the relevant zone pulses with irrational-period animations (3.7 s / 5.3 s / 7.1 s) to avoid mechanical repetition.

---

## v0.2 roadmap

- [ ] "Did you go?" follow-up conversation (closing the loop without a check-in feel)  
- [ ] Step decomposition for intimidating thoughts (≤ 3 micro-steps)  
- [ ] RAG user preference store (ChromaDB + GLM Embedding)  
- [ ] Archive browser (hidden secondary entry)  
- [ ] Variable reward SFX on completion  
- [ ] Better STT (replacing Web Speech API)  

---

## Browser compatibility

| Environment | Status |
|-------------|--------|
| Android Chrome | ✅ Full support — recommended |
| Desktop Chrome / Edge | ✅ Full support |
| iOS Safari 15+ | ⚠️ Requires HTTPS (LAN IP blocked); use deployed URL |
| Firefox | ❌ No `webkitSpeechRecognition`; gestures work, voice won't |

---

---

# 念头 · Niantou（中文说明）

> 一个 AI 伴侣，帮你接住散落的念头，在合适的时机轻轻唤你去做。

**在线体验：** https://niantou-omega.vercel.app

---

## 产品是什么

大多数待办 App 要你 *决定* 和 *承诺*。念头不这样。

按住麦克风，说出一个念头（"我想去那家新开的面包店"），向上滑——念头沉入池子。  
等你某天有些无聊或提不起劲，向下滑——AI 根据你现在的状态和时间，挑一个念头，用朋友的语气邀请你去做。

没有列表，没有提醒，没有压力。只是在合适的时机，一句轻轻的"要不要去试试？"

---

## 核心交互

| 手势 | 动作 |
|------|------|
| 按住 + 向上滑 | 捕捉念头 — 语音 → AI 提取 → 存入念头池 |
| 按住 + 向下滑 | 取出邀请 — AI 选一个念头，生成邀请话术 |
| 好，去看看 | 接受 — 该念头进入 14 天冷却 |
| 今天先这样 | 拒绝 — 该念头进入 5 天冷却 |
| 再按住麦克风 | 忽略并重取 — 3 天冷却 |

---

## 为什么这样设计

- **分析瘫痪是真实存在的。** 从列表里选择，需要你本来就不多的认知能量。  
- **身体动作替代脑部决策。** 滑动手势绕过"要不要做"的循环。  
- **AI 替你选。** 按新鲜度衰减、冷却状态、场景过滤（室内/室外/皆可）和当前能量档位加权随机抽取。  
- **被见证感很重要。** 把念头说出来——哪怕只是对一个 App——能给它足够的重量，让它感觉真实。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React + Vite（PWA） |
| 后端 | Python + FastAPI |
| 数据库 | SQLite |
| AI 模型 | GLM-4-Flash（智谱 AI，永久免费，中文表现好） |
| 前端部署 | Vercel |
| 后端部署 | Railway |
| 语音输入 | Web Speech API |

---

## 推荐算法

每次邀请时，系统对每条念头计算权重：

```
weight = 新鲜度衰减 × 冷却系数 × 场景匹配
```

- **新鲜度衰减：** `e^(-Δt / 7天)` — 越新的念头自然浮出  
- **冷却：** 接受=14天，拒绝=5天，忽略=3天  
- **场景过滤：** 解析用户当前状态（"没精力"→偏向室内）→ 硬过滤不符合场景的念头  
- **多样性抽取：** 从高分候选中加权随机抽取，避免同一念头扎堆出现

---

## Prompt 工程亮点

- **语气两档：**  
  - A档（低能量）→ 温和型，节奏慢，不施压  
  - B档（情绪尚可）→ 好奇引导型，描绘具体未来画面，预支正反馈  
- **防过拟合：** 多样化 few-shot 示例，防止模型锁定单一句式  
- **Prompt 硬规则：** 禁止跨念头拼接；场景判断有具体例子降低歧义  
- **不清晰输入过滤：** 残句/噪音返回"嗯，没太听清，要不再说一次？"，不入库

---

## 本地运行

### 后端

```bash
cd backend
pip install -r requirements.txt

cp ../.env.example .env
# 编辑 .env，填入 GLM_API_KEY=你的密钥

uvicorn main:app --reload
```

免费 GLM API Key 申请：[open.bigmodel.cn](https://open.bigmodel.cn)

### 前端

```bash
cd frontend
npm install
npm run dev
```

本地后端对接，创建 `frontend/.env.local`：
```
VITE_API_BASE=http://localhost:8000
```

---

## v0.2 规划

- [ ] "你去了吗"跟进对话（比打卡更符合气质的闭环）  
- [ ] 念头拆解（≤3步微行动，解决启动困难）  
- [ ] RAG 用户偏好向量库（ChromaDB + GLM Embedding）  
- [ ] 归档区（隐藏二级入口）  
- [ ] 完成随机反馈音效（变量奖励）  
- [ ] 更好的 STT 服务替代 Web Speech API  
