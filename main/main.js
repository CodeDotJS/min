const electron = require("electron");
const fs = require("fs");
const app = electron.app; // Module to control application life.
const BrowserWindow = electron.BrowserWindow; // Module to create native browser window.

var appDataPath = app.getPath("appData") + "/min/";

const browserPage = 'file://' + __dirname + '/index.html';

var mainWindow = null;
var isFocusMode = false;
var appIsReady = false;

var saveWindowBounds = function () {
	if (mainWindow) {
		fs.writeFile(appDataPath + "windowBounds.json", JSON.stringify(mainWindow.getBounds()));
	}
}

function sendIPCToWindow(window, action, data) {
	//if there are no windows, create a new one
	if (!mainWindow) {
		createWindow(function () {
			mainWindow.webContents.send(action, data || {});
		});
	} else {
		mainWindow.webContents.send(action, data || {});
	}
}

function createWindow(cb) {
	var savedBounds = fs.readFile(appDataPath + "windowBounds.json", "utf-8", function (e, data) {

		if (e) { //there was an error, probably because the file doesn't exist
			var size = electron.screen.getPrimaryDisplay().workAreaSize;
			var bounds = {
				x: 0,
				y: 0,
				width: size.width,
				height: size.height
			}
		} else {
			var bounds = JSON.parse(data);
		}

		createWindowWithBounds(bounds);

		if (cb) {
			cb();
		}
	});
}

function createWindowWithBounds(bounds) {

	mainWindow = new BrowserWindow({
		width: bounds.width,
		height: bounds.height,
		x: bounds.x,
		y: bounds.y,
		minWidth: 320,
		minHeight: 500,
		titleBarStyle: 'hidden-inset',
		autoHideMenuBar: true,
		icon: __dirname + '/icons/icon256.png',
	});

	// and load the index.html of the app.
	mainWindow.loadURL(browserPage);

	//save the window size for the next launch of the app
	mainWindow.on("close", function () {
		saveWindowBounds();
	});

	// Emitted when the window is closed.
	mainWindow.on('closed', function () {

		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		mainWindow = null;
	});

	/* handle pdf downloads - ipc recieved in fileDownloadManager.js */

	mainWindow.webContents.session.on("will-download", function (event, item, webContents) {
		var itemURL = item.getURL();
		if (item.getMimeType() == "application/pdf" && itemURL.indexOf("blob:") != 0) { //clicking the download button in the viewer opens a blob url, so we don't want to open those in the viewer (since that would make it impossible to download a PDF)
			event.preventDefault();
			sendIPCToWindow(mainWindow, "openPDF", {
				url: itemURL,
				event: event,
				item: item, //as of electron 0.35.1, this is an empty object
				webContents: webContents
			});
		}
		return true;
	});

	mainWindow.on("enter-full-screen", function () {
		sendIPCToWindow(mainWindow, "enter-full-screen");
	});

	mainWindow.on("leave-full-screen", function () {
		sendIPCToWindow(mainWindow, "leave-full-screen");
	});

	mainWindow.on("app-command", function (e, command) {
		if (command == "browser-backward") {
			sendIPCToWindow(mainWindow, "goBack");
		} else if (command == "browser-forward") {
			sendIPCToWindow(mainWindow, "goForward");
		}
	});

	//prevent remote pages from being loaded using drag-and-drop, since they would have node access
	mainWindow.webContents.on("will-navigate", function (e, url) {
		if (url != browserPage) {
			e.preventDefault();
		}
	});

	registerFiltering(); //register filtering for the default session

	return mainWindow;
}


// Quit when all windows are closed.
app.on('window-all-closed', function () {
	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform != 'darwin') {
		app.quit();
	}
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function () {
	appIsReady = true;

	createWindow(function () {
		//if a URL was passed as a command line argument (probably because Min is set as the default browser on Linux), open it.

		if (process.argv && process.argv[1] && process.argv[1] !== __dirname) {

			mainWindow.webContents.on("did-finish-load", function () {
				sendIPCToWindow(mainWindow, "addTab", {
					url: process.argv[1]
				});
			});

		}
	});

	// Open the DevTools.
	//mainWindow.openDevTools();

	createAppMenu();

});

app.on("open-url", function (e, url) {
	if (appIsReady) {
		sendIPCToWindow(mainWindow, "addTab", {
			url: url
		});
	} else {
		app.on("ready", function () {
			setTimeout(function () { //TODO replace this with an event that occurs when the browserWindow finishes loading
				sendIPCToWindow(mainWindow, "addTab", {
					url: url
				});
			}, 750);
		});
	}
});

/**
 * Emitted when the application is activated, which usually happens when clicks on the applications's dock icon
 * https://github.com/electron/electron/blob/master/docs/api/app.md#event-activate-os-x
 *
 * Opens a new tab when all tabs are closed, and min is still open by clicking on the application dock icon
 */
app.on("activate", function functionName( /*e, hasVisibleWindows*/ ) {
	if (!mainWindow) {
		createWindow();
	}
});

