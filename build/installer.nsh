; Runtime uses the same explicit name and argument-free command in src/main/startup.ts.
; An independent marker remembers opt-out even when the Run value was removed.
!define BUDDY_STARTUP_NAME "Research Buddy"
!define BUDDY_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define BUDDY_STARTUP_KEY "Software\com.researchbuddy.desktop\Startup"

!ifndef BUILD_UNINSTALLER
  Var buddyStartupInitialized
  Var buddyPreviousStartup
  Var buddyPreviousInstall
!endif

!macro customInit
  ReadRegDWORD $buddyStartupInitialized HKCU "${BUDDY_STARTUP_KEY}" "Initialized"
  ReadRegStr $buddyPreviousStartup HKCU "${BUDDY_RUN_KEY}" "${BUDDY_STARTUP_NAME}"
  ReadRegStr $buddyPreviousInstall HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${if} $buddyPreviousInstall == ""
    ReadRegStr $buddyPreviousInstall HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${endif}
!macroend

!macro customInstall
  ; First installation enables startup. Reinstalls/upgrades keep a removed entry
  ; removed and leave Windows StartupApproved (Task Manager opt-out) untouched.
  ${if} $buddyStartupInitialized != "1"
  ${andIf} $buddyPreviousStartup == ""
    WriteRegStr HKCU "${BUDDY_RUN_KEY}" "${BUDDY_STARTUP_NAME}" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\"'
  ${elseif} $buddyPreviousStartup == '$\"$buddyPreviousInstall\${APP_EXECUTABLE_FILENAME}$\"'
  ${orIf} $buddyPreviousStartup == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\"'
  ${orIf} $buddyPreviousStartup == '$\"$buddyPreviousInstall\${APP_EXECUTABLE_FILENAME}$\" --startup'
  ${orIf} $buddyPreviousStartup == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" --startup'
    ; Refresh owned commands after moving, including the legacy startup switch.
    WriteRegStr HKCU "${BUDDY_RUN_KEY}" "${BUDDY_STARTUP_NAME}" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\"'
  ${endif}
  WriteRegDWORD HKCU "${BUDDY_STARTUP_KEY}" "Initialized" 1
!macroend

!macro customUnInstall
  ; The old uninstaller runs during an upgrade; retain startup and its opt-out.
  ${ifNot} ${isUpdated}
    ReadRegStr $0 HKCU "${BUDDY_RUN_KEY}" "${BUDDY_STARTUP_NAME}"
    ${if} $0 == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\"'
    ${orIf} $0 == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" --startup'
      DeleteRegValue HKCU "${BUDDY_RUN_KEY}" "${BUDDY_STARTUP_NAME}"
    ${endif}
    DeleteRegKey HKCU "${BUDDY_STARTUP_KEY}"
  ${endif}
!macroend
