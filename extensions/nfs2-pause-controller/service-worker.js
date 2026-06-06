chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "nfs2-reward") return;

  chrome.tabs.query({ url: "https://retroonline.net/*" }, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, message, () => {
        void chrome.runtime.lastError;
      });
    }
  });
});
