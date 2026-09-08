@echo off
chcp 65001 >nul
REM ============================================
REM  一键新建文章: new.bat <英文slug> [中文标题]
REM  示例: new.bat my-new-post 我的新文章
REM ============================================
if "%~1"=="" (
    echo 用法: new.bat ^<英文slug^> [中文标题]
    echo 示例: new.bat my-post 我的新文章
    exit /b 1
)

set "SLUG=%~1"
set "TITLE=%~2"
if "%TITLE%"=="" set "TITLE=%SLUG%"

set "DIR=content\cn\post\%SLUG%"
if exist "%DIR%" (
    echo [错误] 文章目录已存在: %DIR%
    exit /b 1
)

mkdir "%DIR%"

REM 生成当天日期 (YYYY-MM-DD)
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%i"

(
echo ---
echo title: "%TITLE%"
echo author: "chenyuan"
echo description: ""
echo date: %TODAY%
echo image: ""
echo tags: [
echo ]
echo categories: [
echo ]
echo ---
echo.
) > "%DIR%\index.md"

echo [完成] 文章骨架已创建:
echo   %DIR%\index.md
echo.
echo 下一步:
echo   1. 编辑 %DIR%\index.md 写正文, 图片放同目录
echo   2. 运行 hugo server 预览: ..\hugo\hugo.exe server -D
echo   3. 构建并发布: 双击 push.bat
