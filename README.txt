OMAXFX SIMULATOR - OFFLINE QUICK GUIDE
======================================

IMPORTANT
---------
This project includes its market-data CSV files in public\data.
After the one-time setup below, you can use OmaxFX without an internet
connection. Do not delete the public\data folder.

ONE-TIME SETUP (while internet is available)
--------------------------------------------
1. Install Node.js 20 or newer on Windows:
   https://nodejs.org/

2. Extract the complete OmaxFX ZIP file to a normal folder, for example:
   C:\OmaxFX

3. Open that folder in File Explorer.

4. Click the address bar, type cmd, and press Enter.

5. In the Command Prompt window, run:
      npm ci

   Wait for the installation to finish. This downloads the project
   dependencies once. You do NOT need to repeat this for every launch.

6. Build the offline-ready application:
      npm run build:offline

   Wait until Vite reports that the production build completed.

START OMAXFX OFFLINE (no internet required)
-------------------------------------------
1. Make sure the computer is offline if you wish.
2. Double-click START_OFFLINE.bat in the project folder.
3. Keep the black command window open while using OmaxFX.
4. Open this address in Chrome or Edge:
      http://localhost:4173
5. To close OmaxFX, close the browser tab and then the command window.

EVERYDAY USE
------------
- After the one-time setup and build, just double-click START_OFFLINE.bat.
- Do not run npm ci again unless dependencies have been changed or
  node_modules has been deleted.
- Do not run the build again unless you change the source code or add/
  replace market data.
- The local server must remain open while the application is running.
- No online account, broker connection, or internet access is needed
  for local replay, charting, drawing, orders, analytics, and reports.

MARKET DATA
-----------
The included XAUUSD_2026.csv is located in public\data.
Keep the folder structure intact when extracting the ZIP.
The application reads the bundled local data; no online market feed
is required for replay.

TROUBLESHOOTING
---------------
- "'npm' is not recognized": install Node.js 20+ and reopen Command Prompt.
- "Missing node_modules": run npm ci once (internet or a populated npm
  cache is required for this first installation).
- Port 4173 is already in use: close the other OmaxFX server window,
  then try START_OFFLINE.bat again.
- Blank page after source changes: run npm run build:offline again.
- If the project folder is moved, run START_OFFLINE.bat from its new
  location; do not move only the dist folder.

PROJECT SOURCE
--------------
The src folder contains the React application source.
public contains the bundled market data, icons, and sounds.
package.json and package-lock.json define the exact dependencies.

Offline limitation: a brand-new computer with no Node.js and no cached
dependencies cannot perform the first npm ci without internet. Complete
the one-time setup before disconnecting from the internet.
