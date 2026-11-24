const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const isDevelopment = !app.isPackaged;
const distDirectory = path.resolve(__dirname, '..', 'dist');
// A stable origin is essential: Chromium stores sessions and preferences by origin.
const LOCAL_APP_PORT = 43871;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow;
let staticServer;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function startLocalServer() {
  return new Promise((resolve, reject) => {
    staticServer = http.createServer((request, response) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405);
        response.end();
        return;
      }

      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      } catch {
        response.writeHead(400);
        response.end();
        return;
      }

      const relativePath = path.normalize(pathname.replace(/^[/\\]+/, ''));
      let filePath = path.resolve(distDirectory, relativePath || 'index.html');
      if (filePath !== distDirectory && !filePath.startsWith(distDirectory + path.sep)) {
        response.writeHead(403);
        response.end();
        return;
      }

      const sendFile = (target) => {
        fs.stat(target, (statError, stats) => {
          if (statError || !stats.isFile()) {
            // Client-side routes should resolve to the app shell.
            target = path.join(distDirectory, 'index.html');
            fs.stat(target, (fallbackError, fallbackStats) => {
              if (fallbackError || !fallbackStats.isFile()) {
                response.writeHead(404);
                response.end('OmaxFX application files were not found.');
                return;
              }
              streamFile(target);
            });
            return;
          }
          streamFile(target);
        });
      };

      const streamFile = (target) => {
        const extension = path.extname(target).toLowerCase();
        response.writeHead(200, {
          'Content-Type': mimeTypes[extension] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
        });
        if (request.method === 'HEAD') {
          response.end();
          return;
        }
        const stream = fs.createReadStream(target);
        stream.on('error', () => {
          if (!response.headersSent) response.writeHead(500);
          response.end();
        });
        stream.pipe(response);
      };

      fs.stat(filePath, (statError, stats) => {
        if (!statError && stats.isDirectory()) filePath = path.join(filePath, 'index.html');
        sendFile(filePath);
      });
    });

    staticServer.once('error', reject);
    staticServer.listen(LOCAL_APP_PORT, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${LOCAL_APP_PORT}/`);
    });
  });
}

function createMainWindow(appUrl) {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0e11',
    title: 'OmaxFX Simulator',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Keep external websites out of the desktop app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.loadURL(appUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setAppUserModelId('com.omaxfx.simulator');

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  const appUrl = isDevelopment
    ? 'http://127.0.0.1:5173'
    : await startLocalServer();
  createMainWindow(appUrl);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(appUrl);
  });
}).catch((error) => {
  console.error('[OmaxFX desktop] Startup failed:', error);
  const { dialog } = require('electron');
  dialog.showErrorBox(
    'OmaxFX could not start',
    `The local application server could not start on port ${LOCAL_APP_PORT}. Close any other OmaxFX instance and try again.\\n\\n${error.message}`,
  );
  app.quit();
});

app.on('before-quit', () => {
  if (staticServer) staticServer.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
