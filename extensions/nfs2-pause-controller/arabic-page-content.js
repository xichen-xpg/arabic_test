window.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type !== "nfs2-reward") return;
  chrome.runtime.sendMessage({
    type: "nfs2-reward",
    action: data.action,
    seconds: data.seconds,
    reason: data.reason
  });
});
