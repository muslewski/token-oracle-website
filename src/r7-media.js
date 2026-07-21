/**
 * Round 7 media runtime — lightning-fast video + reduced motion.
 * - Pick mobile (sm/) source when narrow / Save-Data
 * - preload=none; play only when near viewport; pause when offscreen
 */
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = !!(
    (navigator.connection && navigator.connection.saveData) ||
    window.matchMedia("(prefers-reduced-data: reduce)").matches
  );
  const narrow = window.matchMedia("(max-width: 720px)").matches;
  const useMobile = narrow || saveData;

  function toMobileSrc(src) {
    if (!src || src.includes("/sm/")) return src;
    // ./video/v01.mp4 → ./video/sm/v01.mp4
    // /video/v01.mp4 → /video/sm/v01.mp4
    // video/v01.mp4 → video/sm/v01.mp4
    return src
      .replace(/(\.\/)?video\/(?!sm\/)/, (m) => (m.startsWith("./") ? "./video/sm/" : m.includes("/") ? "video/sm/" : "video/sm/"))
      .replace(/\/video\/(?!sm\/)/, "/video/sm/");
  }

  function currentSrc(video) {
    const s = video.querySelector("source");
    return (
      video.getAttribute("data-src") ||
      (s && s.getAttribute("src")) ||
      video.getAttribute("src") ||
      ""
    );
  }

  function armVideo(video) {
    if (video.dataset.r7Armed === "1") return;
    video.dataset.r7Armed = "1";

    video.setAttribute("playsinline", "");
    video.muted = true;
    video.playsInline = true;
    video.preload = "none";
    video.removeAttribute("autoplay");

    const desktop = currentSrc(video);
    if (!desktop) return;
    const desired = useMobile ? toMobileSrc(desktop) : desktop;

    if (reduce) {
      video.controls = true;
      video.loop = false;
      let source = video.querySelector("source");
      if (!source) {
        source = document.createElement("source");
        source.type = "video/mp4";
        video.appendChild(source);
      }
      source.setAttribute("src", desired);
      video.removeAttribute("src");
      return;
    }

    video.loop = true;
    let loaded = false;

    const loadAndPlay = () => {
      if (!loaded) {
        let source = video.querySelector("source");
        if (!source) {
          source = document.createElement("source");
          source.type = "video/mp4";
          video.appendChild(source);
        }
        if (source.getAttribute("src") !== desired) {
          source.setAttribute("src", desired);
          video.removeAttribute("src");
          video.load();
        }
        loaded = true;
      }
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    };

    if (!("IntersectionObserver" in window)) {
      loadAndPlay();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.12) loadAndPlay();
          else if (!video.paused) video.pause();
        }
      },
      { rootMargin: "100px 0px", threshold: [0, 0.12, 0.35] },
    );
    io.observe(video);
  }

  function boot() {
    document.querySelectorAll("video").forEach(armVideo);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.__r7Media = { useMobile, reduce, saveData };
})();
