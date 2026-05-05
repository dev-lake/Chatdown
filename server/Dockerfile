FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CHATDOWN_ENV=production \
    DATABASE_PATH=/data/chatdown.sqlite3

WORKDIR /app

RUN addgroup --system chatdown \
    && adduser --system --ingroup chatdown chatdown

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY app ./app
COPY wsgi.py .

RUN mkdir -p /data \
    && chown -R chatdown:chatdown /app /data

USER chatdown

EXPOSE 5001

CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5001", "wsgi:app", "--timeout", "180"]
