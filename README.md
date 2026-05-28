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

---

## 运行 Phase 1 测试（念头捕捉）

### 第一步：启动后端

```bash
uvicorn backend.main:app --reload
```

启动后控制台应看到：

```
[启动] 初始化数据库...
[启动] 数据库就绪，API 已上线
```

数据库文件会自动创建在 `backend/niantou.db`。

### 第二步：在另一个终端运行测试脚本

```bash
python backend/test_capture.py
```

### 预期输出

**测试脚本端：**

```
=======================================================
Phase 1 测试：念头捕捉 POST /thoughts
=======================================================

→ 发送念头：我想去媒体图书馆借乐器
  返回：{
      "id": 1,
      "summary": "借乐器",
      "message": "记下了。"
  }

→ 发送念头：想给妈妈打个电话
  ...

=======================================================
查询数据库，验证存储内容
=======================================================

数据库中共有 3 条念头记录：

  ┌─ ID: 1
  │  原始输入    : 我想去媒体图书馆借乐器
  │  温度        : 1.0
  │  状态        : active
  └─ 提取信息    : {"activity_type": "出门", "location_hint": "媒体图书馆", ...}
  ...
```

**后端控制台端（uvicorn 窗口）：**

```
[接收到] 新念头：我想去媒体图书馆借乐器
[AI 处理中] 正在提取结构化信息...
[AI 完成] 提取结果：{"activity_type": "出门", ...}
[已存入数据库] ID=1，摘要：借乐器
```
