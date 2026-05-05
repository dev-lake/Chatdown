# Chatdown 部署文档

本文档说明如何部署 Chatdown 内置 API 后端，以及如何构建指向该后端的 Chrome 扩展包。

## 部署架构

```
Chrome Extension
  -> https://api.example.com
  -> Flask API
  -> OpenAI-compatible upstream model
  -> SQLite
  -> Resend email
```

后端必须通过 HTTPS 暴露。扩展构建时会把默认服务器地址注入到 `dist/manifest.json` 的 `host_permissions` 中，所以生产包必须使用生产 HTTPS 地址重新构建。

## 前置要求

- 一台 Linux 服务器或容器运行环境
- Python 3.11 或更高版本
- Node.js 18 或更高版本，用于构建扩展
- Docker 和 Docker Compose，用于容器部署
- 一个 HTTPS 域名，例如 `https://api.example.com`
- OpenAI-compatible 上游模型 API Key
- Resend API Key 和已验证的发件域名
- 可写的持久化目录，用于 SQLite 数据库

## 后端部署

以下示例假设项目部署在 `/opt/chatdown`，API 域名为 `api.example.com`。

### 1. 拉取代码

```bash
sudo mkdir -p /opt/chatdown
sudo chown "$USER":"$USER" /opt/chatdown
git clone <your-repo-url> /opt/chatdown
cd /opt/chatdown/server
```

### 2. 创建 Python 环境

```bash
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt
```

`flask run` 只用于开发环境。生产环境建议使用 Gunicorn，并由 Nginx、Caddy 或云负载均衡终止 TLS。

### 3. 创建生产环境变量

创建 `/opt/chatdown/server/.env`：

```bash
CHATDOWN_ENV=production
DATABASE_PATH=/var/lib/chatdown/chatdown.sqlite3
SECRET_KEY=<replace-with-openssl-rand-hex-32>

EMAIL_DELIVERY=resend
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL="Chatdown <noreply@example.com>"

OPENAI_COMPAT_BASE_URL=https://api.openai.com
OPENAI_COMPAT_API_KEY=<upstream-api-key>
OPENAI_COMPAT_MODEL=gpt-4o-mini

DAILY_QUOTA_LIMIT=10
LOGIN_CODE_TTL_SECONDS=600
LOGIN_CODE_RESEND_COOLDOWN_SECONDS=45
LOGIN_CODE_HOURLY_LIMIT=5
LOGIN_CODE_MAX_ATTEMPTS=5
SESSION_TTL_DAYS=90
REQUEST_TIMEOUT_SECONDS=120
```

生成 `SECRET_KEY`：

```bash
openssl rand -hex 32
```

创建数据库目录：

```bash
sudo mkdir -p /var/lib/chatdown
sudo chown "$USER":"$USER" /var/lib/chatdown
chmod 700 /var/lib/chatdown
```

注意：

- 生产环境不要使用 `EMAIL_DELIVERY=log`。
- `.env`、SQLite 数据库、虚拟环境都不应该提交到 Git。
- SQLite 表会在应用启动时自动创建或补齐新增字段。

### 4. 运行后端测试

```bash
cd /opt/chatdown/server
./.venv/bin/pytest
```

### 5. 用 Gunicorn 启动

先手动验证：

```bash
cd /opt/chatdown/server
./.venv/bin/gunicorn -w 2 -b 127.0.0.1:5001 wsgi:app --timeout 180
```

本机检查：

```bash
curl http://127.0.0.1:5001/health
```

应返回：

```json
{"ok":true}
```

### 6. systemd 服务

创建 `/etc/systemd/system/chatdown-api.service`：

```ini
[Unit]
Description=Chatdown Flask API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/chatdown/server
EnvironmentFile=/opt/chatdown/server/.env
ExecStart=/opt/chatdown/server/.venv/bin/gunicorn -w 2 -b 127.0.0.1:5001 wsgi:app --timeout 180
Restart=always
RestartSec=5
User=chatdown
Group=chatdown

[Install]
WantedBy=multi-user.target
```

如果服务器没有 `chatdown` 用户，先创建：

```bash
sudo useradd --system --home /opt/chatdown --shell /usr/sbin/nologin chatdown
sudo chown -R chatdown:chatdown /opt/chatdown /var/lib/chatdown
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chatdown-api
sudo systemctl status chatdown-api
```

查看日志：

```bash
journalctl -u chatdown-api -f
```

## 容器部署

仓库提供了后端容器部署文件：

- `server/Dockerfile`
- `server/.dockerignore`
- `docker-compose.yml`

容器内使用 Gunicorn 运行 Flask API，监听 `0.0.0.0:5001`。Compose 默认只把服务绑定到宿主机 `127.0.0.1:5001`，对外 HTTPS 仍然建议由宿主机 Nginx、Caddy 或负载均衡处理。

### 1. 准备环境变量

容器部署同样使用 `server/.env`。示例：

```bash
CHATDOWN_ENV=production
SECRET_KEY=<replace-with-openssl-rand-hex-32>

EMAIL_DELIVERY=resend
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL="Chatdown <noreply@example.com>"

OPENAI_COMPAT_BASE_URL=https://api.openai.com
OPENAI_COMPAT_API_KEY=<upstream-api-key>
OPENAI_COMPAT_MODEL=gpt-4o-mini

DAILY_QUOTA_LIMIT=10
LOGIN_CODE_TTL_SECONDS=600
LOGIN_CODE_RESEND_COOLDOWN_SECONDS=45
LOGIN_CODE_HOURLY_LIMIT=5
LOGIN_CODE_MAX_ATTEMPTS=5
SESSION_TTL_DAYS=90
REQUEST_TIMEOUT_SECONDS=120
```

