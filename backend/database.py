import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, Text, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

_here = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(_here, 'niantou.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Thought(Base):
    __tablename__ = "thoughts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    content_raw = Column(Text, nullable=False)
    extracted_info = Column(Text, nullable=True)   # JSON 字符串
    temperature = Column(Float, default=1.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_invited_at = Column(DateTime, nullable=True)
    decline_count = Column(Integer, default=0)
    status = Column(Text, default="active")


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
