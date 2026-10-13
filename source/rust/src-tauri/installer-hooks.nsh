; The default template leaves the executable path unquoted in file associations.
; Override it after registry registration so install/file paths with spaces work.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHELL_CONTEXT "Software\Classes\MarkUpViewer.Markdown\shell\open\command" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\MarkUpViewer.Markdown\DefaultIcon" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0'
  !insertmacro UPDATEFILEASSOC
!macroend
