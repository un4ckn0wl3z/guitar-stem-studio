# PyInstaller spec — build with:  pyinstaller guitar-stem-studio.spec --noconfirm
# Produces dist/GuitarStemStudio/ (one-folder app) for the current OS.
import sys
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = [("static", "static")]
binaries = []
hiddenimports = ["app", "processing", "backing", "i18n"]

for pkg in ("demucs", "librosa", "yt_dlp", "yt_dlp_ejs", "imageio_ffmpeg", "soundfile", "lazy_loader"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

hiddenimports += collect_submodules("uvicorn")
hiddenimports += ["multipart", "python_multipart"]

# Deno: JavaScript runtime yt-dlp needs for YouTube
try:
    import deno

    binaries.append((deno.find_deno_bin(), "bin"))
except Exception as e:  # noqa: BLE001
    print("WARNING: deno not bundled:", e)

a = Analysis(
    ["launcher.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "matplotlib", "IPython", "jupyter", "notebook", "pytest", "tensorboard",
              "torchvision", "torch.utils.tensorboard"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="GuitarStemStudio",
    console=True,  # the console window shows the URL; closing it quits the app
    icon=None,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="GuitarStemStudio")
