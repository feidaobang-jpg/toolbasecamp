# 软件下载模块（Downloads）

前台「下载」页 + 后台管理，支持**服务器直链文件**与**网盘/官网外链**两种来源。

- 前台：`public/downloads.html`（导航第 6 项「下载」，i18n 已双语）
- 后台：`public/html/admin/private/downloads.html`（后台 hub「站点运维」分组）
- 服务端：`server/downloads.py`（router prefix `/downloads`，挂到 `/api/downloads`）
- nginx：`deploy/patch-nginx-downloads.sh`（deploy.yml 已自动执行）

## 存储与下载链路

```
后台上传 → /opt/toolbasecamp-downloads/files/<uuid>.<ext>
公开下载 → GET /api/downloads/{id}/file   （FastAPI 记一次下载数）
          → X-Accel-Redirect: /downloads-internal/<file>   （nginx 内部直发，不占 Python）
```

- `DOWNLOADS_DIR`（默认 `/opt/toolbasecamp-downloads`），`files/` 存文件，`chunks/` 存分片
- `DOWNLOADS_XACCEL_PREFIX`（默认空 = FileResponse 兜底；打完 nginx 补丁后
  `patch-nginx-downloads.sh` 会把 `/downloads-internal` 写进 `/etc/toolbasecamp-api.env`）
- nginx 侧 `location /downloads-internal/` 是 `internal`，只能由 API 的 X-Accel 触达，无法绕过计数直链

## 上传：分片，绕开 Cloudflare 100MB 限制

Cloudflare 免费版单请求体上限 100MB，大文件直传必挂。后台 JS 的流程：

1. `POST /api/downloads/admin/upload/init` `{fileName, totalSize}` → 服务端按
   `DOWNLOADS_CHUNK_MB`（默认 8MB）算 `totalChunks` 并返回 `chunkSize`
2. 逐片 `POST /api/downloads/admin/upload/chunk`（multipart，`uploadId` + `index`）
3. `POST /api/downloads/admin/upload/finalize` `{uploadId, totalSize, fileName, meta}`
   → 校验分片齐全与总大小 → 合并 + SHA256 → 入库

小文件也可走单发接口 `POST /api/downloads/admin/upload`（multipart 一次传完）。
`chunks/` 里超过 24h 的半成品会在下次 init 时被清掉。

## 数据表

MySQL `downloads`（`ensure_downloads_tables`，挂在 main.py `ensure_tables()`）：
标题/版本/分类/简介/`source_url`/`source_type`(server|external)/`file_name`/`orig_name`/
`file_size`/`sha256`/`download_count`/`sort_order`/`status`(published|hidden)。

## API 一览

公开：

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/downloads` | 已上架列表（含 `url`：服务器文件为 `/downloads/{id}/file` 相对路径，外链为完整 URL） |
| GET | `/api/downloads/{id}/file` | 下载并计数；外链条目 302 到 `source_url` |

管理（JWT admin）：

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/downloads/admin/list` | 全量列表（含隐藏） |
| POST | `/api/downloads/admin` | 新建外链条目 |
| PUT | `/api/downloads/admin/{id}` | 编辑元数据 / 状态 / 排序 |
| DELETE | `/api/downloads/admin/{id}` | 删除行 + 磁盘文件 |
| POST | `/api/downloads/admin/upload` | 单发小文件上传 |
| POST | `/api/downloads/admin/upload/init` / `chunk` / `finalize` | 分片上传 |

编辑**不更换**文件；要换文件就删除重建。文件一律 `application/octet-stream` +
`Content-Disposition: attachment` 下发，扩展名黑名单（html/svg/php 等）只入不带执行风险的裸文件。

## 备注

- 版权：自研随便放；第三方免费软件保留原包并注明来源，不放破解版
- 带宽：DO 按 TB 计费；如需省流量可在 Cloudflare 对 `/downloads-internal/` 加 Cache Rule
- 大文件镜像：条目直接填网盘外链即可，零服务器成本
