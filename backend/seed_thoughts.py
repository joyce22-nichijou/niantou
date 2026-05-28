"""
补充测试念头数据
运行方式（从项目根目录）：python backend/seed_thoughts.py
前提：uvicorn backend.main:app --reload 已在另一个终端启动
"""
import requests
from database import SessionLocal, Thought

BASE_URL = "http://127.0.0.1:8000"

NEW_THOUGHTS = [
    "想去河边那家新开的面包店尝尝",
    "想去爬一次附近的小山看日落",
    "想去逛逛周末的二手市集",
    "想学着用毛笔写几个字",
    "想整理一下手机里积压的旧照片",
    "想给好久没联系的高中同学发条消息",
]


def count_active() -> int:
    db = SessionLocal()
    n = db.query(Thought).filter(Thought.status == "active").count()
    db.close()
    return n


current = count_active()
print(f"当前数据库中有 {current} 条 active 念头。")

if current >= 6:
    print("池子已充足，跳过。")
else:
    print(f"开始添加 {len(NEW_THOUGHTS)} 条新念头...\n")
    for text in NEW_THOUGHTS:
        resp = requests.post(f"{BASE_URL}/thoughts", json={"content": text})
        if resp.status_code == 200:
            data = resp.json()
            print(f"  ID={data['id']}  摘要：{data['summary']}  ←  {text}")
        else:
            print(f"  [错误] {resp.status_code}：{resp.text}  ←  {text}")
    print(f"\n完成，当前共 {count_active()} 条 active 念头。")
