/** SAGE-style click-to-copy + install method tabs. Safe to import once. */
export function bootInstallUi() {
  let toastEl = null;
  function showToast(el) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "copy-toast";
      toastEl.textContent = "Copied";
      document.body.appendChild(toastEl);
    }
    const r = el.getBoundingClientRect();
    toastEl.style.left = r.left + r.width / 2 + "px";
    toastEl.style.top = r.top + "px";
    toastEl.classList.remove("show");
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1400);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy") ? resolve() : reject(new Error("copy failed"));
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  window.copyCmd = function (el) {
    const cmd = el.getAttribute("data-cmd");
    if (!cmd) return;
    copyText(cmd)
      .then(() => {
        el.classList.add("copied");
        showToast(el);
        const icon = el.querySelector(".copy-icon");
        if (icon) {
          const orig = icon.textContent;
          icon.textContent = "✓";
          setTimeout(() => {
            icon.textContent = orig;
          }, 1500);
        }
        setTimeout(() => el.classList.remove("copied"), 1500);
      })
      .catch(() => {});
  };

  document.addEventListener("keydown", (e) => {
    if (
      (e.key === "Enter" || e.key === " ") &&
      e.target instanceof Element &&
      e.target.hasAttribute("data-cmd")
    ) {
      e.preventDefault();
      window.copyCmd(e.target);
    }
  });

  // Legacy data-copy="#selector" buttons
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sel = btn.getAttribute("data-copy");
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim() || "";
      try {
        await copyText(text);
      } catch {
        return;
      }
      const prev = btn.textContent;
      btn.textContent = "copied";
      setTimeout(() => (btn.textContent = prev), 1100);
    });
  });

  function initInstallTabs() {
    const roots = document.querySelectorAll(".install-term, .install-tabs");
    // Group by nearest .install-term (or document for bare tablists)
    const tablists = document.querySelectorAll(".install-tabs[role='tablist']");
    tablists.forEach((list) => {
      const tabs = Array.from(list.querySelectorAll(".install-tab"));
      if (!tabs.length) return;
      const select = (tab) => {
        tabs.forEach((t) => {
          const on = t === tab;
          t.setAttribute("aria-selected", String(on));
          t.tabIndex = on ? 0 : -1;
          const panel = document.getElementById(t.getAttribute("aria-controls"));
          if (panel) panel.hidden = !on;
        });
      };
      tabs.forEach((tab, i) => {
        tab.addEventListener("click", () => select(tab));
        tab.addEventListener("keydown", (e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          const dir = e.key === "ArrowRight" ? 1 : -1;
          const next = tabs[(i + dir + tabs.length) % tabs.length];
          select(next);
          next.focus();
        });
      });
    });
  }
  initInstallTabs();
}
