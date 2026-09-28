/* ─────────────────────────────────────────────────────────────
   PAGE TRANSITIONS — runs immediately before first paint
   Adds is-entering to body so main is hidden, preventing flash.
   ───────────────────────────────────────────────────────────── */
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const trackEvent = (eventName, params = {}) => {
  if (typeof window.logAnalyticsEvent === "function") {
    window.logAnalyticsEvent(eventName, params);
  }
};

if (!prefersReducedMotion.matches) {
  const ptDir = sessionStorage.getItem("pt-dir") || "right";
  sessionStorage.removeItem("pt-dir");
  document.body.classList.add("is-entering");
  if (ptDir === "left") document.body.classList.add("from-left");
}

/* ─────────────────────────────────────────────────────────────
   BFCACHE RESTORE FIX
   When a page is restored from the back/forward cache it keeps
   whatever transition classes it had when the user left (usually
   is-exiting → main stuck at opacity:0, i.e. a "blank" page).
   Reset to the settled state so Back/Forward always shows content.
   ───────────────────────────────────────────────────────────── */
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  document.body.classList.remove("is-entering", "is-exiting", "is-exiting-back");
  document.body.classList.add("is-entered");
});

/* ─── Year ─────────────────────────────── */
const yearNode = document.getElementById("year");
if (yearNode) yearNode.textContent = String(new Date().getFullYear());

/* ─── Nav order — determines exit direction ─ */
const NAV_PAGES = ["index.html", "about.html", "resume.html", "projects.html", "contact.html"];
const normalizePageName = (value) => {
  if (!value) return "index.html";
  let page = value.split("#")[0].split("?")[0].trim();
  page = page.replace(/^\.\//, "").replace(/^\//, "");
  if (page.includes("/")) page = page.split("/").pop() || "";
  if (page === "") return "index.html";
  if (!page.endsWith(".html") && !page.includes(".")) page = `${page}.html`;
  if (page === "index") page = "index.html";
  return page;
};

const currentPage = normalizePageName(window.location.pathname);
const getNavIndex = (pageName) => {
  const directIndex = NAV_PAGES.indexOf(pageName);
  if (directIndex !== -1) return directIndex;

  // Project detail pages should transition relative to the Projects tab.
  const projectDetailPages = [
    "five-layers-evaluation.html",
    "transfer-portal.html",
    "transfer-portal-scouting-evaluation.html",
    "nba-2025-comparison.html",
  ];

  if (projectDetailPages.includes(pageName)) {
    return NAV_PAGES.indexOf("projects.html");
  }

  return -1;
};

const currentNavIndex = getNavIndex(currentPage);

/* ─────────────────────────────────────────────────────────────
   ENTER ANIMATION GROUPS
   Each group defines which elements get data-enter, their
   base delay, duration, and optional per-element stagger.
   Groups are processed top-to-bottom; earlier = lower delay.
   ───────────────────────────────────────────────────────────── */
const ENTER_GROUPS = [
  // Page heading & kicker — appear first
  { sel: ".hero-kicker",                    baseDelay:   0, dur: 600 },
  { sel: "main h1",                         baseDelay:  50, dur: 640 },
  { sel: ".about-heading",                  baseDelay:   0, dur: 600 },
  { sel: ".contact-hero",                   baseDelay:   0, dur: 600 },

  // Hero body — second wave
  { sel: ".hero-lead",                      baseDelay: 110, dur: 580 },
  { sel: ".hero-photo-wrap",                baseDelay:  85, dur: 670 },
  { sel: ".hero-actions",                   baseDelay: 175, dur: 560 },

  // Page-level content blocks — third wave
  { sel: ".panel",                          baseDelay:  80, dur: 580 },
  { sel: ".carousel",                       baseDelay: 125, dur: 560 },
  { sel: ".resume-frame-wrap",              baseDelay:  95, dur: 560 },
  { sel: ".filter-row",                     baseDelay:  50, dur: 560 },
  { sel: ".scroll-hint",                    baseDelay: 110, dur: 500 },

  // Contact cards — staggered
  { sel: ".contact-card",                   baseDelay:  65, dur: 570, stagger:  70 },

  // Project cards — staggered cascade
  { sel: ".project-card",                   baseDelay:  65, dur: 545, stagger:  50 },

  // Stats strip items — staggered
  { sel: ".stat-item",                      baseDelay:  50, dur: 500, stagger:  58 },

  // About page image blocks
  { sel: ".about-inline",                   baseDelay:  75, dur: 585, stagger:  80 },

  // Project detail sections
  { sel: ".project-detail-grid > section",  baseDelay:  95, dur: 565 },
  { sel: ".project-actions-card",           baseDelay: 155, dur: 555 },

  // Lead / intro text that didn't get caught above
  { sel: "main .section-intro",             baseDelay: 120, dur: 565 },
  { sel: "main .lead",                      baseDelay: 130, dur: 560 },
];

/* Only elements within ~1.3× viewport height get data-enter.
   Anything further down uses the scroll-reveal system instead. */
const isNearFold = (el) => {
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight * 1.3 && r.bottom > -80;
};

if (!prefersReducedMotion.matches) {
  ENTER_GROUPS.forEach(({ sel, baseDelay, dur, stagger = 0 }) => {
    Array.from(document.querySelectorAll(sel)).forEach((el, i) => {
      if (!isNearFold(el)) return;
      if (el.hasAttribute("data-enter")) return; // already tagged (higher priority group won)

      el.setAttribute("data-enter", "");
      el.style.setProperty("--enter-delay", `${baseDelay + i * stagger}ms`);
      el.style.setProperty("--enter-dur",   `${dur}ms`);
    });
  });
}

/* ─────────────────────────────────────────────────────────────
   SCROLL REVEAL (for below-fold content)
   Skips elements that already have data-enter.
   ───────────────────────────────────────────────────────────── */
const registerReveal = (elements, effect = "up", staggerStep = 70) => {
  elements.forEach((el, index) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.dataset.reveal) return;
    if (el.hasAttribute("data-enter")) return; // page transition handles it
    el.dataset.reveal = effect;
    el.style.setProperty("--reveal-delay", `${index * staggerStep}ms`);
  });
};

