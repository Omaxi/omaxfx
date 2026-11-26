const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

app.setName('TradePast');
app.setAppUserModelId('com.tradepast.desktop');

ipcMain.handle('tradepast:export-analytics-pdf', async (event, payload = {}) => {
  const html = typeof payload.html === 'string' ? payload.html : '';
  if (!html || html.length > 150 * 1024 * 1024) throw new Error('The analytics report is empty or too large to export.');
  const parent = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(parent, {
    title: 'Save TradePast analytics report',
    defaultPath: path.join(app.getPath('documents'), 'TradePast-Analytics-Report.pdf'),
    buttonLabel: 'Save PDF',
    filters: [{ name: 'PDF document', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tradepast-report-'));
  const htmlPath = path.join(tempDir, 'report.html');
  let reportWindow;
  try {
    await fs.writeFile(htmlPath, html, 'utf8');
    reportWindow = new BrowserWindow({ show: false, width: 1200, height: 900, backgroundColor: '#0b0e11', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    await reportWindow.loadFile(htmlPath);
    await reportWindow.webContents.executeJavaScript("(async () => { await Promise.all(Array.from(document.images, img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 15000); }))); if (document.fonts?.ready) await document.fonts.ready; return true; })()");
    const pdf = await reportWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    await fs.writeFile(result.filePath, pdf);
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    try { await fs.unlink(result.filePath); } catch {}
    throw error;
  } finally {
    if (reportWindow && !reportWindow.isDestroyed()) reportWindow.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0e11',
    title: 'TradePast',
    icon: path.join(__dirname, '..', 'build', 'tradepast.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const appUrl = win.webContents.getURL();
    if (url !== appUrl && !url.startsWith('file://')) {
      event.preventDefault();
      if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    }
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
