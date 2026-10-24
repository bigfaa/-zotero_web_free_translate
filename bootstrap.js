var chromeHandle;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);

  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "zotero_web", rootURI + "content/"],
  ]);

  const ctx = {
    rootURI,
    addonID: id,
    addonVersion: version,
  };
  ctx._globalThis = ctx;

  Services.scriptloader.loadSubScript(
    `${rootURI}content/translation-engine.js`,
    ctx,
  );
  Services.scriptloader.loadSubScript(
    `${rootURI}content/zotero_web.js`,
    ctx,
  );
  await Zotero.ZoteroWeb.hooks.onStartup();
}

async function onMainWindowLoad({ window }, reason) {
  await Zotero.ZoteroWeb?.hooks.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }, reason) {
  await Zotero.ZoteroWeb?.hooks.onMainWindowUnload(window);
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }

  await Zotero.ZoteroWeb?.hooks.onShutdown();

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function uninstall(data, reason) {}
