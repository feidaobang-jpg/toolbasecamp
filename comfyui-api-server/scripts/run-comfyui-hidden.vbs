Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
WshShell.CurrentDirectory = repo
WshShell.Run "cmd /c """ & repo & "\scripts\run-comfyui-autostart.bat""", 0, False
