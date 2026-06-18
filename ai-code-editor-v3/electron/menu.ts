// ============================================================
// Electron Application Menu
// ============================================================
import { Menu, BrowserWindow, app, shell } from 'electron';

export function buildMenu(win: BrowserWindow): Menu {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),

    {
      label: '文件',
      submenu: [
        {
          label: '打开文件夹...',
          accelerator: 'CmdOrCtrl+O',
          click: () => win.webContents.send('menu:openFolder'),
        },
        {
          label: '打开文件...',
          click: () => win.webContents.send('menu:openFile'),
        },
        { type: 'separator' },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => win.webContents.send('menu:save'),
        },
        {
          label: '另存为...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => win.webContents.send('menu:saveAs'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: '查找',
          accelerator: 'CmdOrCtrl+F',
          click: () => win.webContents.send('menu:find'),
        },
        {
          label: '替换',
          accelerator: 'CmdOrCtrl+H',
          click: () => win.webContents.send('menu:replace'),
        },
      ],
    },

    {
      label: '视图',
      submenu: [
        {
          label: '命令面板',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => win.webContents.send('menu:commandPalette'),
        },
        { type: 'separator' },
        {
          label: '切换侧栏',
          accelerator: 'CmdOrCtrl+B',
          click: () => win.webContents.send('menu:toggleSidebar'),
        },
        {
          label: '切换 AI 面板',
          accelerator: 'CmdOrCtrl+`',
          click: () => win.webContents.send('menu:toggleAI'),
        },
        {
          label: '切换终端',
          accelerator: 'CmdOrCtrl+J',
          click: () => win.webContents.send('menu:toggleTerminal'),
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'toggleDevTools' as const }] : []),
      ],
    },

    {
      label: '帮助',
      submenu: [
        {
          label: '关于 AI Code Editor',
          click: () => shell.openExternal('https://github.com'),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
