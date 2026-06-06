function visible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function labelFor(element) {
  return [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-bs-original-title"),
    element.textContent
  ].filter(Boolean).join(" ").trim().toLowerCase();
}

function findControl(action) {
  const pauseButton = document.querySelector("#Pause");
  if (pauseButton && visible(pauseButton)) {
    const label = labelFor(pauseButton);
    if (action === "lock" && label.includes("pause")) {
      return pauseButton;
    }
    if (action === "unlock" && (label.includes("play") || label.includes("resume"))) {
      return pauseButton;
    }
  }

  const terms = action === "lock"
    ? ["pause"]
    : ["play", "resume"];
  const controls = [...document.querySelectorAll("button, [role='button'], a")];
  return controls.find((control) => {
    if (!visible(control)) return false;
    const label = labelFor(control);
    return terms.some((term) => label.includes(term));
  });
}

function clickControl(action) {
  const control = findControl(action);
  if (!control) return false;
  control.click();
  return true;
}

function ensureOverlay() {
  let overlay = document.querySelector("#arabicGameNfs2Lock");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "arabicGameNfs2Lock";
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:none",
    "place-items:center",
    "padding:24px",
    "background:rgba(11,18,32,.92)",
    "color:#fff",
    "font-family:Segoe UI,Microsoft YaHei,Arial,sans-serif",
    "text-align:center"
  ].join(";");
  overlay.innerHTML = [
    "<div style=\"max-width:460px\">",
    "<h1 style=\"margin:0 0 10px;font-size:30px;line-height:1.2\">极品飞车2已暂停</h1>",
    "<p style=\"margin:0;color:rgba(255,255,255,.82);font-size:16px;line-height:1.6\">回到 Arabic Test 页面，完成一题后继续。</p>",
    "</div>"
  ].join("");
  document.documentElement.append(overlay);
  return overlay;
}

function setOverlayVisible(visible) {
  ensureOverlay().style.display = visible ? "grid" : "none";
}

function handleRewardCommand(message) {
  if (message?.type !== "nfs2-reward") return;

  if (message.action === "lock") {
    clickControl("lock");
    setOverlayVisible(true);
  }

  if (message.action === "unlock") {
    setOverlayVisible(false);
    clickControl("unlock");
    window.focus();
  }
}

chrome.runtime.onMessage.addListener(handleRewardCommand);
