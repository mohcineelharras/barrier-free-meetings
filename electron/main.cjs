const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

const isDev = !app.isPackaged;

let serverProcess = null;
let mainWindow = null;

function getAppRoot() {
  if (isDev) {
    return path.join(__dirname, '..');
  }
  return path.join(process.resourcesPath, 'app');
}

function startServer() {
  return new Promise((resolve, reject) => {
    const appRoot = getAppRoot();
    const nodePath = process.execPath;
    const serverScript = path.join(appRoot, 'server.ts');

    serverProcess = spawn(nodePath, ['--import', 'tsx', serverScript], {
      cwd: appRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_IS_PACKAGED: app.isPackaged ? 'true' : 'false',
        ELECTRON_RUN_AS_NODE: '1'
      },
      stdio: 'pipe',
      windowsHide: true
    });

    let started = false;

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[server] ${output.trim()}`);
      if (!started && output.includes('listening on')) {
        started = true;
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[server] ${data.toString().trim()}`);
    });

    serverProcess.on('error', (err) => {
      if (!started) {
        reject(err);
      }
    });

    serverProcess.on('exit', (code) => {
      if (!started && code !== 0) {
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    setTimeout(() => {
      if (!started) {
        started = true;
        resolve();
      }
    }, 8000);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Barrier-Free Meetings',
    show: false,
  });

  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    await mainWindow.loadURL('http://localhost:3000');
  } catch (err) {
    console.error('Failed to load URL:', err);
  }

  mainWindow.show();

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    console.log('Starting server...');
    await startServer();
    console.log('Server started, creating window...');
    await createWindow();
  } catch (err) {
    console.error('Failed to start application:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
