# ComfyUI Image Processor API

这是一个使用 FastAPI 构建的图片处理服务，连接到 ComfyUI 后端进行图片背景移除。

## 项目结构

```
static-page/
├── web-tool/              # 前端静态页面
│   ├── css/
│   ├── html/
│   ├── js/
│   └── index.html
└── comfyui-api-server/    # 后端服务（本项目）
    ├── work-flow/         # 工作流配置文件夹
    │   └── rembg.json
    ├── app.py
    ├── requirements.txt
    └── README.md
```

## 安装依赖

```bash
pip install -r requirements.txt
```

## 运行服务

### 方式 1：使用启动脚本（推荐）

**Windows 批处理文件：**
```bash
# 双击运行
start-server.bat
```

**PowerShell 脚本：**
```powershell
# 右键 -> 使用 PowerShell 运行
.\start-server.ps1
```

### 方式 2：后台运行（无窗口）
```bash
# 双击运行，服务将在后台启动
start-server-hidden.vbs
```

### 方式 3：直接运行 Python
```bash
python app.py
```

### 方式 4：使用 uvicorn
```bash
uvicorn app:app --host 0.0.0.0 --port 5000 --reload
```

服务将在 http://localhost:5000 启动

## 开机自启动

### 安装自启动（Windows）

1. **双击运行安装脚本：**
   ```
   install-autostart.bat
   ```

2. 脚本会自动在启动文件夹创建快捷方式

3. 重启电脑后服务将自动启动

### 卸载自启动

```
uninstall-autostart.bat
```

### 检查服务状态

```
check-server.bat
```

## API 端点

### 1. 根端点
- **URL**: `GET /`
- **描述**: 返回 API 信息和可用端点列表

### 2. 健康检查
- **URL**: `GET /health`
- **描述**: 检查服务状态和 ComfyUI 连接配置

### 3. 移除背景
- **URL**: `POST /remove-bg`
- **描述**: 上传图片并移除背景
- **参数**: 
  - `image`: 图片文件 (multipart/form-data)
- **返回**: 
  ```json
  {
    "success": true,
    "image_data": "data:image/png;base64,..."
  }
  ```

## 自动生成的 API 文档

FastAPI 自动生成交互式 API 文档：

- **Swagger UI**: http://localhost:5000/docs
- **ReDoc**: http://localhost:5000/redoc

## 配置

在 `app.py` 中修改以下配置：

```python
COMFYUI_SERVER_ADDRESS = "127.0.0.1:8188"  # ComfyUI 服务地址
```

## 依赖说明

- **fastapi**: Web 框架
- **uvicorn**: ASGI 服务器
- **python-multipart**: 文件上传支持
- **requests**: HTTP 请求库
- **websocket-client**: WebSocket 客户端

## 前后端分离部署

### 开发环境
- 前端：直接用浏览器打开 `web-tool/index.html`
- 后端：在本目录运行 `python app.py`

### 生产环境
- 前端：部署到静态文件服务器（Nginx/Apache/CDN）
- 后端：部署到应用服务器，使用 gunicorn 或 uvicorn

## 注意事项

1. 确保 ComfyUI 服务已启动并运行在配置的地址上
2. 确保 `rembg.json` 工作流文件存在于本目录中
3. 生产环境中建议修改 CORS 配置，限制允许的来源域名
4. 前端代码中的 API 地址需要根据部署环境调整
