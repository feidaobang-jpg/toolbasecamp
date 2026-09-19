# 脚本文件说明

本目录包含多个便捷脚本，帮助您快速管理 ComfyUI API Server。

## 📋 脚本清单

### 🚀 启动类脚本

| 文件名 | 类型 | 说明 | 推荐场景 |
|--------|------|------|----------|
| `start-server.bat` | 批处理 | 启动服务（显示控制台窗口） | 日常使用、调试 |
| `start-server.ps1` | PowerShell | 启动服务（彩色输出） | PowerShell 用户 |
| `start-server-hidden.vbs` | VBScript | 后台启动（无窗口） | 开机自启、后台运行 |

### ⚙️ 管理类脚本

| 文件名 | 类型 | 说明 |
|--------|------|------|
| `install-dependencies.bat` | 批处理 | 安装 Python 依赖 |
| `install-autostart.bat` | 批处理 | 安装开机自启动 |
| `uninstall-autostart.bat` | 批处理 | 卸载开机自启动 |
| `check-server.bat` | 批处理 | 检查服务运行状态 |
| `stop-server.bat` | 批处理 | 停止运行中的服务 |

### 📄 文档类文件

| 文件名 | 说明 |
|--------|------|
| `README.md` | 详细文档 |
| `使用说明.txt` | 快速参考指南 |
| `SCRIPTS.md` | 本文件 - 脚本说明 |

---

## 🎯 使用流程

### 首次使用

```
1. install-dependencies.bat    # 安装依赖
2. start-server.bat            # 启动服务测试
3. install-autostart.bat       # 可选：安装开机自启
```

### 日常使用

#### 方案 A：手动启动
```
start-server.bat               # 需要时双击启动
```

#### 方案 B：开机自启
```
install-autostart.bat          # 一次性安装
                              # 之后每次开机自动启动
```

### 维护管理

```
check-server.bat              # 检查服务状态
stop-server.bat               # 停止服务
uninstall-autostart.bat       # 卸载自启动
```

---

## 📝 详细说明

### start-server.bat

**用途：** 启动 FastAPI 服务器（带控制台窗口）

**特点：**
- ✅ 显示详细的启动信息
- ✅ 可以看到实时日志
- ✅ 方便调试问题
- ✅ Ctrl+C 停止服务

**使用：** 双击运行

**输出示例：**
```
========================================
  ComfyUI Image Processor API Server
========================================

检查 Python 环境...
Python 3.11.0

启动 FastAPI 服务器...
服务地址: http://localhost:5000
API 文档: http://localhost:5000/docs
```

---

### start-server.ps1

**用途：** PowerShell 版本的启动脚本

**特点：**
- ✅ 彩色输出，更美观
- ✅ 更强大的错误处理
- ✅ 适合 PowerShell 用户

**使用：** 右键 -> 使用 PowerShell 运行

**注意：** 如果提示"无法加载脚本"，需要先允许执行策略：
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

### start-server-hidden.vbs

**用途：** 后台启动服务（完全无窗口）

**特点：**
- ✅ 不显示任何窗口
- ✅ 适合开机自启动
- ✅ 不干扰工作

**使用：** 双击运行（无任何提示）

**检查是否启动：** 运行 `check-server.bat`

---

### install-dependencies.bat

**用途：** 一键安装所有 Python 依赖

**流程：**
1. 检查 Python 环境
2. 检查 pip
3. 安装 requirements.txt 中的依赖

**使用：** 双击运行

**注意：** 首次使用时必须运行

---

### install-autostart.bat

**用途：** 安装开机自启动

**工作原理：**
1. 在 Windows 启动文件夹创建快捷方式
2. 快捷方式指向 `start-server-hidden.vbs`
3. 开机后自动后台启动服务

**位置：**
```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

**使用：** 双击运行

**验证：**
- 重启电脑
- 运行 `check-server.bat` 检查

---

### uninstall-autostart.bat

**用途：** 卸载开机自启动

**操作：** 删除启动文件夹中的快捷方式

**使用：** 双击运行

---

### check-server.bat

**用途：** 检查服务是否运行

**检测方式：** 访问 `http://localhost:5000/health`

**输出示例：**
```
✓ 服务器正在运行

访问以下地址:
  - 主页: http://localhost:5000
  - 健康检查: http://localhost:5000/health
  - API 文档: http://localhost:5000/docs
```

---

### stop-server.bat

**用途：** 停止运行中的服务

**流程：**
1. 查找运行中的 Python 进程
2. 确认是否停止
3. 终止进程

**使用：** 双击运行

**注意：** 会提示确认，避免误操作

---

## ⚠️ 常见问题

### Q1: 双击 .bat 文件一闪而过

**A:** 文件内已包含 `pause`，如果仍然一闪而过：
- 可能是路径问题
- 尝试右键 -> 以管理员身份运行

### Q2: PowerShell 脚本无法运行

**A:** 需要修改执行策略：
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Q3: 自启动不生效

**A:** 检查：
1. 是否已运行 `install-autostart.bat` / `install-all-autostart.bat`
2. 「启动」里 `ComfyUI-API-Server.vbs` 是否为**绝对路径**指向本仓库 `start-server.bat`（旧版相对路径复制到 Startup 会找不到 bat）
3. 重新运行安装脚本覆盖 Startup 条目
4. 网站连不上 `https://comfy.zhengxiaohui.cn` 时：本机 `:5000` 只是一半，**Tunnel 需单独启动**（自启不含 Tunnel）
5. 不需要自启时用 `uninstall-autostart.bat` 卸掉即可，**不必删仓库里的 bat**

### Q4: 如何查看服务日志

**A:** 
- 使用 `start-server.bat`（显示窗口版本）
- 或在后台运行时，日志会输出到 Python 进程

---

## 💡 使用建议

### 开发环境
推荐使用：`start-server.bat`
- 方便查看日志
- 方便调试
- 需要时启动

### 生产环境
推荐使用：`install-autostart.bat` + `start-server-hidden.vbs`
- 开机自启
- 后台运行
- 不干扰工作

### 临时测试
推荐使用：`python app.py`
- 命令行直接运行
- 最简单直接

---

## 🔗 相关文档

- [README.md](./README.md) - 完整文档
- [使用说明.txt](./使用说明.txt) - 快速参考
- [../README.md](../README.md) - 项目总文档