function createAppMenu() {
	// create the menu. based on example from http://electron.atom.io/docs/v0.34.0/api/menu/

	var Menu = electron.Menu;
	var MenuItem = electron.MenuItem;


	var template = [
		{
			label: 'File',
			submenu: [
				{
					label: 'New Tab',
					accelerator: 'CmdOrCtrl+t',
					click: function (item, window) {
						sendIPCToWindow(window, "addTab");
					}
      },
				{
					label: 'New Private Tab',
					accelerator: 'shift+CmdOrCtrl+t',
					click: function (item, window) {
						sendIPCToWindow(window, "addPrivateTab");
					}
      },
				{
					label: 'New Task',
					accelerator: 'shift+CmdOrCtrl+n',
					click: function (item, window) {
						sendIPCToWindow(window, "addTask");
					}
      },
				{
					type: "separator"
      },
				{
					label: 'Print',
					accelerator: 'CmdOrCtrl+p',
					click: function (item, window) {
						sendIPCToWindow(window, "print");
					}
      },
    ]
  },
		{
			label: 'Edit',
			submenu: [
				{
					label: 'Undo',
					accelerator: 'CmdOrCtrl+Z',
					role: 'undo'
      },
				{
					label: 'Redo',
					accelerator: 'Shift+CmdOrCtrl+Z',
					role: 'redo'
      },
				{
					type: 'separator'
      },
				{
					label: 'Cut',
					accelerator: 'CmdOrCtrl+X',
					role: 'cut'
      },
				{
					label: 'Copy',
					accelerator: 'CmdOrCtrl+C',
					role: 'copy'
      },
				{
					label: 'Paste',
					accelerator: 'CmdOrCtrl+V',
					role: 'paste'
      },
				{
					label: 'Select All',
					accelerator: 'CmdOrCtrl+A',
					role: 'selectall'
      },
				{
					type: "separator"
				},
				{
					label: "Find",
					accelerator: "CmdOrCtrl+F",
					click: function (item, window) {
						sendIPCToWindow(window, "findInPage");
					}
				},
    ]
  },
	/* these items are added by os x */
		{
			label: 'View',
			submenu: [
				{
					label: 'Zoom in',
					accelerator: 'CmdOrCtrl+=',
					click: function (item, window) {
						sendIPCToWindow(window, "zoomIn");
					}
      },
				{
					label: 'Zoom out',
					accelerator: 'CmdOrCtrl+-',
					click: function (item, window) {
						sendIPCToWindow(window, "zoomOut");
					}
      },
				{
					label: 'Actual size',
					accelerator: 'CmdOrCtrl+0',
					click: function (item, window) {
						sendIPCToWindow(window, "zoomReset");
					}
      },
				{
					type: "separator"
				},
				{
					label: "Focus mode",
					accelerator: undefined,
					type: "checkbox",
					checked: false,
					click: function (item, window) {
						if (isFocusMode) {
							item.checked = false;
							isFocusMode = false;
							sendIPCToWindow(window, "exitFocusMode");
						} else {
							item.checked = true;
							isFocusMode = true;
							sendIPCToWindow(window, "enterFocusMode");
						}
					}
				},
				{
					label: "Reading List",
					accelerator: undefined,
					click: function (item, window) {
						sendIPCToWindow(window, "showReadingList");
					}
				}
		]
  },
		{
			label: 'Developer',
			submenu: [
				{
					label: 'Reload Browser',
					accelerator: undefined,
					click: function (item, focusedWindow) {
						if (focusedWindow)
							focusedWindow.reload();
					}
      },
				{
					label: 'Inspect browser',
					click: function (item, focusedWindow) {
						if (focusedWindow)
							focusedWindow.toggleDevTools();
					}
      },
				{
					type: "separator"
			},
				{
					label: 'Inspect page',
					accelerator: 'Cmd+Alt+I',
					click: function (item, window) {
						sendIPCToWindow(window, "inspectPage");
					}
      },
    ]
  },
		{
			label: 'Window',
			role: 'window',
			submenu: [
				{
					label: 'Minimize',
					accelerator: 'CmdOrCtrl+M',
					role: 'minimize'
      },
				{
					label: 'Close',
					accelerator: 'CmdOrCtrl+W',
					role: 'close'
      },
    ]
  },
		{
			label: 'Help',
			role: 'help',
			submenu: [
				{
					label: 'Learn More',
					click: function () {
						electron.shell.openExternal('http://github.com/palmerAl/browser')
					}
      },
    ]
  },
];

	if (process.platform == 'darwin') {
		var name = app.getName();
		template.unshift({
			label: name,
			submenu: [
				{
					label: 'About ' + name,
					role: 'about'
      },
				{
					type: 'separator'
      },
				{
					label: 'Privacy Preferences',
					accelerator: "CmdOrCtrl+,",
					click: function (item, window) {
						sendIPCToWindow(window, "addTab", {
							url: "file://" + __dirname + "/pages/settings/index.html"
						});
					}
      },
				{
					label: 'Services',
					role: 'services',
					submenu: []
      },
				{
					type: 'separator'
      },
				{
					label: 'Hide ' + name,
					accelerator: 'CmdOrCtrl+H',
					role: 'hide'
      },
				{
					label: 'Hide Others',
					accelerator: 'CmdOrCtrl+Shift+H',
					role: 'hideothers'
      },
				{
					label: 'Show All',
					role: 'unhide'
      },
				{
					type: 'separator'
      },
				{
					label: 'Quit',
					accelerator: 'CmdOrCtrl+Q',
					click: function () {
						app.quit();
					}
      },
    ]
		});
		// Window menu.
		template[3].submenu.push({
			type: 'separator'
		}, {
			label: 'Bring All to Front',
			role: 'front'
		});
	}

	//preferences item on linux and windows

	if (process.platform != "darwin") {

		template[1].submenu.push({
			type: "separator"
		});

		template[1].submenu.push({
			label: 'Privacy Preferences',
			accelerator: "CmdOrCtrl+,",
			click: function (item, window) {
				sendIPCToWindow(window, "addTab", {
					url: "file://" + __dirname + "/pages/settings/index.html"
				});
			}
		});

	}

	var menu = new Menu();

	menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);

}
