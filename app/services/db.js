(function () {
  if (!window || !window.electronAPI) return;

  const db = {
    query: (query, params = []) => window.electronAPI.dbQuery(query, params),
    execute: (query, params = []) => window.electronAPI.dbExecute(query, params),
  };

  const sys = {
    testServer: (ipAddress, serverName, port = 3389) => window.electronAPI.testServer(ipAddress, serverName, port),
    selectFile: () => window.electronAPI.selectFile(),
    downloadFile: (params) => window.electronAPI.downloadFile(params),
  };

  const updates = {
    check: () => window.electronAPI.checkForUpdates(),
    download: () => window.electronAPI.downloadUpdate(),
    install: () => window.electronAPI.installUpdate(),
    getVersion: () => window.electronAPI.getAppVersion(),
    onAvailable: (cb) => { const h = (_e, d) => cb(d); window.electronAPI.onUpdateAvailable(h); return () => window.electronAPI.onUpdateAvailable(() => {}); },
    onNotAvailable: (cb) => { const h = (_e, d) => cb(d); window.electronAPI.onUpdateNotAvailable(h); return () => window.electronAPI.onUpdateNotAvailable(() => {}); },
    onProgress: (cb) => { const h = (_e, d) => cb(d); window.electronAPI.onUpdateDownloadProgress(h); return () => window.electronAPI.onUpdateDownloadProgress(() => {}); },
    onDownloaded: (cb) => { const h = (_e, d) => cb(d); window.electronAPI.onUpdateDownloaded(h); return () => window.electronAPI.onUpdateDownloaded(() => {}); },
    onError: (cb) => { const h = (_e, d) => cb(d); window.electronAPI.onUpdateError(h); return () => window.electronAPI.onUpdateError(() => {}); },
  };

  window.DB = db;
  window.Sys = sys;
  window.Updates = updates;
})();
