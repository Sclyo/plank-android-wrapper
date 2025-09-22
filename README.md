# PlankAI Android Wrapper

This repo hosts the **Android wrapper app** for PlankAI.

- Loads the PlankAI web app from `app/src/main/assets/www/` using a WebView.
- Handles camera permissions and routing between native Android and the web app.
- The web frontend is **not** tracked here (only the compiled assets are bundled).

## Build

1. Open this repo in **Android Studio**.
2. Sync Gradle.
3. Run on an emulator or physical Android device (SDK 24+).

## Notes

- `.gitignore` excludes build artifacts and the old `web/` submodule.
- Default branch: `main`.
