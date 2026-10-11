Guitar Stem Studio
==================

Windows
  1. Unzip this folder anywhere (e.g. Documents).
  2. Double-click  GuitarStemStudio.exe
     If "Windows protected your PC" appears: click "More info" -> "Run anyway".
  3. Your browser opens http://localhost:8000 . Keep the black window open while you use the app;
     close it to quit.

macOS
  1. Unzip, then open Terminal and run once (removes the "downloaded from the internet" block):
       xattr -dr com.apple.quarantine ~/Downloads/GuitarStemStudio
     (adjust the path if you moved the folder)
  2. Double-click  GuitarStemStudio  inside the folder. A Terminal window opens and the browser
     goes to http://localhost:8000 . Close the Terminal window to quit.

First run
  The first song you process downloads the AI model (~80 MB) - this needs an internet connection.
  Processing a 4-minute song takes roughly 3-8 minutes on a CPU.

Your songs are stored in
  Windows: %LOCALAPPDATA%\GuitarStemStudio
  macOS:   ~/Library/Application Support/GuitarStemStudio

https://github.com/un4ckn0wl3z/guitar-stem-studio
