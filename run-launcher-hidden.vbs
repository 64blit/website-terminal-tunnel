' Launches the web-terminal keep-alive loop with NO console window.
CreateObject("Wscript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\admin\web-terminal\start_web_terminal.ps1""", 0, False
