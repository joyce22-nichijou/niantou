import json
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import Thought, get_db, init_db
from backend.llm_service import LLMService

llm = LLMService(provider="glm")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[启动] 初始化数据库...")
    init_db()
    print("[启动] 数据库就绪，API 已上线")
    yield


app = FastAPI(title="念头 API", lifespan=lifespan)


class ThoughtInput(BaseModel):
    content: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/thoughts")
def create_thought(body: ThoughtInput, db: Session = Depends(get_db)):
    print(f"\n[接收到] 新念头：{body.content}")

    print("[AI 处理中] 正在提取结构化信息...")
    extracted = llm.extract_thought_info(body.content)
    print(f"[AI 完成] 提取结果：{json.dumps(extracted, ensure_ascii=False)}")

    thought = Thought(
        content_raw=body.content,
        extracted_info=json.dumps(extracted, ensure_ascii=False),
        temperature=1.0,
    )
    db.add(thought)
    db.commit()
    db.refresh(thought)

    print(f"[已存入数据库] ID={thought.id}，摘要：{extracted.get('summary', '')}")

    return {
        "id": thought.id,
        "summary": extracted.get("summary", ""),
        "message": "记下了。",
    }