`docker-compose.yml` 会把 `DATABASE_PATH` 覆盖为 `/data/chatdown.sqlite3`，并通过 `chatdown-data` volume 持久化数据库。

### 2. 构建并启动

```bash
cd /opt/chatdown
docker compose up -d --build
```

查看服务状态：

```bash
docker compose ps
docker compose logs -f api
```

本机健康检查：

```bash
curl http://127.0.0.1:5001/health
```

### 3. 更新容器部署

```bash
cd /opt/chatdown
git pull
docker compose up -d --build
docker compose logs -f api
```

### 4. 备份容器数据库

```bash
docker compose exec api python - <<'PY'
import sqlite3

source = sqlite3.connect('/data/chatdown.sqlite3')
backup = sqlite3.connect('/data/chatdown-backup.sqlite3')
source.backup(backup)
backup.close()
source.close()
PY

docker cp "$(docker compose ps -q api)":/data/chatdown-backup.sqlite3 ./chatdown-backup.sqlite3
```

也可以直接备份 Docker volume，具体方式取决于你的服务器备份系统。

### 5. Docker 单命令运行

不使用 Compose 时，可以直接构建镜像并挂载数据目录：

```bash
cd /opt/chatdown
docker build -t chatdown-api:latest ./server
docker run -d \
  --name chatdown-api \
  --restart unless-stopped \
  --env-file ./server/.env \
  -e CHATDOWN_ENV=production \
  -e DATABASE_PATH=/data/chatdown.sqlite3 \
  -p 127.0.0.1:5001:5001 \
  -v chatdown-data:/data \
  chatdown-api:latest
```

## HTTPS 反向代理

### Nginx 示例

```nginx
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`proxy_buffering off` 对 streaming responses 很重要，否则前端可能无法实时收到模型输出。

外部检查：

```bash
curl https://api.example.com/health
```

## 本地 HTTPS 调试

扩展默认内置服务器地址是：

```text
https://localhost:5001
```

本地也必须使用 HTTPS。可以使用受信任的本地证书，例如通过 `mkcert` 生成：

```bash
mkcert localhost 127.0.0.1 ::1
cd server
FLASK_APP=wsgi:app flask run --host 0.0.0.0 --port 5001 --cert localhost+2.pem --key localhost+2-key.pem
```

如果浏览器不信任证书，Chrome 扩展请求会失败。生产环境必须使用真实可信证书。

## 构建 Chrome 扩展

生产构建时必须注入后端 HTTPS 地址：

```bash
cd /opt/chatdown
npm install
VITE_CHATDOWN_DEFAULT_SERVER_URL=https://api.example.com npm run build
```

确认 manifest 权限：

```bash
grep -n "api.example.com" dist/manifest.json
```

应能看到：

```json
"https://api.example.com/*"
```

创建可上传的 zip 包：

```bash
VITE_CHATDOWN_DEFAULT_SERVER_URL=https://api.example.com npm run build:zip
```

打包产物会输出到 `artifacts/`。

## 上线验证

### 1. 健康检查

```bash
curl https://api.example.com/health
```

### 2. 邮箱验证码

```bash
curl -X POST https://api.example.com/api/auth/request-code \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

应返回：

```json
{"success":true}
```

同时确认邮箱能收到验证码。

### 3. 登录换取 token

```bash
curl -X POST https://api.example.com/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","code":"123456"}'
```

成功后返回 `token`、`user` 和 `quota`。

### 4. 查询账号和额度

```bash
curl https://api.example.com/api/me \
  -H "Authorization: Bearer <token>"
```

### 5. 模型代理

```bash
curl -X POST https://api.example.com/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "Say hello in one sentence." }
    ]
  }'
```

每次成功进入上游模型请求前会消耗 1 次当天内置 API 额度。第 11 次请求会返回 `429` 和 `QUOTA_EXCEEDED`。

## 运维事项

### 数据备份

SQLite 数据库包含用户、登录会话和每日用量。建议至少每天备份：

```bash
sqlite3 /var/lib/chatdown/chatdown.sqlite3 ".backup '/var/backups/chatdown-$(date +%F).sqlite3'"
```

### 日志

```bash
journalctl -u chatdown-api --since "1 hour ago"
```

重点关注：

- `EMAIL_DELIVERY_FAILED`
- `UNAUTHORIZED`
- `QUOTA_EXCEEDED`
- 上游模型请求超时或 5xx

### 更新部署

```bash
cd /opt/chatdown
git pull
cd server
./.venv/bin/pip install -r requirements.txt
./.venv/bin/pytest
sudo systemctl restart chatdown-api
curl https://api.example.com/health
```

如果前端代码、manifest 权限或默认服务器地址发生变化，需要重新构建并重新发布扩展：

```bash
VITE_CHATDOWN_DEFAULT_SERVER_URL=https://api.example.com npm run build:zip
```

### 回滚

```bash
cd /opt/chatdown
git checkout <previous-good-commit>
cd server
./.venv/bin/pip install -r requirements.txt
sudo systemctl restart chatdown-api
curl https://api.example.com/health
```

如果数据库结构已经升级，优先使用部署前备份恢复，不要直接删除生产数据库。

## 安全检查清单

- 后端只通过 HTTPS 对外暴露。
- `SECRET_KEY` 已替换为随机值。
- 生产环境使用 `EMAIL_DELIVERY=resend`。
- Resend 发件域名已验证。
- 上游模型 API Key 没有提交到 Git。
- `DATABASE_PATH` 指向持久化目录。
- `dist/manifest.json` 包含生产服务器的 HTTPS host permission。
- Nginx 或负载均衡保留 `X-Forwarded-For`，用于验证码请求限频。
- `/var/lib/chatdown` 权限限制为服务用户可读写。