registerReveal(Array.from(document.querySelectorAll(".hero-copy > *")), "up", 90);
registerReveal(Array.from(document.querySelectorAll(".hero-photo-wrap")), "zoom", 0);
registerReveal(Array.from(document.querySelectorAll("main > .section > .container > h1, .about-heading, .contact-hero")), "up", 0);
registerReveal(Array.from(document.querySelectorAll(".panel, .card, .contact-card, .project-actions-card, .resume-frame-wrap, .filter-row, .carousel")), "up", 50);
registerReveal(Array.from(document.querySelectorAll(".about-inline")), "left", 0);
registerReveal(Array.from(document.querySelectorAll(".project-detail-grid > section")), "left", 0);
registerReveal(Array.from(document.querySelectorAll(".project-detail-grid > aside")), "right", 0);

if (prefersReducedMotion.matches) {
  document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
  );
  document.querySelectorAll("[data-reveal]").forEach((el) => revealObserver.observe(el));
}

/* ─────────────────────────────────────────────────────────────
   TRIGGER ENTER ANIMATIONS
   Double rAF ensures CSS classes have applied before animations
   start — prevents the "stuck at opacity:0" edge case.
   ───────────────────────────────────────────────────────────── */
if (!prefersReducedMotion.matches) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove("is-entering");
      document.body.classList.add("is-entered");
    });
  });
}

/* ─────────────────────────────────────────────────────────────
   EXIT ANIMATION — intercepts ALL internal link clicks
   Uses event delegation so project-detail "Back" buttons
   and any other internal links also get transitions.
   ───────────────────────────────────────────────────────────── */
document.addEventListener("click", (e) => {
  if (prefersReducedMotion.matches) return;

  const link = e.target.closest("a[href]");
  if (!link) return;

  const href = link.getAttribute("href");
  if (!href) return;

  const isInternalNav = link.closest(".site-nav");
  const isProjectCard = link.classList.contains("project-card");
  const isPrimaryButton = link.classList.contains("btn-primary");
  const isGhostButton = link.classList.contains("btn-ghost");
  const isSocialLink = link.closest(".social-links");

  if (isInternalNav) {
    trackEvent("nav_click", {
      nav_target: normalizePageName(href).replace(".html", ""),
      from_page: currentPage.replace(".html", ""),
    });
  } else if (isProjectCard) {
    const cardTitle = link.querySelector(".meta h4")?.textContent?.trim() || "unknown_project";
    trackEvent("project_card_open", {
      project_name: cardTitle,
      project_path: normalizePageName(href),
      from_page: currentPage.replace(".html", ""),
    });
  } else if (isPrimaryButton || isGhostButton) {
    const buttonText = link.textContent?.trim() || "button";
    trackEvent("cta_click", {
      button_text: buttonText,
      target_path: href,
      button_style: isPrimaryButton ? "primary" : "ghost",
      from_page: currentPage.replace(".html", ""),
    });
  } else if (isSocialLink) {
    const label = link.getAttribute("aria-label") || "social_link";
    trackEvent("social_click", {
      social_label: label,
      from_page: currentPage.replace(".html", ""),
    });
  }

  // Skip: external URLs, mailto, tel, hash anchors, new-tab, downloads
  if (href.startsWith("http") || href.startsWith("mailto") || href.startsWith("tel") || href.startsWith("#")) return;
  if (link.target === "_blank") return;
  if (link.hasAttribute("download")) {
    trackEvent("file_download", {
      file_path: href,
      from_page: currentPage.replace(".html", ""),
    });
    return;
  }

  const targetPage = normalizePageName(href);
  if (targetPage === currentPage) return; // clicking current page

  e.preventDefault();

  // Determine direction by nav order
  const targetNavIndex = getNavIndex(targetPage);

  let goingForward = true;
  if (currentNavIndex === -1) {
    goingForward = targetNavIndex !== -1 ? targetNavIndex > NAV_PAGES.indexOf("projects.html") : true;
  } else if (targetNavIndex === -1) {
    goingForward = true;
  } else {
    goingForward = targetNavIndex > currentNavIndex;
  }

  sessionStorage.setItem("pt-dir", goingForward ? "right" : "left");
  document.body.classList.add(goingForward ? "is-exiting" : "is-exiting-back");

  setTimeout(() => {
    window.location.href = href;
  }, 270);
});

