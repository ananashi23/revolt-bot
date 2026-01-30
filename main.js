const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let botProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'), // Optional app icon
    show: false, // Don't show until ready-to-show
    webSecurity: true
  });

  // Load your app
  mainWindow.loadURL('http://localhost:3000');
  
  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Kill the bot process when window is closed
    if (botProcess) {
      botProcess.kill();
    }
  });

  // Create a custom menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Start Bot',
          click: () => {
            mainWindow.webContents.send('menu-action', 'start');
          }
        },
        {
          label: 'Stop Bot',
          click: () => {
            mainWindow.webContents.send('menu-action', 'stop');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Start the bot server when Electron app is ready
function startBotServer() {
  botProcess = spawn('node', ['bot-with-gui.js'], {
    stdio: 'pipe',
    shell: true
  });

  botProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  botProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  botProcess.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
  });
}

app.whenReady().then(() => {
  startBotServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app before quit
app.on('before-quit', () => {
  if (botProcess) {
    botProcess.kill();
  }
});