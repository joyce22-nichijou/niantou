"""
检查当前 active 念头的 scene 字段提取是否正确。
运行方式（从项目根目录）：python backend/check_scene.py
不依赖后端运行，直接读数据库。
"""
import json
from database import SessionLocal, Thought

db = SessionLocal()
thoughts = db.query(Thought).filter(Thought.status == "active").all()
db.close()

print(f"共 {len(thoughts)} 条 active 念头\n")
print(f"{'ID':<4}  {'scene':<8}  {'activity_type':<6}  {'location_hint':<12}  summary")
print("─" * 65)

for t in thoughts:
    info = json.loads(t.extracted_info) if t.extracted_info else {}
    scene        = info.get("scene", "⚠️ 无字段")
    activity     = info.get("activity_type", "—")
    location     = info.get("location_hint") or "—"
    summary      = info.get("summary") or t.content_raw[:20]
    print(f"{t.id:<4}  {scene:<8}  {activity:<6}  {location:<12}  {summary}")
