# 念头（Nian Tou）

一个收集你散落念头、在合适时机以朋友口吻邀请你行动的 AI 伴侣。

PWA 形态，核心交互为双向滑动：向上滑收纳念头，向下滑获取 AI 邀请。

---

## 技术栈

- 前端：React + Vite（PWA）
- 后端：Python + FastAPI
- AI：GLM / Claude API
- 数据库：SQLite

---

## 启动步骤

### 1. 创建 `.env` 文件

在项目根目录复制 `.env.example` 并填入你的 GLM API Key：

```bash
cp .env.example backend/.env
```

编辑 `backend/.env`：

```
GLM_API_KEY=你的真实key
```

GLM API Key 在 [智谱开放平台](https://open.bigmodel.cn/) 申请。

### 2. 安装 Python 依赖

```bash
pip install -r backend/requirements.txt
```

### 3. 测试 GLM 连接

```bash
python backend/test_llm.py
```

正常输出类似：`我是智谱AI，一个由智谱AI打造的人工智能助手。`

### 4. 启动 FastAPI 后端

```bash
uvicorn backend.main:app --reload
```

访问 `http://localhost:8000/health` 应返回 `{"status": "ok"}`。

API 文档：`http://localhost:8000/docs`
