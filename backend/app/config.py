import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./support_desk.db")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "llama3.2")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
APP_ENV = os.getenv("APP_ENV", "development").lower()
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-only-change-this-secret-before-deploying")
JWT_ACCESS_TOKEN_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_MINUTES", "30"))
BOOTSTRAP_ADMIN_EMAIL = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "768"))
OLLAMA_INPUT_COST_PER_MILLION = float(os.getenv("OLLAMA_INPUT_COST_PER_MILLION", "0"))
OLLAMA_OUTPUT_COST_PER_MILLION = float(os.getenv("OLLAMA_OUTPUT_COST_PER_MILLION", "0"))
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "1025"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "novadesk@localhost")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "false").lower() == "true"
FRONTEND_PUBLIC_URL = os.getenv("FRONTEND_PUBLIC_URL", "http://localhost:5173").rstrip("/")
CORS_ORIGINS = [origin.strip() for origin in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",") if origin.strip()]

if APP_ENV == "production" and (
    len(JWT_SECRET_KEY) < 32 or JWT_SECRET_KEY.startswith("replace-with-")
):
    raise RuntimeError("Set JWT_SECRET_KEY to a random value of at least 32 characters in production")
if JWT_ACCESS_TOKEN_MINUTES < 1:
    raise RuntimeError("JWT_ACCESS_TOKEN_MINUTES must be positive")
if EMBEDDING_DIMENSION < 1:
    raise RuntimeError("EMBEDDING_DIMENSION must be positive")

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
