"""
邀请功能质量验证脚本
运行方式（从项目根目录）：python backend/test_invite.py
前提：uvicorn backend.main:app --reload 已在另一个终端启动
      pool 已由 seed_thoughts.py 准备好
"""
import json

import requests

from database import SessionLocal, Thought

BASE_URL = "http://127.0.0.1:8000"

# 5 种测试状态，含预期行为说明（仅供人工核对参考）
TESTS = [
    ("想出门走走，活动一下",          "预期选出门类念头"),
    ("没什么精力，只想在家做点小事",   "预期选室内类念头"),
    ("有点闷，不知道干嘛",            "预期 B 档，自由选"),
    ("好累，提不起劲",                "预期 A 档，温和语气，优先低成本"),
    ("烦死了，坐不住",                "预期 B 档"),
]


def get_category(thought: Thought) -> str:
    """根据 extracted_info 中的 activity_type 判断出门类 / 室内类。"""
    info = json.loads(thought.extracted_info) if thought.extracted_info else {}
    if info.get("activity_type") == "出门":
        return "【出门类】"
    # location_hint 非空也视为出门相关
    if info.get("location_hint"):
        return "【出门类】"
    return "【室内类】"


def print_pool():
    db = SessionLocal()
    thoughts = db.query(Thought).filter(Thought.status == "active").all()
    print(f"当前念头池：{len(thoughts)} 条 active 念头")
    for t in thoughts:
        info = json.loads(t.extracted_info) if t.extracted_info else {}
        summary = info.get("summary", t.content_raw[:15])
        category = get_category(t)
        print(f"  ID={t.id}  {category}  摘要：{summary}")
    db.close()
    return len(thoughts)


def reset_cooling(thought_id: int):
    """把指定念头的 last_invited_at 重置为 None，消除冷却副作用。"""
    db = SessionLocal()
    t = db.query(Thought).filter(Thought.id == thought_id).first()
    if t:
        t.last_invited_at = None
        db.commit()
    db.close()


def run_test(state: str, note: str, index: int) -> int | None:
    """
    发起一次邀请请求，打印结果，重置冷却，返回被选中的 thought_id。
    """
    print(f"\n{'─' * 50}")
    print(f"测试 {index}｜{note}")
    print(f"状态：「{state}」")

    resp = requests.post(f"{BASE_URL}/thoughts/invite", json={"state": state})
    if resp.status_code != 200:
        print(f"[错误] 状态码 {resp.status_code}：{resp.text}")
        return None

    data = resp.json()

    if "invitation" not in data:
        print(f"[无候选] {data.get('message', '')}")
        return None

    thought_id = data.get("thought_id")
    summary = data.get("summary", "—")
    invitation = data.get("invitation", "")

    # 从数据库取完整信息（energy_level 在 API 响应里没有，从后端日志可见；
    # 这里直接打印 API 返回字段，energy_level 通过后端控制台确认）
    db = SessionLocal()
    t = db.query(Thought).filter(Thought.id == thought_id).first()
    category = get_category(t) if t else "【未知】"
    db.close()

    print(f"选中念头：ID={thought_id}  摘要：{summary}  {category}")
    print(f"邀请话术：{invitation}")

    # 重置冷却，不留副作用
    reset_cooling(thought_id)

    return thought_id


# ─── 主流程 ───────────────────────────────────────────

print("=" * 50)
print("邀请功能质量验证")
print("=" * 50)

n = print_pool()
if n == 0:
    print("\n念头池为空，请先运行 python backend/seed_thoughts.py 填入数据。")
    raise SystemExit

print()
for i, (state, note) in enumerate(TESTS, start=1):
    run_test(state, note, i)

print(f"\n{'═' * 50}")
print("验证完成。所有冷却已重置，念头池无副作用。")
