; NOTE: This file is included into electron-builder's generated NSIS script.
; Keep it LIMITED to small safe hooks only.
; Do NOT add Pages/Sections/File commands, otherwise you can break installation.

; Prevent common "cannot install" failures when updating while the app is running.
; Keep init non-interactive so silent installs (/S) stay silent.
!macro customInit
	; Ignore errors if Cleo is not running or cannot be terminated.
	ExecWait '"$SYSDIR\\taskkill.exe" /IM "Cleo.exe" /T /F' $0
!macroend
