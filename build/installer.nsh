; 卸载时可选清理：应用配置 / 已下载视频
; yt-dlp、ffmpeg 等依赖随安装目录删除，无单独缓存目录
; 重新安装时：同版本修复 / 升级 / 降级提示，并强制覆盖原安装目录

; electron-builder 未引入 WordFunc，需自行 include 并注册宏
!include "WordFunc.nsh"
!insertmacro VersionCompare
!insertmacro WordReplace

!macro customInit
  ; 读取已安装版本与安装目录（优先当前用户，其次本机）
  StrCpy $R7 ""
  StrCpy $R8 ""

  ReadRegStr $R7 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ReadRegStr $R8 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $R7 == ""
    ReadRegStr $R7 HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ReadRegStr $R8 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}

  ${If} $R7 != ""
    ; 去掉安装路径两端引号
    ${WordReplace} $R8 '"' "" "+" $R8

    ${VersionCompare} "$R7" "${VERSION}" $R9
    ; $R9 = 0 相同；1 已装更高；2 安装包更高（升级）

    ${If} $R9 == "0"
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_TOPMOST \
        "已安装相同版本 ${VERSION}。$\r$\n$\r$\n是否修复（覆盖安装到原目录，不额外占用第二份空间）？$\r$\n选择「否」将取消安装。" \
        /SD IDYES IDYES keep_going_same
      Abort
      keep_going_same:
    ${ElseIf} $R9 == "1"
      MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_TOPMOST \
        "检测到已安装更高版本 $R7。$\r$\n当前安装包为 ${VERSION}（降级到旧版本）。$\r$\n$\r$\n是否覆盖安装到原目录？$\r$\n选择「否」将取消安装。" \
        /SD IDNO IDYES keep_going_down
      Abort
      keep_going_down:
    ${Else}
      MessageBox MB_YESNO|MB_ICONINFORMATION|MB_TOPMOST \
        "检测到已安装版本 $R7。$\r$\n将升级到 ${VERSION}，并覆盖原安装目录。$\r$\n$\r$\n是否继续？" \
        /SD IDYES IDYES keep_going_up
      Abort
      keep_going_up:
    ${EndIf}

    ; 强制使用原安装目录，避免装到别处占两份空间
    ${If} $R8 != ""
      StrCpy $INSTDIR "$R8"
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否删除应用配置与个人信息？$\r$\n（设置、代理偏好等）" \
    /SD IDNO IDNO skip_userdata
    RMDir /r "$APPDATA\video-downloader"
    RMDir /r "$APPDATA\泽晟视频下载器"
  skip_userdata:

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否删除本机已下载的视频？$\r$\n（将清理默认目录，并尝试读取配置中的保存路径）" \
    /SD IDNO IDNO skip_videos

    StrCpy $1 ""
    IfFileExists "$APPDATA\video-downloader\download-dir.txt" 0 check_cn_cfg
      FileOpen $0 "$APPDATA\video-downloader\download-dir.txt" r
      FileRead $0 $1
      FileClose $0
      Goto do_remove_videos
    check_cn_cfg:
    IfFileExists "$APPDATA\泽晟视频下载器\download-dir.txt" 0 do_remove_videos
      FileOpen $0 "$APPDATA\泽晟视频下载器\download-dir.txt" r
      FileRead $0 $1
      FileClose $0
    do_remove_videos:
    StrCmp $1 "" skip_custom_dir
      ; 去掉末尾换行
      StrCpy $2 $1 1 -1
      StrCmp $2 "$\n" 0 +2
        StrCpy $1 $1 -1
      StrCpy $2 $1 1 -1
      StrCmp $2 "$\r" 0 +2
        StrCpy $1 $1 -1
      RMDir /r "$1"
    skip_custom_dir:
    RMDir /r "$PROFILE\Videos\泽晟视频下载器"
    RMDir /r "$PROFILE\视频\泽晟视频下载器"
  skip_videos:
!macroend
