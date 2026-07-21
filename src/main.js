import "./r7-media.js";
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const reveals = document.querySelectorAll(".reveal");
if (reduce) reveals.forEach((el) => el.classList.add("visible"));
else if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  reveals.forEach((el) => io.observe(el));
} else reveals.forEach((el) => el.classList.add("visible"));

document.querySelectorAll("video[data-auto]").forEach((v) => {
  if (reduce) { v.removeAttribute("autoplay"); v.pause(); v.controls = true; }
  else { v.muted = true; v.play().catch(() => {}); }
});

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const sel = btn.getAttribute("data-copy");
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim() || "";
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea"); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    const prev = btn.textContent; btn.textContent = "copied";
    setTimeout(() => (btn.textContent = prev), 1100);
  });
});

const burn = document.getElementById("burn");
const gauge = document.getElementById("gauge");
const prophecy = document.getElementById("prophecy");
function hoursLeft(pct) {
  const rem = Math.max(0.15, ((100 - pct) / 100) * 5);
  const h = Math.floor(rem);
  const m = Math.round((rem - h) * 60);
  return h + "h " + String(m).padStart(2, "0") + "m";
}
function paintScope() {
  if (!burn || !gauge || !prophecy) return;
  const pct = Number(burn.value);
  burn.setAttribute("aria-valuenow", String(pct));
  gauge.style.setProperty("--p", String(pct));
  const tone = pct > 80 ? "⚠ near the wall · " : pct > 55 ? "◉ pressure rising · " : "◉ calm burn · ";
  prophecy.textContent = tone + "~" + hoursLeft(pct) + " left before the wall";
}
burn?.addEventListener("input", paintScope);
paintScope();

document.querySelectorAll("#facets .facet").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#facets .facet").forEach((b) => {
      b.classList.remove("is-on"); b.setAttribute("aria-pressed", "false");
    });
    btn.classList.add("is-on"); btn.setAttribute("aria-pressed", "true");
    const hue = btn.getAttribute("data-hue") || "0";
    document.body.style.filter = "hue-rotate(" + hue + "deg)";
  });
});
