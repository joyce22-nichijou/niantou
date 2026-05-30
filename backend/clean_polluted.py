"""
用法：python backend/clean_polluted.py 18 19 20
把指定 id 的念头 status 改为 archived，并打印原始内容供确认。
"""
import sys
import os

_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_here))

from backend.database import SessionLocal, Thought


def main():
    ids = [int(x) for x in sys.argv[1:]]
    if not ids:
        print("请传入要归档的念头 ID，例如：python backend/clean_polluted.py 18 19 20")
        return

    db = SessionLocal()
    try:
        for tid in ids:
            thought = db.query(Thought).filter(Thought.id == tid).first()
            if not thought:
                print(f"  [未找到] ID={tid}")
                continue
            thought.status = "archived"
            print(f"  [已归档] ID={tid}  内容：{thought.content_raw}")
        db.commit()
        print(f"\n共归档 {len(ids)} 条念头。")
    finally:
        db.close()


if __name__ == "__main__":
    main()
