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
  "email": "user@zhongwenmj.com",
  "size": 5
}
```

参数说明：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `email` | string | 是 | - | 要取件的邮箱地址，可以是内部邮箱或外部邮箱 |
| `size` | number | 否 | 5 | 返回最近多少封邮件，当前接口有最大值限制 |
| `type` | number | 否 | 0 | 邮件类型，`0` 表示收件 |
| `isDel` | number | 否 | 0 | 删除状态，`0` 表示正常邮件 |
| `timeSort` | string | 否 | `desc` | 排序方向，传 `asc` 表示升序 |

`email` 必填。公开取件接口只按邮箱地址判断邮箱类型，不需要传外部账号 ID。

## 3. curl 示例

按邮箱地址取最近 5 封：

```bash
curl 'https://mail.zhongwenmj.com/api/public/mailboxEmailList' \
  -H 'Authorization: <PUBLIC_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data-raw '{"email":"user@zhongwenmj.com","size":5}'
```

按外部邮箱地址取最近 5 封：

```bash
curl 'https://mail.zhongwenmj.com/api/public/mailboxEmailList' \
  -H 'Authorization: <PUBLIC_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data-raw '{"email":"target@example.com","size":5}'
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
  "data": {
    "mailbox": {
      "email": "target@example.com",
      "exists": true,
      "type": "internal",
      "source": "cloudflare_routing"
    },
    "emails": [
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
}
```

常用字段：

`data.mailbox`：

| 字段 | 说明 |
| --- | --- |
| `email` | 查询的邮箱地址 |
| `exists` | 邮箱是否被系统认为存在 |
| `type` | 邮箱类型：`internal`、`external`、`not_found` |
| `source` | 来源：`cloudflare_routing`、`external_account`、`none` |
| `externalAccountId` | 外部邮箱账号 ID，仅外部邮箱有 |
| `name` | 外部邮箱账号名称，仅外部邮箱有 |
| `remark` | 外部邮箱备注，仅外部邮箱有 |
| `protocol` | 外部邮箱协议，仅外部邮箱有 |
| `status` | 外部邮箱状态，仅外部邮箱有 |
| `lastSyncTime` | 最近同步时间，仅外部邮箱有 |
| `lastSyncResult` | 最近同步结果，仅外部邮箱有 |
| `isFavertive` | 是否收藏，仅外部邮箱有 |

`data.emails[]`：

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

- 判断条件：邮箱地址存在于外部邮箱账号列表。
- 系统会先触发该外部账号同步一次。
- 同步数量和返回数量使用 `size` 控制。
- 同步完成后返回该外部账号最近邮件。
- 如果该账号正在同步中，可能命中同步锁；当前接口会返回已入库的最近邮件。
- 返回 `data.mailbox.type = "external"`。

如果传入的是内部邮箱：

- 判断条件：邮箱后缀命中系统配置的自营域名列表，例如当前生产配置包含 `zhongwenmj.com`。如果后续配置多个自营域名，任意一个命中都按内部邮箱处理。
- 内部邮箱默认按存在处理，不要求先在系统账号列表中创建。
- 系统不会触发外部同步。
- 直接按收件人邮箱查询最近邮件。
- 适用于 `zhongwenmj.com` 域名下由 Cloudflare Email Routing 投递到 Worker 的邮件。
- 返回 `data.mailbox.type = "internal"`。

## 6. 邮箱不在外部账号列表里会怎么样

系统按下面顺序判断：

1. 先查外部邮箱账号列表。
2. 如果存在，按外部邮箱处理，触发同步。
3. 如果不存在，再判断邮箱后缀是否属于系统域名。
4. 如果后缀属于系统域名，按内部邮箱处理，默认存在。
5. 如果后缀不属于系统域名，返回不存在。

例子：

- `abc@zhongwenmj.com`：属于内部域名，即使系统账号列表没有这个账号，也返回 `exists: true`、`type: internal`。
- `abc@gmail.com`：如果没有添加到外部邮箱账号列表，返回 `exists: false`、`type: not_found`。
- `abc@gmail.com`：如果已经添加到外部邮箱账号列表，返回 `exists: true`、`type: external`，并触发同步。

内部邮箱存在但没有邮件时：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "mailbox": {
      "email": "abc@zhongwenmj.com",
      "exists": true,
      "type": "internal",
      "source": "cloudflare_routing"
    },
    "emails": []
  }
}
```

外部邮箱未添加时：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "mailbox": {
      "email": "abc@gmail.com",
      "exists": false,
      "type": "not_found",
      "source": "none"
    },
    "emails": []
  }
}
```

如果没有传 `email`，接口会返回错误：

```json
{
  "code": 501,
  "message": "email is required"
}
```

## 7. 调用建议

验证码场景建议：

- `size` 设置为 `1` 到 `5`。
- 先按邮箱取最近邮件，再在 `subject`、`text` 中提取验证码。
- 不要高频并发请求同一个外部邮箱，避免服务商风控或同步锁。
- 外部邮箱同步可能受邮箱服务商风控、代理质量、应用专用密码状态影响。
- 判断邮箱是否存在时，看 `data.mailbox.exists`，不要用 `emails.length` 判断。

轮询建议：

- 单个邮箱建议间隔 3 秒以上。
- 如果 `data.mailbox.exists = false`，说明这个邮箱不是内部域名邮箱，并且没有添加为外部邮箱账号。
- 如果 `data.mailbox.exists = true` 但 `data.emails` 为空，说明邮箱存在，只是当前还没有邮件。
- 如果外部邮箱账号长期没有新邮件，先在后台点“测试”确认 IMAP/POP3 登录是否正常。
