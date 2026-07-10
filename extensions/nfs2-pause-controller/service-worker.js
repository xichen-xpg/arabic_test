const NFS2_ALARM_NAME = "nfs2-reward-timeout";

function sendToRetroOnline(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      if (!isNfs2Tab(tab)) continue;
      sendToRetroOnlineTab(tab.id, message);
    }
  });
}

function isNfs2Tab(tab) {
  const url = tab.url || "";
  return url.startsWith("https://retroonline.net/Windows/Need%20for%20Speed%20II%20SE")
    || url.includes("/need_for_speed/Need%20for%20Speed%20II%20SE")
    || url.includes("\\need_for_speed\\Need%20for%20Speed%20II%20SE");
}

function sendToRetroOnlineTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, () => {
    if (!chrome.runtime.lastError) return;
    chrome.scripting.executeScript({
      target: { tabId },
      files: ["retroonline-content.js"]
    }, () => {
      if (chrome.runtime.lastError) return;
      chrome.tabs.sendMessage(tabId, message, () => {
        void chrome.runtime.lastError;
      });
    });
  });
}

function scheduleTimeout(seconds) {
  chrome.alarms.clear(NFS2_ALARM_NAME, () => {
    chrome.alarms.create(NFS2_ALARM_NAME, {
      delayInMinutes: Math.max(1, seconds) / 60
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "nfs2-reward") return;

  if (message.action === "unlock") {
    scheduleTimeout(message.seconds || 60);
  }

  if (message.action === "lock") {
    chrome.alarms.clear(NFS2_ALARM_NAME);
  }

  sendToRetroOnline(message);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== NFS2_ALARM_NAME) return;
  sendToRetroOnline({
    type: "nfs2-reward",
    action: "lock",
    reason: "时间到了"
  });
});
