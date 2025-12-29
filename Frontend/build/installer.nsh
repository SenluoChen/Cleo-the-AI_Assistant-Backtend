; NOTE: This file is included into electron-builder's generated NSIS script.
; Keep it LIMITED to UI/wording tweaks and small safe hooks.
; Do NOT add Pages/Sections/File commands, otherwise you can break
; installation/uninstallation on other machines.

!include "MUI2.nsh"

; Small Modern UI tweaks (safe)
!define MUI_ABORTWARNING
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT

; Use NSIS built-in bitmaps so we don't require extra image assets.
; (These are compiled into the installer at build time.)
!ifndef MUI_HEADERIMAGE_BITMAP
	!define MUI_HEADERIMAGE_BITMAP "${NSISDIR}\\Contrib\\Graphics\\Header\\nsis.bmp"
!endif

; electron-builder may already define this (e.g. nsis3-metro.bmp)
!ifndef MUI_WELCOMEFINISHPAGE_BITMAP
	!define MUI_WELCOMEFINISHPAGE_BITMAP "${NSISDIR}\\Contrib\\Graphics\\Wizard\\modern.bmp"
!endif

; Do not insert MUI_LANGUAGE here. electron-builder manages languages/pages
; and NSIS will treat ordering warnings as errors in this build.

; Prevent common "cannot install" failures when updating while the app is running.
; This does not modify file install logic; it only attempts to close/kill the app.
!macro customInit
	; Ignore errors if the process is not running.
	ExecWait '"$SYSDIR\\taskkill.exe" /IM "Cleo.exe" /T /F' $0
!macroend
