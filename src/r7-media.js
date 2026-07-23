/**
 * Round 7 media runtime — lightning-fast video + reduced motion.
 * - Pick mobile (sm/) source when narrow / Save-Data
 * - preload=none; play only when near viewport; pause when offscreen
 * - Poster-under-video: paint still on the frame so load() never blanks the hero
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

  function posterUrl(video) {
    return (
      video.getAttribute("poster") ||
      video.getAttribute("data-poster") ||
      ""
    );
  }

  /** Frame that should hold the still (never blank under a loading video). */
  function frameFor(video) {
    return (
      video.closest(".vid-frame, .vid-plate, .bleed-vid, .film-band") ||
      video.parentElement
    );
  }

  /**
   * Keep a still under the <video> for the whole load window.
   * Browsers drop the poster attribute once load() starts → black until first frame.
   * CSS background on the frame + transparent video until ready fixes that.
   */
  function paintPosterUnder(video) {
    const url = posterUrl(video);
    if (!url) return;
    const frame = frameFor(video);
    if (!frame) return;
    if (!frame.style.backgroundImage) {
      frame.style.backgroundImage = `url("${url.replace(/"/g, "")}")`;
    }
    frame.style.backgroundSize = frame.style.backgroundSize || "cover";
    frame.style.backgroundPosition =
      frame.style.backgroundPosition || "center";
    frame.style.backgroundRepeat = "no-repeat";
    frame.classList.add("has-poster-bg");
    video.classList.add("r7-video");
    if (!reduce) video.classList.add("is-waiting");
  }

  function markReady(video) {
    video.classList.remove("is-waiting");
    video.classList.add("is-ready");
  }

  function preloadHeroPoster(videos) {
    const first = videos[0];
    if (!first) return;
    const url = posterUrl(first);
    if (!url) return;
    // Avoid duplicate preloads
    if (document.querySelector(`link[data-r7-poster="${url}"]`)) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = url;
    link.setAttribute("data-r7-poster", url);
    document.head.appendChild(link);
  }

  function armVideo(video) {
    if (video.dataset.r7Armed === "1") return;
    video.dataset.r7Armed = "1";

    video.setAttribute("playsinline", "");
    video.muted = true;
    video.playsInline = true;
    video.preload = "none";
    video.removeAttribute("autoplay");

    paintPosterUnder(video);

    const desktop = currentSrc(video);
    if (!desktop) {
      markReady(video);
      return;
    }
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
      markReady(video);
      return;
    }

    video.loop = true;
    let loaded = false;

    const onFirstFrame = () => markReady(video);
    video.addEventListener("loadeddata", onFirstFrame, { once: true });
    video.addEventListener("playing", onFirstFrame, { once: true });
    // If decode fails, still unhide so poster/frame remains usable via controls fallback
    video.addEventListener(
      "error",
      () => {
        markReady(video);
      },
      { once: true },
    );

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
    const videos = Array.from(document.querySelectorAll("video"));
    preloadHeroPoster(videos);
    videos.forEach(armVideo);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.__r7Media = { useMobile, reduce, saveData };
})();
