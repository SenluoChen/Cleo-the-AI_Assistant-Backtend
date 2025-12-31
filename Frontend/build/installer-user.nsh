; Force per-user install (no admin/UAC) by requiring user execution level.
; This prevents Windows from requesting credentials when the installer is run normally.
RequestExecutionLevel user

; Keep existing safe hooks (e.g. kill running app before update)
!include "${BUILD_RESOURCES_DIR}\\installer.nsh"

!macro customInstall
	; Write key to user profile so the installed app can read it at startup.
	CreateDirectory "$LOCALAPPDATA\\SmartAssistantDesktop"
	FileOpen $0 "$LOCALAPPDATA\\SmartAssistantDesktop\\cleo.env" w
	ReadEnvStr $1 "OPENAI_API_KEY"
	StrCmp $1 "" cleo_env_missing cleo_env_present

	cleo_env_missing:
	  FileWrite $0 "OPENAI_API_KEY=$\r$\n"
	  FileWrite $0 "MOCK_OPENAI=true$\r$\n"
	  Goto cleo_env_done

	cleo_env_present:
	  FileWrite $0 "OPENAI_API_KEY=$1$\r$\n"
	  FileWrite $0 "MOCK_OPENAI=false$\r$\n"

	cleo_env_done:
	FileClose $0
!macroend
