from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="StoryStrand API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://storystrand.vercel.app", "http://localhost:3000"],
    allow_origin_regex=r"https://storystrand-.*\.vercel\.app",   # preview deploys
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
