# 日程预约

一个轻量本地网页应用，可以维护需要被预约的用户，录入申请人、日期、开始时间、结束时间和可选原因，并生成 Apple Calendar 可识别的 ICS 日历。

## 功能

- 添加需要预约的用户。
- 每条预约绑定到一个预约用户。
- 用户列表支持快速预约、订阅和删除。
- 支持全部预约日历订阅。
- 支持每个预约用户独立的 Apple Calendar 订阅地址。

## 运行

```bash
./start.sh
```

默认地址：

```text
http://localhost:3000
```

如果你已经安装了 Node.js，也可以运行：

```bash
npm start
```

## Docker 镜像部署

构建镜像：

```bash
docker build -t apple-calendar-scheduler .
```

直接运行：

```bash
docker run -d \
  --name apple-calendar-scheduler \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  apple-calendar-scheduler
```

访问：

```text
http://localhost:3000
```

Apple 日历订阅地址：

```text
http://你的服务器地址:3000/calendar.ics
```

预约数据保存在挂载的 `data/bookings.json`，预约用户保存在 `data/users.json`，容器升级或重启后不会丢失。

## Vercel 部署

项目在本地默认使用 `data/bookings.json` 和 `data/users.json` 保存数据；部署到 Vercel 时，建议使用 Vercel Blob 做持久化存储。

1. 把项目上传到 GitHub。
2. 在 Vercel 导入这个 GitHub 仓库。
3. 在项目的 Storage 页面选择 Create Database，创建 Blob Store。
4. 建议选择 Private access。
5. 把 Blob Store 连接到当前项目，让 Vercel 自动提供 `BLOB_STORE_ID` 和 `VERCEL_OIDC_TOKEN`。
6. 重新部署项目。

如果你创建的是 Public Blob Store，需要在 Vercel 项目环境变量中添加：

```text
BLOB_ACCESS=public
```

默认 Blob 数据路径是：

```text
apple-calendar-scheduler/data/users.json
apple-calendar-scheduler/data/bookings.json
```

如需改路径前缀，可以设置：

```text
BLOB_DATA_PREFIX=你的路径前缀
```

如果 Vercel 上没有配置 Blob 凭证，页面可以打开，但新增、删除数据会返回明确的存储配置错误。

## Apple 日历

- 单条预约：在预约列表点击“下载 ICS”，用 Apple 日历打开即可导入。
- 全部预约：订阅 `http://localhost:3000/calendar.ics`。
- 单个用户：在页面的“订阅地址”区域选择对应预约用户，复制或打开该用户的独立订阅地址。

如果要让 Mac、iPhone 等多设备自动同步，需要把这个服务部署到设备可访问的 HTTPS 地址，然后在 Apple 日历里订阅该地址。
# apple-calendar-scheduler