/* ─── Project cards (always visible, sharpens on scroll) ── */
const projectCards = Array.from(document.querySelectorAll(".project-card"));

if (projectCards.length) {
  if (prefersReducedMotion.matches) {
    projectCards.forEach((card) => card.classList.add("in-view"));
  } else {
    const cardObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("in-view");
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px 60px 0px" }
    );
    projectCards.forEach((card) => cardObserver.observe(card));
  }
}

/* ─── Scroll hint ──────────────────────── */
const scrollHint = document.getElementById("scrollHint");
if (scrollHint) {
  const hideHint = () => {
    if (window.scrollY > 80) {
      scrollHint.classList.add("hidden");
      window.removeEventListener("scroll", hideHint);
    }
  };
  window.addEventListener("scroll", hideHint, { passive: true });
}

/* ─── Filter buttons ─────────────────────── */
const filterButtons = Array.from(document.querySelectorAll(".filter-btn"));

if (filterButtons.length && projectCards.length) {
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const filter = btn.dataset.filter;
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      trackEvent("project_filter", {
        filter_name: filter || "all",
        from_page: currentPage.replace(".html", ""),
      });
      projectCards.forEach((card) => {
        const categories = (card.dataset.category || "").split(/\s+/).filter(Boolean);
        const show = filter === "all" || categories.includes(filter);
        card.style.display = show ? "block" : "none";
        if (show && prefersReducedMotion.matches) card.classList.add("in-view");
      });
    });
  });
}

/* ─── Carousel + touch swipe ─────────────── */
const track = document.getElementById("carouselTrack");
const prevBtn = document.getElementById("carouselPrev");
const nextBtn = document.getElementById("carouselNext");

if (track) {
  const slides = Array.from(track.querySelectorAll("img"));
  let slideIndex = 0;
  const draw = () => { track.style.transform = `translateX(-${slideIndex * 100}%)`; };

  if (prevBtn) prevBtn.addEventListener("click", () => { slideIndex = (slideIndex - 1 + slides.length) % slides.length; draw(); });
  if (nextBtn) nextBtn.addEventListener("click", () => { slideIndex = (slideIndex + 1) % slides.length; draw(); });

  let touchStartX = 0;
  track.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener("touchend", (e) => {
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) {
      slideIndex = delta > 0 ? (slideIndex + 1) % slides.length : (slideIndex - 1 + slides.length) % slides.length;
      draw();
    }
  }, { passive: true });
}

/* ─── Scroll progress bar ─────────────────── */
const scrollBar = document.getElementById("scrollProgress");
if (scrollBar) {
  const updateScrollBar = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    scrollBar.style.transform = `scaleX(${scrollable > 0 ? window.scrollY / scrollable : 0})`;
  };
  window.addEventListener("scroll", updateScrollBar, { passive: true });
  updateScrollBar();
}

/* ─── Header scrolled state ─────────────── */
const siteHeader = document.querySelector(".site-header");
if (siteHeader) {
  const onHeaderScroll = () => siteHeader.classList.toggle("scrolled", window.scrollY > 20);
  window.addEventListener("scroll", onHeaderScroll, { passive: true });
  onHeaderScroll();
}


/* ─── Scouting stat box tinting ─────────────── */
const statBoxes = Array.from(document.querySelectorAll(".stat-box"));
if (statBoxes.length) {
  const minAlpha = 0.10;
  const maxAlpha = 0.82;
  const red = "214, 69, 65";
  const green = "20, 138, 96";
  const statColor = (pct) => {
    const p = Math.max(0, Math.min(100, Number(pct)));
    const distance = Math.abs(p - 50) / 50;
    // Curve the scale so 80s, 90s, and elite 99/100s separate more clearly.
    const intensity = Math.pow(distance, 0.55);
    const color = p < 50 ? red : green;
    return { color, intensity };
  };

  statBoxes.forEach((box) => {
    if (box.hasAttribute("data-pct")) {
      const { color, intensity } = statColor(box.getAttribute("data-pct"));
      if (intensity === 0) {
        box.style.setProperty("--highlight", "rgba(255, 255, 255, 0.5)");
        box.style.setProperty("--highlight-border", "rgba(213, 222, 240, 0.9)");
        box.style.setProperty("--highlight-shadow", "rgba(18, 33, 63, 0.04)");
        box.style.setProperty("--highlight-text", "var(--text)");
        return;
      }

      box.style.setProperty("--highlight", `rgba(${color}, ${minAlpha + intensity * (maxAlpha - minAlpha)})`);
      box.style.setProperty("--highlight-border", `rgba(${color}, ${0.42 + intensity * 0.46})`);
      box.style.setProperty("--highlight-shadow", `rgba(${color}, ${0.14 + intensity * 0.28})`);
      box.style.setProperty("--highlight-text", `rgb(${color})`);
    }
  });
}
