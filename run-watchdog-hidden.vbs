' Launches the web-terminal watchdog with NO console window (scheduled tasks
' running powershell.exe directly flash a console at the interactive desktop).
CreateObject("Wscript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\admin\web-terminal\watchdog_web_terminal.ps1""", 0, False
