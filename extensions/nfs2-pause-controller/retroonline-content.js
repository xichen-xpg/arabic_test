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

function handleRewardCommand(message) {
  if (message?.type !== "nfs2-reward") return;

  if (message.action === "lock") {
    clickControl("lock");
  }

  if (message.action === "unlock") {
    clickControl("unlock");
  }
}

chrome.runtime.onMessage.addListener(handleRewardCommand);
