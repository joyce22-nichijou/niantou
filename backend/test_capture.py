"""
Phase 1 测试：念头捕捉
运行方式（从项目根目录）：python backend/test_capture.py
前提：uvicorn backend.main:app --reload 已在另一个终端启动
"""
import json

import requests

from database import SessionLocal, Thought

BASE_URL = "http://localhost:8000"

TEST_THOUGHTS = [
    "我想去媒体图书馆借乐器",
    "想给妈妈打个电话",
    "周末想去看那个新开的展览",
]

print("=" * 55)
print("Phase 1 测试：念头捕捉 POST /thoughts")
print("=" * 55)

for text in TEST_THOUGHTS:
    print(f"\n→ 发送念头：{text}")
    resp = requests.post(f"{BASE_URL}/thoughts", json={"content": text})
    if resp.status_code == 200:
        data = resp.json()
        print(f"  返回：{json.dumps(data, ensure_ascii=False, indent=4)}")
    else:
        print(f"  [错误] 状态码 {resp.status_code}：{resp.text}")

print("\n" + "=" * 55)
print("查询数据库，验证存储内容")
print("=" * 55)

db = SessionLocal()
records = db.query(Thought).all()
print(f"\n数据库中共有 {len(records)} 条念头记录：")
for t in records:
    extracted = json.loads(t.extracted_info) if t.extracted_info else {}
    print(f"\n  ┌─ ID: {t.id}")
    print(f"  │  原始输入    : {t.content_raw}")
    print(f"  │  温度        : {t.temperature}")
    print(f"  │  状态        : {t.status}")
    print(f"  │  创建时间    : {t.created_at}")
    print(f"  │  上次邀请    : {t.last_invited_at}")
    print(f"  │  拒绝次数    : {t.decline_count}")
    print(f"  └─ 提取信息    : {json.dumps(extracted, ensure_ascii=False)}")
db.close()

print("\n测试完成。")
