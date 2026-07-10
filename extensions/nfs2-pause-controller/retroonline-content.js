if (!window.__arabicGameNfs2ControllerInstalled) {
  window.__arabicGameNfs2ControllerInstalled = true;

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

  function injectPageCommand(action) {
    const script = document.createElement("script");
    script.textContent = `
      (() => {
        const action = ${JSON.stringify(action)};
        const wdosboxxType = action === "lock" ? "wc-pause" : "wc-resume";
        const message = { type: wdosboxxType };
        window.postMessage(message, "*");
        for (let i = 0; i < window.frames.length; i += 1) {
          try {
            window.frames[i].postMessage(message, "*");
          } catch {}
        }
        console.info("[NFS2 Reward page] posted", wdosboxxType);

        const button = document.querySelector("#Pause");
        if (!button) {
          console.warn("[NFS2 Reward page] #Pause not found");
          return;
        }

        const label = [
          button.getAttribute("aria-label"),
          button.getAttribute("title"),
          button.getAttribute("data-bs-original-title"),
          button.textContent
        ].filter(Boolean).join(" ").toLowerCase();
        const shouldClick = action === "lock"
          ? label.includes("pause")
          : label.includes("play") || label.includes("resume");

        if (!shouldClick) {
          console.info("[NFS2 Reward page] already in target state", action, label);
          return;
        }

        const opts = { bubbles: true, cancelable: true, view: window };
        button.dispatchEvent(new PointerEvent("pointerdown", opts));
        button.dispatchEvent(new MouseEvent("mousedown", opts));
        button.dispatchEvent(new PointerEvent("pointerup", opts));
        button.dispatchEvent(new MouseEvent("mouseup", opts));
        button.dispatchEvent(new MouseEvent("click", opts));
        HTMLButtonElement.prototype.click.call(button);
        console.info("[NFS2 Reward page] clicked #Pause for", action);
      })();
    `;
    (document.head || document.documentElement).append(script);
    script.remove();
  }

  function clickControl(action) {
    injectPageCommand(action);
    const control = findControl(action);
    if (!control) return false;
    control.click();
    return true;
  }

  function clickControlWithRetries(action, attempts = 12) {
    if (clickControl(action)) return;
    if (attempts <= 1) {
      console.warn("[NFS2 Reward] Control not found for", action);
      return;
    }
    window.setTimeout(() => clickControlWithRetries(action, attempts - 1), 500);
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
      "<h1 style=\"margin:0 0 10px;font-size:30px;line-height:1.2\">NFS2 paused</h1>",
      "<p style=\"margin:0;color:rgba(255,255,255,.82);font-size:16px;line-height:1.6\">Return to Arabic Test and finish one question to continue.</p>",
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
    console.info("[NFS2 Reward]", message.action, message.reason || "", message.seconds || "");

    if (message.action === "lock") {
      setOverlayVisible(true);
      clickControlWithRetries("lock");
    }

    if (message.action === "unlock") {
      setOverlayVisible(false);
      clickControlWithRetries("unlock");
      window.focus();
    }
  }

  chrome.runtime.onMessage.addListener(handleRewardCommand);
}
