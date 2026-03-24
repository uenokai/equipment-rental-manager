# -*- mode: python ; coding: utf-8 -*-
"""
機材レンタル管理 - PyInstaller ビルド設定

使用方法:
  venv\Scripts\pyinstaller.exe build.spec
"""

import os

# プロジェクトルートのパス
PROJECT_ROOT = os.path.dirname(os.path.abspath(SPEC))

a = Analysis(
    [os.path.join(PROJECT_ROOT, 'src', 'app.py')],
    pathex=[os.path.join(PROJECT_ROOT, 'src')],
    binaries=[],
    datas=[
        # テンプレートと静的ファイルを同梱
        (os.path.join(PROJECT_ROOT, 'src', 'templates'), 'templates'),
        (os.path.join(PROJECT_ROOT, 'src', 'static'), 'static'),
    ],
    hiddenimports=[
        'webview',
        'clr',                                    # pywebviewがWindows環境で使用
        'dotenv',                                 # python-dotenv
        'azure.ai.documentintelligence',
        'azure.ai.documentintelligence.models',
        'azure.core.credentials',
        'azure.core.pipeline',
        'azure.core.pipeline.transport',
        'azure.core.pipeline.policies',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='機材レンタル管理',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,      # ターミナルウィンドウを表示しない
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
