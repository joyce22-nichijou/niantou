import json
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import Thought, get_db, init_db
from backend.llm_service import LLMService
from backend.ranking import compute_weight, get_top_candidates, pick_candidates_with_variety

llm = LLMService(provider="glm")

_WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[启动] 初始化数据库...")
    init_db()
    print("[启动] 数据库就绪，API 已上线")
    yield


app = FastAPI(title="念头 API", lifespan=lifespan)

# allow_origins=["*"] 与 allow_credentials=True 不兼容，MVP 阶段不需要凭证
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ThoughtInput(BaseModel):
    content: str


class InviteInput(BaseModel):
    state: str


class InviteResponse(BaseModel):
    thought_id: int
    outcome: str


_VALID_OUTCOMES = {"accepted", "declined", "ignored"}
_COOLING_LABELS = {"accepted": 14, "declined": 5, "ignored": 3}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/thoughts")
def create_thought(body: ThoughtInput, db: Session = Depends(get_db)):
    print(f"\n[接收到] 新念头：{body.content}")

    print("[AI 处理中] 正在提取结构化信息...")
    extracted = llm.extract_thought_info(body.content)
    print(f"[AI 完成] 提取结果：{json.dumps(extracted, ensure_ascii=False)}")

    if extracted.get("unclear"):
        print(f"[未存入] 输入不清晰: {body.content}")
        return {"unclear": True, "message": "嗯，没太听清，要不再说一次？"}

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


@app.post("/thoughts/invite")
def invite_thought(body: InviteInput, db: Session = Depends(get_db)):
    now = datetime.now()
    print(f"\n[接收到] 状态问询：「{body.state}」")

    # 1. 判断用户状态的场景倾向（轻量 AI 调用，用于硬过滤）
    scene_filter = llm.detect_state_scene(body.state)
    print(f"[场景判断] {scene_filter or '不过滤（状态方向不明确）'}")

    # 2. 规则层：取候选（多取，留给随机抽取用）
    all_eligible = get_top_candidates(db, now, n=10, scene_filter=scene_filter)

    # 场景过滤后若无候选，回退到不限场景
    if not all_eligible and scene_filter:
        print(f"[候选] 场景过滤后为空，回退到不限场景")
        all_eligible = get_top_candidates(db, now, n=10)

    if not all_eligible:
        print("[候选] 念头池为空或全部处于冷却期")
        return {"message": "现在没有合适的念头，先放一个进来吧。"}

    # 3. 加权随机抽取，引入多样性
    candidates = pick_candidates_with_variety(all_eligible, n=5)

    print(f"[候选] 从 {len(all_eligible)} 个中抽取 {len(candidates)} 个参与本轮邀请：")
    for t in candidates:
        w = compute_weight(t, now)
        info = json.loads(t.extracted_info) if t.extracted_info else {}
        summary = info.get("summary") or t.content_raw[:15]
        scene = info.get("scene", "either")
        print(f"  ID={t.id}  权重={w:.4f}  场景={scene}  摘要：{summary}")

    # 4. 组装传给 LLM 的候选列表
    candidates_dicts = []
    for t in candidates:
        info = json.loads(t.extracted_info) if t.extracted_info else {}
        candidates_dicts.append({
            "id": t.id,
            "summary": info.get("summary") or t.content_raw[:20],
            "location_hint": info.get("location_hint"),
            "time_relevance": info.get("time_relevance", "任意"),
            "created_at": t.created_at.isoformat(),
        })

    now_info = {
        "weekday": _WEEKDAYS[now.weekday()],
        "hour": now.hour,
        "is_daytime": 6 <= now.hour < 20,
    }

    # 5. AI 层：判档位 + 选念头 + 生成邀请
    print(f"[AI 处理中] 当前时间：{now_info['weekday']} {now_info['hour']}点，正在生成邀请...")
    result = llm.generate_invitation(candidates_dicts, body.state, now_info)
    if result is None:
        print("[AI] 返回空结果")
        return {"message": "现在没有合适的念头，先放一个进来吧。"}

    chosen_id = result.get("chosen_thought_id")
    invitation = result.get("invitation", "")
    energy = result.get("energy_level", "?")
    print(f"[AI 完成] 档位={energy}，选中 ID={chosen_id}")
    print(f"[邀请话术] {invitation}")

    # 6. 更新 last_invited_at，让这个念头进入冷却期
    chosen = db.query(Thought).filter(Thought.id == chosen_id).first()
    if chosen:
        chosen.last_invited_at = now
        db.commit()
        info = json.loads(chosen.extracted_info) if chosen.extracted_info else {}
        summary = info.get("summary", "")
        print(f"[已更新] ID={chosen_id} 进入冷却期")
    else:
        print(f"[警告] 找不到 ID={chosen_id} 的念头，跳过冷却标记")
        summary = ""

    return {
        "thought_id": chosen_id,
        "summary": summary,
        "invitation": invitation,
    }


@app.post("/thoughts/{thought_id}/archive")
def archive_thought(thought_id: int, db: Session = Depends(get_db)):
    thought = db.query(Thought).filter(Thought.id == thought_id).first()
    if not thought:
        raise HTTPException(status_code=404, detail=f"念头 ID={thought_id} 不存在")
    thought.status = "archived"
    db.commit()
    print(f"[撤回] thought_id={thought_id} 已归档")
    return {"ok": True}


@app.post("/thoughts/invite/respond")
def respond_to_invite(body: InviteResponse, db: Session = Depends(get_db)):
    if body.outcome not in _VALID_OUTCOMES:
        raise HTTPException(status_code=400, detail="outcome 必须是 accepted | declined | ignored")

    thought = db.query(Thought).filter(Thought.id == body.thought_id).first()
    if not thought:
        raise HTTPException(status_code=404, detail=f"念头 ID={body.thought_id} 不存在")

    thought.last_outcome = body.outcome

    if body.outcome == "declined":
        thought.decline_count = (thought.decline_count or 0) + 1
        if thought.decline_count >= 3:
            thought.status = "archived"

    db.commit()

    cooling = _COOLING_LABELS[body.outcome]
    print(f"[回应] thought_id={body.thought_id} outcome={body.outcome} → 冷却{cooling}天")

    return {"ok": True, "thought_id": body.thought_id, "status": thought.status}
