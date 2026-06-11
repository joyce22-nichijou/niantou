import json
import math
import random
from datetime import datetime

from sqlalchemy.orm import Session

from backend.database import Thought

# 新鲜度半衰期：7 天（PRD 第九章）
_HALFLIFE_DAYS = 7

# 冷却天数按 last_outcome 区分；None 表示已邀请但未记录回应，视为 ignored
_COOLING_BY_OUTCOME = {
    "accepted": 14,
    "declined": 5,
    "ignored": 3,
    None: 3,
}


def compute_weight(thought: Thought, now: datetime) -> float:
    """
    权重 = 新鲜度衰减（e^(-Δt/7)）× 冷却系数（在冷却期内返回 0）。
    冷却天数由 last_outcome 决定；从未邀请（last_invited_at is None）不冷却。
    """
    delta_days = (now - thought.created_at).total_seconds() / 86400
    freshness = math.exp(-delta_days / _HALFLIFE_DAYS)

    if thought.last_invited_at is not None:
        cooling_days = _COOLING_BY_OUTCOME.get(thought.last_outcome, 3)
        days_since_invited = (now - thought.last_invited_at).total_seconds() / 86400
        if days_since_invited < cooling_days:
            return 0.0

    return freshness


def _get_scene(thought: Thought) -> str:
    """
    从 extracted_info 中读取 scene 字段。
    旧数据（无 scene 字段）默认返回 "either"，保持向后兼容。
    """
    try:
        info = json.loads(thought.extracted_info) if thought.extracted_info else {}
        return info.get("scene", "either")
    except Exception:
        return "either"


def get_top_candidates(
    db: Session,
    now: datetime,
    user_id: str,
    n: int = 10,
    scene_filter: str | None = None,
) -> list[Thought]:
    """
    从念头池中取出按权重排序的候选念头（纯规则计算，不调用 AI）。

    筛选流程：
    1. 查出当前用户所有 status='active' 的念头
    2. 计算权重，过滤掉冷却期内（weight == 0）的念头
    3. 按 scene_filter 决定候选构成：
       - None：所有念头平等参与
       - "outdoor" / "indoor"：优先用正主（精确匹配），
         仅当正主数量 < 2 时才补入 either 类；完全排除对立 scene
    4. 按权重降序，返回前 n 个
    """
    active_thoughts = (
        db.query(Thought)
        .filter(Thought.status == "active", Thought.user_id == user_id)
        .all()
    )

    weighted = [(t, compute_weight(t, now)) for t in active_thoughts]
    eligible = [(t, w) for t, w in weighted if w > 0]

    if scene_filter in ("outdoor", "indoor"):
        opposite = "indoor" if scene_filter == "outdoor" else "outdoor"

        primary = [(t, w) for t, w in eligible if _get_scene(t) == scene_filter]
        either  = [(t, w) for t, w in eligible if _get_scene(t) == "either"]
        # 完全排除对立 scene；either 仅在正主不足 2 个时补入
        if len(primary) >= 2:
            eligible = primary
        else:
            eligible = primary + either

    eligible.sort(key=lambda x: x[1], reverse=True)

    return [t for t, _ in eligible[:n]]


def pick_candidates_with_variety(sorted_candidates: list[Thought], n: int = 5) -> list[Thought]:
    """
    从已按权重排序的候选中，用加权随机抽取 n 个，引入多样性。

    候选池：取前 max(n+2, 7) 个
    权重：排名越高概率越大（0.75 的排名次方），但低排名仍有机会入选
    抽样：无放回加权随机（每抽一个就从池中移除）

    意图：避免同样状态下每次都推同一个念头，制造"这次不一样"的惊喜感。
    """
    pool = sorted_candidates[:max(n + 2, 7)]
    if len(pool) <= n:
        return list(pool)

    # 排名衰减权重：第 0 名=1.0，第 1 名=0.75，第 2 名=0.5625 ...
    rank_weights = [0.75 ** i for i in range(len(pool))]

    selected = []
    pool_copy = list(pool)
    weights_copy = list(rank_weights)

    for _ in range(n):
        if not pool_copy:
            break
        total = sum(weights_copy)
        r = random.uniform(0, total)
        cumulative = 0.0
        for i, w in enumerate(weights_copy):
            cumulative += w
            if r <= cumulative:
                selected.append(pool_copy.pop(i))
                weights_copy.pop(i)
                break

    return selected
