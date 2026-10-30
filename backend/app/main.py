"""
FastAPI application entry point.

Serves:
  - GET  /health            backend + word-model availability (frontend banner)
  - GET  /docs              interactive API docs
  - WS   /ws/predict        real-time word prediction from landmark frames
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.ws import router as ws_router
from app.api.record import router as record_router
from app.core.config import settings
from app.services.recognizer import WordRecognizer

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
)
logger = logging.getLogger("isl-app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting ISL-to-Speech backend (environment=%s)", settings.ENVIRONMENT)

    recognizer = WordRecognizer(
        model_path=settings.MODEL_PATH,
        confidence_threshold=settings.CONFIDENCE_THRESHOLD,
    )
    app.state.recognizer = recognizer

    if recognizer.available:
        try:
            recognizer.load()
            logger.info(
                "Word model loaded: %s (%d words, seq len %d)",
                settings.MODEL_PATH.name, len(recognizer.labels), recognizer.seq_len,
            )
        except Exception as exc:
            logger.warning("Model present but failed to load: %s", exc)
    else:
        logger.warning(
            "No trained word model at %s — run scripts/train_lstm.py first.",
            settings.MODEL_PATH,
        )

    yield
    logger.info("Backend shutting down.")


app = FastAPI(
    title="ISL-to-Speech Backend",
    description="Real-Time Indian Sign Language (ISL) to Speech Conversion — backend API.",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)
app.include_router(record_router)


@app.get("/")
def root():
    return {
        "app": "ISL-to-Speech Backend",
        "status": "running",
        "docs": "/docs",
        "health": "/health",
        "predict": "ws://<host>:8000/ws/predict",
    }


@app.get("/health")
def health():
    recognizer = getattr(app.state, "recognizer", None)
    model_loaded = bool(recognizer and recognizer.available and recognizer.loaded)
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
        "model_loaded": model_loaded,
        "num_classes": len(recognizer.labels) if recognizer else 0,
        "seq_len": recognizer.seq_len if recognizer else 0,
        "model_path": str(settings.MODEL_PATH),
        "version": app.version,
    }
