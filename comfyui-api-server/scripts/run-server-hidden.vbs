' 后台（无控制台窗口）启动 comfyui-api-server。
' 与 run-comfyui-hidden.vbs 同一套路：wscript 起一个隐藏的 cmd 去跑 start-server.bat，
' 这样即使调用方（资源管理器 / 计划任务 / 其他进程）退出，服务也不会跟着被带走。
'
' 用法：  wscript.exe scripts\run-server-hidden.vbs
' 停止：  stop-server.bat
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
WshShell.CurrentDirectory = repo
WshShell.Run "cmd /c """ & repo & "\start-server.bat"" hidden", 0, False
