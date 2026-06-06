const NFS2_ALARM_NAME = "nfs2-reward-timeout";

function sendToRetroOnline(message) {
  chrome.tabs.query({ url: "https://retroonline.net/*" }, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, message, () => {
        void chrome.runtime.lastError;
      });
    }
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
