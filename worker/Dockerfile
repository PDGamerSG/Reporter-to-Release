FROM python:3.13-slim-bookworm@sha256:a5a7017efc5969e00ae2b91c8eb0631049a569652aa4ffc4501769049ae45c72
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY pyproject.toml ./
COPY requirements.txt ./
COPY src ./src
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir --no-deps . && useradd --uid 10001 --create-home worker
USER worker
CMD ["r2r-worker"]
