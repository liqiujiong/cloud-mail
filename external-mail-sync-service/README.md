# External Mail Sync Service

外部邮箱 IMAP/POP3 同步服务。

## Docker Compose 部署

在服务器项目目录执行：

```bash
cd ~/cloud-mail/external-mail-sync-service
cp .env.example .env
vi .env
```

确认 `.env` 里的 `INTERNAL_TOKEN` 和 Worker 里的 `external_mail_internal_token` 一致，`WORKER_BASE_URL` 填 Worker 对外访问地址。

构建并启动：

```bash
docker compose up -d --build
```

更新代码后重新构建并滚动替换容器：

```bash
git pull
docker compose up -d --build
```

查看状态和日志：

```bash
docker compose ps
docker compose logs -f --tail=200
```

停止服务：

```bash
docker compose down
```

默认映射 `80:8788` 和 `8080:8788`。如果服务器 80 端口被占用，修改 `.env` 里的 `HTTP_PORT`。
