# 实时运维监控仪表板

浏览器内的实时监控仪表板：后端（Node.js 20 + Fastify + WebSocket）每秒主动推送多路
系统/业务指标，前端（React + TypeScript + Vite）用折线图、仪表盘、柱状图呈现，支持
可拖拽拉伸并持久化的布局、两级阈值告警、24 小时历史回放和集中的数据源管理。

## 功能一览

- **服务端主动推送**：一条 WebSocket 长连接，约每 1 秒由服务端广播全部数据点，前端不轮询。
- **多路指标**：CPU 使用率、内存占用、网络吞吐（系统指标）+ 每秒请求数、在线人数、错误率（业务指标）。
- **数据留档**：每个点同时写入内存滚动缓冲和 `DATA_DIR/series/<id>.jsonl`，**保留最近 24 小时**，按周期压实、滚动淘汰。
- **数据源管理**：列出全部数据源及正常/异常状态；手动开/关采集（关闭后不再产生新点）；可人工注入故障/恢复。
- **图表**：折线图（近 5 分钟趋势）、圆形仪表盘（瞬时值）、柱状图（横向对比）。
- **自定义布局**：基于 React Grid Layout，可拖动、可拉伸、可增删图块，保存到后端，下次打开自动恢复。
- **告警**：规则增删改；阈值越界触发、回落解除；区分 **警告 / 严重** 两级（颜色、弹窗、徽标均不同）；
  触发时对应图表面板变色；规则改阈值后按**新阈值立即重新判定**。
- **历史回放**：选时间区间，从后端真实归档取数（不会现场造假数据），支持播放/暂停、1x/2x/5x 变速、进度拖拽。
- **无登录 / 无工单等旁支功能**。

## 目录结构

```
backend/
  src/
    config.js                     运行配置（环境变量）
    app.js                        应用装配工厂（测试可起独立实例）
    index.js                      入口
    domain/
      sourceDefinitions.js        6 路数据源定义 + 默认告警规则
      simulator.js                随机游走指标模拟器
      sourcesRegistry.js          数据源运行时状态（开关 / 健康状态）
      collector.js                周期采集管线
      seriesStore.js              指标留档（内存缓冲 + JSONL + 24h 淘汰/压实）
      alertEngine.js              告警规则 CRUD 与触发/解除判定
      configStore.js              规则与布局的持久化（config.json）
      hub.js                      WebSocket 服务端推送
    http/
      sourceRoutes.js             数据源列表/开关/故障/手工写入
      metricRoutes.js             实时/近窗数据
      historyRoutes.js            历史区间查询 + 回填（回放取数）
      alertRoutes.js              告警规则 CRUD 与告警状态
      configRoutes.js             布局存取
  test/                           node:test 自动化测试（全部打接口，不开浏览器）
frontend/
  src/
    api/client.ts                 REST 客户端
    api/useWebSocket.ts           自动重连的服务端推送连接
    store/dashboardStore.ts       zustand 全局状态（序列/告警/回放/布局）
    components/charts/            LineChart / GaugeChart / BarChart + ECharts 封装
    components/WidgetPanel.tsx    按布局配置渲染对应图表
    components/AlertRulesPanel.tsx 告警规则增删改
    components/AlertToasts.tsx    告警弹窗
    components/ActiveAlertsBar.tsx 实时告警条
    components/ReplayPlayer.tsx   历史回放播放器
    pages/DashboardPage.tsx       可拖拽布局的仪表板
    pages/SourcesPage.tsx         数据源管理页
Dockerfile                        多阶段构建（前端 build → 后端静态托管）
docker-compose.yml                一条命令拉起，/data 为持久卷
```

## 快速开始（Docker）

```bash
docker compose up --build
# 浏览器打开 http://localhost:8080
```

历史数据、告警规则、布局都保存在命名卷 `ops-data`（容器内 `/data`）中。

## 本地开发

需要 Node.js 20。

```bash
# 终端 1：后端（http://localhost:8080）
cd backend && npm install && npm run dev

# 终端 2：前端（Vite dev server，/api 与 /ws 代理到 8080）
cd frontend && npm install && npm run dev
# 打开 http://localhost:5173
```

生产模式下，后端直接托管 `frontend/dist`：

```bash
cd frontend && npm install && npm run build
cd ../backend && npm start
# http://localhost:8080
```

## 运行自动化测试

全部行为测试都在后端侧、针对真实 HTTP/WebSocket 接口执行，不需要浏览器：

```bash
./run-tests.sh
# 或
cd backend && npm test
```

覆盖的锁定行为（19 个断言）：

| 文件 | 锁定内容 |
| --- | --- |
| `test/sourceSwitch.test.js` | 手动关闭后不再新增数据点（REST 拒绝 + WS 不再推送），重新打开后恢复推送 |
| `test/alertLifecycle.test.js` | 越阈值触发对应级别告警、回落解除；警告/严重区分；改阈值后按新阈值立即判定；告警经 WS 推送 |
| `test/historyReplay.test.js` | 回放返回所选区间内后端真实归档点、空区间返回空序列、拒绝未知源、重启后仍可从磁盘读出 |
| `test/retention.test.js` | 超过 24h（及更短窗口）的旧点在读路径和磁盘压实中被滚动淘汰 |
| `test/layoutPersistence.test.js` | 布局保存/读取、非法载荷拒绝、重启后布局与规则仍在 |

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| WS | `/ws` | 连接即收 snapshot；之后服务端持续推 `point` / `sources` / `alert-fired` / `alert-resolved` |
| GET | `/api/sources` | 数据源列表（开关、状态、最新值） |
| POST | `/api/sources/:id/enabled` | `{enabled:boolean}` 采集开关 |
| POST | `/api/sources/:id/status` | 人工设置 `ok/error` |
| POST | `/api/sources/:id/ingest` | 写入一个实时数据点（测试/联调用） |
| GET | `/api/metrics/recent?windowMs=` | 最近窗口数据 |
| GET | `/api/history?from=&to=&sources=` | **回放用**：取真实归档区间点 |
| POST | `/api/history/backfill` | 归档历史点（不触发告警/不实时推送） |
| GET/POST/PUT/DELETE | `/api/alerts/rules[/:id]` | 告警规则增查改删 |
| GET | `/api/alerts/active`、`/api/alerts/events` | 当前告警 / 生命周期事件 |
| GET/PUT | `/api/layout` | 布局读取/保存 |

## 关键环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 监听端口 |
| `DATA_DIR` | `backend/data` | 历史归档与配置落盘目录（compose 中为 `/data` 卷） |
| `TICK_INTERVAL_MS` | `1000` | 采集/推送周期 |
| `RETENTION_MS` | `86400000` | 历史保留窗口（默认 24h） |
| `AUTO_FAULTS` | `true` | 演示模式下偶发自恢复故障 |
