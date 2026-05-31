# API 调用文档

本文档说明如何从其他系统调用 cloud-mail 获取指定邮箱的最近邮件，适用于收验证码、轮询指定邮箱最新邮件等场景。

## 1. 基础信息

生产地址：

```text
https://mail.zhongwenmj.com
```

鉴权方式：

```http
Authorization: <PUBLIC_TOKEN>
```

注意：

- `PUBLIC_TOKEN` 是公开接口专用 token。
- 不要把真实 token 写入 GitHub、前端代码、日志或截图。
- token 泄露后需要重新生成并覆盖 Worker KV 中的 `public_key:`。

## 2. 获取指定邮箱最近邮件

接口：

```http
POST /api/public/mailboxEmailList
```

完整 URL：

```text
https://mail.zhongwenmj.com/api/public/mailboxEmailList
```

请求头：

```http
Authorization: <PUBLIC_TOKEN>
Content-Type: application/json
```

请求体：

```json
{
  "email": "admin@zhongwenmj.com",
  "size": 5
}
```

参数说明：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `email` | string | 否 | - | 要取件的邮箱地址，可以是内部邮箱或外部邮箱 |
| `toEmail` | string | 否 | - | 兼容字段，作用同 `email` |
| `externalAccountId` | number | 否 | - | 指定外部邮箱账号 ID，优先于 `email` |
| `size` | number | 否 | 5 | 返回最近多少封邮件，当前接口有最大值限制 |
| `type` | number | 否 | 0 | 邮件类型，`0` 表示收件 |
| `isDel` | number | 否 | 0 | 删除状态，`0` 表示正常邮件 |
| `timeSort` | string | 否 | `desc` | 排序方向，传 `asc` 表示升序 |

`email` 和 `externalAccountId` 至少传一个。

## 3. curl 示例

按邮箱地址取最近 5 封：

```bash
curl 'https://mail.zhongwenmj.com/api/public/mailboxEmailList' \
  -H 'Authorization: <PUBLIC_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data-raw '{"email":"admin@zhongwenmj.com","size":5}'
```

按外部账号 ID 取最近 5 封：

```bash
curl 'https://mail.zhongwenmj.com/api/public/mailboxEmailList' \
  -H 'Authorization: <PUBLIC_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data-raw '{"externalAccountId":123,"size":5}'
```

取最近 1 封，适合验证码轮询：

```bash
curl 'https://mail.zhongwenmj.com/api/public/mailboxEmailList' \
  -H 'Authorization: <PUBLIC_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data-raw '{"email":"target@example.com","size":1}'
```

## 4. 返回格式

成功返回：

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "emailId": 1,
      "sendEmail": "sender@example.com",
      "sendName": "Sender",
      "subject": "Your verification code",
      "toEmail": "target@example.com",
      "toName": "target",
      "type": 0,
      "createTime": "2026-05-31 12:00:00",
      "content": "<div>...</div>",
      "text": "Your code is 123456",
      "isDel": 0,
      "sourceType": "cloudflare_routing",
      "externalAccountId": 0,
      "externalMailbox": "",
      "syncTime": null
    }
  ]
}
```

常用字段：

| 字段 | 说明 |
| --- | --- |
| `emailId` | 邮件 ID |
| `sendEmail` | 发件人邮箱 |
| `sendName` | 发件人名称 |
| `subject` | 邮件标题 |
| `toEmail` | 收件人邮箱 |
| `content` | HTML 正文 |
| `text` | 纯文本正文，验证码场景优先使用这个字段 |
| `sourceType` | 来源，可能是 `cloudflare_routing`、`external_imap`、`external_pop3` |
| `externalAccountId` | 外部邮箱账号 ID，内部邮箱通常为 `0` |
| `syncTime` | 外部邮箱同步入库时间 |

## 5. 内部邮箱和外部邮箱行为

如果传入的是外部邮箱：

- 系统会先触发该外部账号同步一次。
- 同步数量和返回数量使用 `size` 控制。
- 同步完成后返回该外部账号最近邮件。
- 如果该账号正在同步中，可能命中同步锁；当前接口会返回已入库的最近邮件。

如果传入的是内部邮箱：

- 系统不会触发外部同步。
- 直接按收件人邮箱查询最近邮件。
- 适用于 `zhongwenmj.com` 域名下由 Cloudflare Email Routing 投递到 Worker 的邮件。

## 6. 邮箱不在外部账号列表里会怎么样

如果传入的邮箱不在外部邮箱账号列表中：

- 系统会把它当作内部收件邮箱处理。
- 不会尝试 IMAP/POP3 登录。
- 不会触发外部同步。
- 会直接查询邮件表中 `toEmail` 等于该邮箱的最近邮件。

因此会出现两种结果：

- 如果这个邮箱曾经通过 Cloudflare Email Routing 收到过邮件，接口会返回这些邮件。
- 如果邮件表里没有这个收件邮箱的邮件，接口返回空数组：

```json
{
  "code": 200,
  "message": "success",
  "data": []
}
```

如果既没有传 `email` / `toEmail`，也没有传 `externalAccountId`，接口会返回错误：

```json
{
  "code": 500,
  "message": "email is required"
}
```

## 7. 调用建议

验证码场景建议：

- `size` 设置为 `1` 到 `5`。
- 先按邮箱取最近邮件，再在 `subject`、`text` 中提取验证码。
- 不要高频并发请求同一个外部邮箱，避免服务商风控或同步锁。
- 外部邮箱同步可能受邮箱服务商风控、代理质量、应用专用密码状态影响。

轮询建议：

- 单个邮箱建议间隔 3 秒以上。
- 如果连续多次返回空数组，检查该邮箱是否已在外部账号中配置，或内部域名是否已通过 Cloudflare Email Routing 投递到 Worker。
- 如果外部邮箱账号长期没有新邮件，先在后台点“测试”确认 IMAP/POP3 登录是否正常。
