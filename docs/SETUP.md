# Trading Lab: setup

Three parts: the Drive backend, the web app, and (optionally) the Android app. Do them in this order.

## 1. Backend (your Google Drive)

1. Go to https://script.google.com and press **New project**. Name it "Trading Lab backend".
2. Delete the sample code and paste in everything from `backend/Code.gs`. Save.
3. In the function picker choose **setup** and press **Run**. Allow the permissions it asks for (Drive and external requests).
4. Open **Execution log**. Copy the `ACCESS_KEY` line. This one key opens the whole app. Keep it private.
   (Run `showKey` any time to see it again. Run `setKey('your own key, 16+ characters')` to choose your own.)
5. **Deploy > New deployment > Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and copy the **/exec** URL.
6. A folder "Trading Lab Data" with the file `trading-lab-data.json` now exists in your My Drive. The app saves your trades there, and Drive keeps 30 daily copies.

The key stops strangers: the URL alone reads and writes nothing. If the key leaks, run `setKey(...)` with a new one and reconnect your devices.

## 2. Web app

The app is the files in this folder. There is no build.

- Put the folder on any static host (GitHub Pages, Netlify, your own server). It must be served over HTTPS for "Add to Home screen" and offline use.
- Open it. Go to **Settings > Connect**, paste the /exec URL and the key. Your data is created on first save.
- To connect another device in one tap, open `https://YOUR-HOST/#/dashboard?u=<exec URL>&k=<key>` on it. The link is used once and removed from the address bar. Treat that link like the key.

To try it on your own computer: `python3 -m http.server 8080` in this folder, then open http://localhost:8080.

## 3. Android app

You need Node 22+, Android Studio (or JDK 21 and the Android SDK).

    npm install
    npm run android:debug        # builds a debug APK
    npm run android:open         # or open the project in Android Studio

The debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. For a release build run `npm run android:release` and sign it with your own keystore (not included).

The app id is `com.tradinglab.app`. The version code comes from `js/version.js`: raise `VERSION` before each new build so Android accepts it as an update.

## Updating the backend (when a new version adds features)
Version 1.2 adds `fundsearch` and `fundnav` (mutual funds). Paste the new `backend/Code.gs`, then Deploy > Manage deployments > Edit > New version. Without it the Funds tab says the action is unknown.


Paste the new `backend/Code.gs` over the old code, save, then **Deploy > Manage deployments > pencil > Version: New version > Deploy**. The /exec URL and the key stay the same. Version 1.1 needs this for price history and company figures.

## Prices

Prices come through your backend from Yahoo Finance (free, unofficial). Indian shares try `SYMBOL.NS` then `SYMBOL.BO`. For anything else type the Yahoo ticker as the symbol (for example `AAPL` or `^NSEI`). Without a connected backend you can still trade at your own price. Nothing is fetched automatically: press *Refresh prices* (or pull down on Android) when you want current prices. Chart history and company figures load per share with *Load chart & fundamentals* on its page.
