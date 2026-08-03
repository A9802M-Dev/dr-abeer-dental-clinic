"use strict";

/**
 * Dr. Abeer Amin Othman Dental Clinic
 * Application namespace: App
 *
 * Single global entry point. Every feature lives inside this closure as an
 * isolated module exposing init(), plus the minimal extra methods needed for
 * cross-module data hand-off (e.g. Booking -> WhatsApp, Booking -> Modal).
 */
const App = (() => {
  /* =================================================================
     CONFIGURATION
     Single source of truth for selectors, state classes, timing and
     flags. Frozen so no module can mutate shared config at runtime.
  ================================================================== */
  const CONFIG = Object.freeze({
    selectors: Object.freeze({
      header: ".site-header",
      menuToggle: ".menu-toggle",
      navigation: "#primary-navigation",
      navigationOverlay: ".navigation-overlay",
      navLinks: "[data-nav-link]",
      backToTopButton: "#back-to-top",
      whatsappFloat: ".whatsapp-float",
      toastContainer: "#toast-container",
      modal: "#modal",
      modalOverlay: ".modal__overlay",
      modalContent: ".modal__content",
      modalClose: ".modal__close",
      modalBody: ".modal__body",
      bookingForm: "#booking-form",
      revealTargets: ".card, .about__content",
    }),
    classes: Object.freeze({
      isOpen: "is-open",
      isVisible: "is-visible",
      isActive: "is-active",
      hasError: "is-invalid",
      isKeyboardUser: "is-keyboard-user",
    }),
    timing: Object.freeze({
      toastDurationMs: 4000,
      resizeDebounceMs: 200,
      revealThreshold: 0.15,
      scrollSpyRootMargin: "-45% 0px -50% 0px",
    }),
    layout: Object.freeze({
      desktopBreakpoint: 992,
    }),
    flags: Object.freeze({
      debug: false,
    }),
  });

  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /* =================================================================
     SHARED UTILITIES
     Pure, small, reusable. No business logic lives here.
  ================================================================== */
  const Utils = (() => {
    function qs(selector, scope = document) {
      return scope.querySelector(selector);
    }

    function qsa(selector, scope = document) {
      return Array.from(scope.querySelectorAll(selector));
    }

    function on(target, type, handler, options) {
      target?.addEventListener(type, handler, options);
    }

    function debounce(fn, waitMs) {
      let timeoutId;
      return (...args) => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => fn(...args), waitMs);
      };
    }

    function prefersReducedMotion() {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function log(level, message) {
      if (!CONFIG.flags.debug) return;
      const writer = console[level] ?? console.log;
      writer(`[App] ${message}`);
    }

    // Focus trap is shared because both the mobile navigation and the
    // modal need identical Tab/Shift+Tab containment behavior.
    function trapFocus(container) {
      const focusableElements = qsa(FOCUSABLE_SELECTOR, container);
      if (focusableElements.length === 0) return () => {};

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      function handleKeydown(event) {
        if (event.key !== "Tab") return;

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
          return;
        }

        if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }

      container.addEventListener("keydown", handleKeydown);
      return () => container.removeEventListener("keydown", handleKeydown);
    }

    return Object.freeze({
      qs,
      qsa,
      on,
      debounce,
      prefersReducedMotion,
      log,
      trapFocus,
    });
  })();

  /* =================================================================
     DOM CACHE
     Queried once at startup. Modules read from this object instead of
     re-querying the document.
  ================================================================== */
  const dom = {};

  function cacheDom() {
    const { selectors } = CONFIG;

    dom.menuToggle = Utils.qs(selectors.menuToggle);
    dom.navigation = Utils.qs(selectors.navigation);
    dom.navigationOverlay = Utils.qs(selectors.navigationOverlay);
    dom.navLinks = Utils.qsa(selectors.navLinks);
    dom.backToTopButton = Utils.qs(selectors.backToTopButton);
    dom.whatsappFloat = Utils.qs(selectors.whatsappFloat);
    dom.toastContainer = Utils.qs(selectors.toastContainer);
    dom.modal = Utils.qs(selectors.modal);
    dom.modalOverlay = Utils.qs(selectors.modalOverlay);
    dom.modalContent = Utils.qs(selectors.modalContent);
    dom.modalClose = Utils.qs(selectors.modalClose);
    dom.modalBody = Utils.qs(selectors.modalBody);
    dom.bookingForm = Utils.qs(selectors.bookingForm);
    dom.revealTargets = Utils.qsa(selectors.revealTargets);

    // Sections are derived from the nav links' own hash targets rather
    // than hardcoded, so the scroll-spy stays correct if links change.
    dom.sections = dom.navLinks
      .map((link) => Utils.qs(link.getAttribute("href")))
      .filter(Boolean);
  }

  /* =================================================================
     TOAST SERVICE
     Lightweight, non-blocking feedback. Screen-reader announcement
     (via the markup's aria-live container) matters more here than
     visual styling, which the current design system does not yet
     define for toasts.
  ================================================================== */
  const ToastService = (() => {
    function createToastElement(message, variant) {
      const toast = document.createElement("p");
      toast.className = `toast toast--${variant}`;
      toast.textContent = message;
      return toast;
    }

    function show(message, variant = "info") {
      if (!dom.toastContainer) return;
      const toast = createToastElement(message, variant);
      dom.toastContainer.append(toast);
      window.setTimeout(() => toast.remove(), CONFIG.timing.toastDurationMs);
    }

    function init() {
      // The container already exists in the markup; nothing to bind.
    }

    return Object.freeze({ init, show });
  })();

  /* =================================================================
     MODAL SERVICE
     Generic dialog infrastructure reused by the Booking module for
     confirmation messages. Owns focus trapping and restoration.
  ================================================================== */
  const ModalService = (() => {
    let lastFocusedElement = null;
    let releaseFocusTrap = null;

    function open(contentNode) {
      if (!dom.modal) return;

      lastFocusedElement = document.activeElement;
      dom.modalBody.replaceChildren(contentNode);
      dom.modal.hidden = false;
      dom.modal.setAttribute("aria-hidden", "false");
      releaseFocusTrap = Utils.trapFocus(dom.modalContent);
      dom.modalClose?.focus();
    }

    function close() {
      if (!dom.modal || dom.modal.hidden) return;

      dom.modal.hidden = true;
      dom.modal.setAttribute("aria-hidden", "true");
      releaseFocusTrap?.();
      lastFocusedElement?.focus();
    }

    function handleKeydown(event) {
      if (event.key === "Escape") close();
    }

    function init() {
      if (!dom.modal) return;
      Utils.on(dom.modalClose, "click", close);
      Utils.on(dom.modalOverlay, "click", close);
      Utils.on(document, "keydown", handleKeydown);
    }

    return Object.freeze({ init, open, close });
  })();

  /* =================================================================
     NAVIGATION MODULE
     Mobile menu toggle, outside-click / Escape dismissal, and
     scroll-spy active-link highlighting.
  ================================================================== */
  const NavigationModule = (() => {
    let isMenuOpen = false;

    function setMenuState(shouldOpen) {
      isMenuOpen = shouldOpen;
      dom.menuToggle.setAttribute("aria-expanded", String(shouldOpen));
      dom.navigation.classList.toggle(CONFIG.classes.isOpen, shouldOpen);
      dom.navigationOverlay.hidden = !shouldOpen;
      dom.navigationOverlay.setAttribute("aria-hidden", String(!shouldOpen));
    }

    function toggleMenu() {
      setMenuState(!isMenuOpen);
    }

    function closeMenu() {
      if (!isMenuOpen) return;
      setMenuState(false);
    }

    function handleNavLinkClick() {
      closeMenu();
    }

    function handleKeydown(event) {
      if (event.key === "Escape" && isMenuOpen) closeMenu();
    }

    function handleOutsideClick(event) {
      if (!isMenuOpen) return;
      const isInsideNav =
        dom.navigation.contains(event.target) ||
        dom.menuToggle.contains(event.target);
      if (!isInsideNav) closeMenu();
    }

    // Prevents the menu from getting stuck open if the viewport is
    // resized from mobile to desktop while it is expanded.
    function handleResize() {
      if (window.innerWidth > CONFIG.layout.desktopBreakpoint) closeMenu();
    }

    function setActiveLink(targetId) {
      dom.navLinks.forEach((link) => {
        const isMatch = link.getAttribute("href") === `#${targetId}`;
        link.classList.toggle(CONFIG.classes.isActive, isMatch);
      });
    }

    function observeSections() {
      if (dom.sections.length === 0) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const visibleEntry = entries.find((entry) => entry.isIntersecting);
          if (visibleEntry) setActiveLink(visibleEntry.target.id);
        },
        { rootMargin: CONFIG.timing.scrollSpyRootMargin },
      );

      dom.sections.forEach((section) => observer.observe(section));
    }

    function init() {
      if (!dom.menuToggle || !dom.navigation) return;

      Utils.on(dom.menuToggle, "click", toggleMenu);
      Utils.on(dom.navigationOverlay, "click", closeMenu);
      dom.navLinks.forEach((link) =>
        Utils.on(link, "click", handleNavLinkClick),
      );
      Utils.on(document, "keydown", handleKeydown);
      Utils.on(document, "click", handleOutsideClick);
      Utils.on(
        window,
        "resize",
        Utils.debounce(handleResize, CONFIG.timing.resizeDebounceMs),
      );

      observeSections();
    }

    return Object.freeze({ init });
  })();

  /* =================================================================
     REVEAL MODULE
     Adds a state class once an element enters the viewport. Purely
     additive: current CSS has no matching transition yet, but the
     hook is safe and forward-compatible for future styling.
  ================================================================== */
  const RevealModule = (() => {
    function revealElement(element, observer) {
      element.classList.add(CONFIG.classes.isVisible);
      observer.unobserve(element);
    }

    function init() {
      if (dom.revealTargets.length === 0) return;

      if (Utils.prefersReducedMotion()) {
        dom.revealTargets.forEach((element) =>
          element.classList.add(CONFIG.classes.isVisible),
        );
        return;
      }

      const observer = new IntersectionObserver(
        (entries, currentObserver) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting)
              revealElement(entry.target, currentObserver);
          });
        },
        { threshold: CONFIG.timing.revealThreshold },
      );

      dom.revealTargets.forEach((element) => observer.observe(element));
    }

    return Object.freeze({ init });
  })();

  /* =================================================================
     BACK TO TOP MODULE
     Uses IntersectionObserver against the hero section instead of a
     scroll listener, avoiding continuous scroll-position math.
  ================================================================== */
  const BackToTopModule = (() => {
    function showButton() {
      dom.backToTopButton.hidden = false;
    }

    function hideButton() {
      dom.backToTopButton.hidden = true;
    }

    function scrollToTop() {
      window.scrollTo({
        top: 0,
        behavior: Utils.prefersReducedMotion() ? "auto" : "smooth",
      });
    }

    function init() {
      if (!dom.backToTopButton || dom.sections.length === 0) return;

      const [heroSection] = dom.sections;
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          hideButton();
        } else {
          showButton();
        }
      });

      observer.observe(heroSection);
      Utils.on(dom.backToTopButton, "click", scrollToTop);
    }

    return Object.freeze({ init });
  })();

  /* =================================================================
     WHATSAPP MODULE
     Builds and opens a prefilled WhatsApp conversation from booking
     data. The phone number is read from the existing floating link
     rather than duplicated as a hardcoded string.
  ================================================================== */
  const WhatsAppModule = (() => {
    function extractPhoneNumber() {
      if (!dom.whatsappFloat) return "";
      const { pathname } = new URL(dom.whatsappFloat.href);
      return pathname.replace("/", "");
    }

    function buildMessage(data) {
      return [
        "طلب حجز موعد جديد",
        `الاسم: ${data.fullName}`,
        `الهاتف: ${data.phone}`,
        `الخدمة: ${data.service}`,
        data.message ? `ملاحظات: ${data.message}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }

    function sendBooking(data) {
      const phoneNumber = extractPhoneNumber();
      if (!phoneNumber) {
        Utils.log(
          "warn",
          "WhatsApp number unavailable; booking message not sent.",
        );
        return;
      }

      const message = buildMessage(data);
      const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }

    function init() {
      // Reserved for future WhatsApp-specific enhancements.
    }

    return Object.freeze({ init, sendBooking });
  })();

  /* =================================================================
     BOOKING MODULE
     Validation, inline error rendering, duplicate-submission
     prevention, and hand-off to the WhatsApp and Modal services.
  ================================================================== */
  const BookingModule = (() => {
    let isSubmitting = false;

    const validators = Object.freeze({
      fullName: (value) => value.trim().length >= 3,
      phone: (value) => /^[0-9+\s-]{7,20}$/.test(value.trim()),
      service: (value) => value.trim().length > 0,
    });

    const errorMessages = Object.freeze({
      fullName: "الرجاء إدخال الاسم الكامل (3 أحرف على الأقل).",
      phone: "الرجاء إدخال رقم هاتف صحيح.",
      service: "الرجاء اختيار الخدمة المطلوبة.",
    });

    function getField(name) {
      return dom.bookingForm.elements.namedItem(name);
    }

    function getErrorElement(field) {
      const existing = field.nextElementSibling;
      if (existing?.classList.contains("form-field__error")) return existing;

      const errorElement = document.createElement("span");
      errorElement.className = "form-field__error";
      errorElement.id = `${field.id}-error`;
      field.insertAdjacentElement("afterend", errorElement);
      field.setAttribute("aria-describedby", errorElement.id);
      return errorElement;
    }

    function setFieldError(field, message) {
      const errorElement = getErrorElement(field);
      errorElement.textContent = message ?? "";
      field.classList.toggle(CONFIG.classes.hasError, Boolean(message));
      field.setAttribute("aria-invalid", String(Boolean(message)));
    }

    function validateField(name) {
      const field = getField(name);
      if (!field) return true;

      const isValid = validators[name](field.value);
      setFieldError(field, isValid ? null : errorMessages[name]);
      return isValid;
    }

    function validateForm() {
      return Object.keys(validators).map(validateField).every(Boolean);
    }

    function collectFormData() {
      const formData = new FormData(dom.bookingForm);
      return {
        fullName: (formData.get("fullName") ?? "").trim(),
        phone: (formData.get("phone") ?? "").trim(),
        service: (formData.get("service") ?? "").trim(),
        message: (formData.get("message") ?? "").trim(),
      };
    }

    function buildConfirmationContent(data) {
      const confirmation = document.createElement("div");

      const heading = document.createElement("h3");
      heading.textContent = "تم استلام طلب الحجز";

      const description = document.createElement("p");
      description.textContent = `سنتواصل معك قريبًا على الرقم ${data.phone} لتأكيد خدمة ${data.service}.`;

      confirmation.append(heading, description);
      return confirmation;
    }

    function setSubmittingState(shouldSubmit) {
      isSubmitting = shouldSubmit;
      const submitButton = dom.bookingForm.querySelector(
        '[data-action="booking-submit"]',
      );
      if (submitButton) submitButton.disabled = shouldSubmit;
    }

    function focusFirstInvalidField() {
      dom.bookingForm.querySelector(`.${CONFIG.classes.hasError}`)?.focus();
    }

    function handleSubmit(event) {
      event.preventDefault();
      if (isSubmitting) return;

      if (!validateForm()) {
        ToastService.show("يرجى تصحيح الحقول المطلوبة.", "error");
        focusFirstInvalidField();
        return;
      }

      setSubmittingState(true);

      try {
        const data = collectFormData();

        try {
          WhatsAppModule.sendBooking(data);
        } catch (error) {
          Utils.log("error", `WhatsApp failed: ${error.message}`);
        }

        ModalService.open(buildConfirmationContent(data));

        dom.bookingForm.reset();
      } finally {
        setSubmittingState(false);
      }
    }

    function handleFieldBlur(event) {
      const { name } = event.target;
      if (validators[name]) validateField(name);
    }

    function init() {
      if (!dom.bookingForm) return;

      Utils.on(dom.bookingForm, "submit", handleSubmit);
      Object.keys(validators).forEach((name) => {
        Utils.on(getField(name), "blur", handleFieldBlur);
      });
    }

    return Object.freeze({ init });
  })();

  /* =================================================================
     ACCESSIBILITY MODULE
     Cross-cutting concerns that don't belong to any single feature:
     reduced-motion state, keyboard-vs-mouse focus styling hooks.
  ================================================================== */
  const AccessibilityModule = (() => {
    function markKeyboardUser(event) {
      if (event.key === "Tab") {
        document.body.classList.add(CONFIG.classes.isKeyboardUser);
      }
    }

    function markMouseUser() {
      document.body.classList.remove(CONFIG.classes.isKeyboardUser);
    }

    function syncReducedMotionPreference(mediaQueryList) {
      document.documentElement.dataset.motion = mediaQueryList.matches
        ? "reduced"
        : "full";
    }

    function init() {
      document.documentElement.classList.add("has-js");

      const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      syncReducedMotionPreference(motionQuery);
      motionQuery.addEventListener("change", () =>
        syncReducedMotionPreference(motionQuery),
      );

      Utils.on(document, "keydown", markKeyboardUser);
      Utils.on(document, "mousedown", markMouseUser);
    }

    return Object.freeze({ init });
  })();

  /* =================================================================
     APPLICATION BOOTSTRAP
     Registers modules and initializes them defensively: one failing
     module must never prevent the rest of the application from
     starting.
  ================================================================== */
  const modules = Object.freeze([
    NavigationModule,
    RevealModule,
    BackToTopModule,
    WhatsAppModule,
    BookingModule,
    AccessibilityModule,
  ]);

  let isInitialized = false;

  function initializeModules() {
    modules.forEach((module) => {
      try {
        module.init();
      } catch (error) {
        Utils.log("error", `Module failed to initialize: ${error.message}`);
      }
    });
  }

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    cacheDom();
    ToastService.init();
    ModalService.init();
    initializeModules();
  }

  return Object.freeze({ init });
})();

document.addEventListener("DOMContentLoaded", () => App.init());
