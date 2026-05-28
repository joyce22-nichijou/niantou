"""
把所有 active 念头标记为 archived，清空念头池。
用于重新 seed 数据（例如 extract_thought_info 新增字段后需要重建）。
运行方式（从项目根目录）：python backend/reset_thoughts.py
不依赖后端是否运行，直接操作数据库。
"""
from database import SessionLocal, Thought

db = SessionLocal()

active = db.query(Thought).filter(Thought.status == "active").all()
print(f"当前共 {len(active)} 条 active 念头，即将全部标记为 archived。")

for t in active:
    t.status = "archived"

db.commit()
db.close()

print("完成。念头池已清空，可以重新运行 python backend/seed_thoughts.py。")
