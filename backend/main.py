from fastapi import FastAPI

app = FastAPI(title="念头 API")


@app.get("/health")
def health():
    return {"status": "ok"}
