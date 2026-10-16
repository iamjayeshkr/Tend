const { app, BrowserWindow, shell, Menu, protocol, net, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { createClerkBridge } = require('@clerk/electron');
const { storage } = require('@clerk/electron/storage');

const RENDERER_SCHEME = 'tend';
const RENDERER_HOST = 'renderer';
const PACKAGED_RENDERER_ORIGIN = `${RENDERER_SCHEME}://${RENDERER_HOST}`;
const DIST_DIRECTORY = path.resolve(__dirname, '../dist');

// Register custom scheme as privileged so it has full browser-standard capabilities
protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// Clerk owns the desktop single-instance lock so OAuth/SSO callbacks can be
// forwarded safely to the first process. Session data is encrypted by the SDK.
const clerk = createClerkBridge({
  storage: storage(),
  renderer: { scheme: RENDERER_SCHEME, host: RENDERER_HOST },
  userAgent: `Tend/${app.getVersion()}`,
});

let mainWindow = null;

const isDev = !app.isPackaged && (process.env.NODE_ENV === 'development' || process.argv.includes('--dev'));
const devServerUrl = isDev ? process.env.VITE_DEV_SERVER_URL : undefined;

function originOf(url) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch {
    return '';
  }
}

function desktopBuildConfiguration() {
  const empty = { clerkFrontendApiHost: '', supabaseOrigin: '' };
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(DIST_DIRECTORY, 'desktop-config.json'), 'utf8'));
    const clerkFrontendApiHost = typeof parsed.clerkFrontendApiHost === 'string'
      && /^[a-z0-9.-]+(?::\d+)?$/i.test(parsed.clerkFrontendApiHost)
      ? parsed.clerkFrontendApiHost
      : '';
    const supabaseOrigin = typeof parsed.supabaseOrigin === 'string'
      && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(parsed.supabaseOrigin)
      ? parsed.supabaseOrigin
      : '';
    return { clerkFrontendApiHost, supabaseOrigin };
  } catch {
    return empty;
  }
}

function applyContentSecurityPolicy() {
  const { clerkFrontendApiHost, supabaseOrigin } = desktopBuildConfiguration();
  const clerkOrigin = clerkFrontendApiHost ? `https://${clerkFrontendApiHost}` : '';
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    clerkOrigin,
    'https://challenges.cloudflare.com',
    'https://*.protect.clerk.com',
  ].filter(Boolean);
  const connectSources = [
    "'self'",
    clerkOrigin,
    supabaseOrigin,
    'https://*.protect.clerk.com:*',
    'https://clerk-telemetry.com',
    'https://*.clerk-telemetry.com',
  ].filter(Boolean);
  const policy = [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    `connect-src ${connectSources.join(' ')}`,
    "img-src 'self' https://img.clerk.com data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com",
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived(
    { urls: [`${PACKAGED_RENDERER_ORIGIN}/*`] },
    (details, callback) => {
      if (details.resourceType !== 'mainFrame') {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [policy],
        },
      });
    },
  );
}

function createMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: 'Tend',
            submenu: [
              { role: 'about', label: 'About Tend' },
              { type: 'separator' },
              { role: 'services', label: 'Services' },
              { type: 'separator' },
              { role: 'hide', label: 'Hide Tend' },
              { role: 'hideOthers', label: 'Hide Others' },
              { role: 'unhide', label: 'Show All' },
              { type: 'separator' },
              { role: 'quit', label: 'Quit Tend' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
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
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' },
            ]
          : [{ role: 'close' }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Tend Privacy & Terms',
          click: async () => {
            if (mainWindow) {
              mainWindow.loadURL(`${PACKAGED_RENDERER_ORIGIN}/privacy.html`);
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f6f4eb',
    show: false,
    title: 'Tend — Make room for what matters',
    icon: path.join(__dirname, '../public/icons/tend-512.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 18, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const allowedOrigins = new Set(
    [devServerUrl, PACKAGED_RENDERER_ORIGIN]
      .filter(Boolean)
      .map(originOf),
  );

  // Never give an external page access to the privileged preload or Clerk's
  // token bridge. Browser links are opened outside Tend.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!allowedOrigins.has(originOf(url))) {
      event.preventDefault();
      if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
        void shell.openExternal(url);
      }
    }
  });

  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (event.isMainFrame && !allowedOrigins.has(originOf(url))) {
      event.preventDefault();
    }
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadURL(`${PACKAGED_RENDERER_ORIGIN}/`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

if (!clerk.isPrimaryInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (!devServerUrl) {
      protocol.handle(RENDERER_SCHEME, (request) => {
        const parsedUrl = new URL(request.url);
        if (parsedUrl.host !== RENDERER_HOST) {
          return new Response('Not found', { status: 404 });
        }

        let requestedPath;
        try {
          requestedPath = decodeURIComponent(parsedUrl.pathname);
        } catch {
          return new Response('Bad request', { status: 400 });
        }

        const targetFile = path.resolve(DIST_DIRECTORY, `.${requestedPath}`);
        const relativePath = path.relative(DIST_DIRECTORY, targetFile);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          return new Response('Forbidden', { status: 403 });
        }

        const hasExtension = /\.[^/]+$/.test(parsedUrl.pathname);
        const filePath = hasExtension ? targetFile : path.join(DIST_DIRECTORY, 'index.html');
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          return new Response('Not found', { status: 404 });
        }

        return net.fetch(pathToFileURL(filePath).toString());
      });
      applyContentSecurityPolicy();
    }

    createMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('before-quit', () => {
    clerk.cleanup();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
