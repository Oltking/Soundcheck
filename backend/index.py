# Vercel Python entrypoint for the BFF — exposes the FastAPI ASGI `app`.
# (Local/dev still runs `uvicorn app.main:app`.)
from app.main import app  # noqa: F401
