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

## 手动 Docker 部署

不使用 Docker Compose 时，在服务目录构建镜像：

```bash
cd ~/cloud-mail/external-mail-sync-service
docker build -t cloud-mail-external-sync:dev0701 .
```

使用同一个镜像标签启动容器：

```bash
docker run -d \
  --name cloud-mail-external-sync \
  --restart unless-stopped \
  -p 80:8788 \
  -p 8080:8788 \
  -e PORT=8788 \
  -e INTERNAL_TOKEN='<与 Worker 配置一致的令牌>' \
  -e WORKER_BASE_URL='https://mail.example.com' \
  cloud-mail-external-sync:dev0701
```

更新镜像前先删除旧容器，再使用相同的 `docker run` 命令启动：

```bash
docker rm -f cloud-mail-external-sync
```
