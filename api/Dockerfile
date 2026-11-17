# KAYA api: FastAPI on port 8000. Build from the repo root:
#   docker build -f api/Dockerfile .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RUNS_DIR=/app/runs

WORKDIR /app

COPY api/requirements.txt api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY api/ api/
COPY prompts/ prompts/
COPY templates/ templates/
COPY kb/ kb/
COPY evals/ evals/
COPY config.yaml config.yaml

# Run as a normal user. UID 1000 matches most Linux hosts, so ./runs stays writable.
RUN useradd --create-home --uid 1000 kaya && mkdir -p /app/runs && chown -R kaya /app/runs
USER kaya

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=4)"

CMD ["uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "8000"]
