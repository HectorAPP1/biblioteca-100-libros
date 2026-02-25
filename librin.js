(() => {
  const fab = document.getElementById("librin-fab");
  const panel = document.getElementById("librin-modal");
  const textArea = document.getElementById("librin-text");
  const questionInput = document.getElementById("librin-question");
  const chatBox = document.getElementById("librin-chat");
  const sendBtn = document.getElementById("librin-send");

  if (!fab || !panel || !textArea || !questionInput || !chatBox || !sendBtn)
    return;

  let selectionText = "";
  let currentContext = { bookTitle: "", pageLabel: "", visibleText: "" };
  // Historial para que Librin aprenda del lector en la sesión
  let conversationHistory = [];

  // ── POSICIÓN PERSISTENTE ──────────────────────────────────────────
  let fabPos = null;
  let panelPos = null;

  function applyFabPos() {
    if (!fabPos) return;
    fab.style.right = fabPos.right + "px";
    fab.style.bottom = fabPos.bottom + "px";
    fab.style.left = "";
    fab.style.top = "";
  }

  function syncPanelToFab() {
    if (panelPos) {
      panel.style.left = panelPos.left + "px";
      panel.style.top = panelPos.top + "px";
      panel.style.right = "";
      panel.style.bottom = "";
    } else {
      const fw = fab.offsetWidth || 52;
      const fh = fab.offsetHeight || 52;
      const fr = fabPos ? fabPos.right : 24;
      const fb = fabPos ? fabPos.bottom : 28;
      const pw = panel.offsetWidth || 360;
      const ph = panel.offsetHeight || 540;
      const L = window.innerWidth - fr - fw / 2 - pw / 2;
      const T = window.innerHeight - fb - fh - 12 - ph;
      panel.style.left =
        Math.max(8, Math.min(L, window.innerWidth - pw - 8)) + "px";
      panel.style.top =
        Math.max(8, Math.min(T, window.innerHeight - ph - 8)) + "px";
      panel.style.right = "";
      panel.style.bottom = "";
    }
  }

  // ── OPEN / CLOSE ──────────────────────────────────────────────────
  function closeModal() {
    panel.classList.remove("open");
    setTimeout(() => {
      if (!panel.classList.contains("open")) panel.style.display = "";
    }, 220);
  }

  function openModal() {
    textArea.value = selectionText;
    questionInput.value = "";
    panel.style.display = "flex";
    syncPanelToFab();
    panel.offsetHeight;
    panel.classList.add("open");
    setTimeout(() => questionInput.focus(), 50);
  }

  window.openLibrinModalFromSelection = () => {
    if (!selectionText) {
      const sel = window.getSelection()?.toString()?.trim();
      if (sel) selectionText = sel;
    }
    if (!selectionText && currentContext.visibleText) {
      selectionText = currentContext.visibleText.slice(0, 1000);
    }
    openModal();
  };

  window.closeLibrinModal = closeModal;

  // ── DRAG: FAB ─────────────────────────────────────────────────────
  makeDraggable(fab, fab, {
    onDragStart() {
      fab.classList.add("dragging");
    },
    onDragEnd(left, top) {
      fab.classList.remove("dragging");
      fabPos = {
        right: window.innerWidth - left - fab.offsetWidth,
        bottom: window.innerHeight - top - fab.offsetHeight,
      };
      applyFabPos();
    },
    onClick() {
      if (panel.classList.contains("open")) closeModal();
      else window.openLibrinModalFromSelection();
    },
  });

  // ── DRAG: PANEL ───────────────────────────────────────────────────
  const panelHeader = panel.querySelector(".modal-head");
  makeDraggable(panel, panelHeader, {
    onDragStart() {
      panel.classList.add("dragging");
    },
    onDragEnd(left, top) {
      panel.classList.remove("dragging");
      panelPos = { left, top };
    },
    onClick() {},
  });

  document.addEventListener("click", (e) => {
    if (
      panel.classList.contains("open") &&
      !panel.contains(e.target) &&
      !fab.contains(e.target)
    ) {
      closeModal();
    }
  });

  // ── DRAG ENGINE ───────────────────────────────────────────────────
  function makeDraggable(target, handle, { onDragStart, onDragEnd, onClick }) {
    let startX,
      startY,
      startL,
      startT,
      dragged = false;

    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") && e.target.closest("button") !== handle)
        return;
      if (e.button !== 0) return;

      dragged = false;
      const rect = target.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startL = rect.left;
      startT = rect.top;

      handle.setPointerCapture(e.pointerId);
      e.preventDefault();

      function onMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!dragged && Math.hypot(dx, dy) > 4) {
          dragged = true;
          onDragStart && onDragStart();
        }
        if (!dragged) return;
        const W = window.innerWidth,
          H = window.innerHeight;
        const tw = target.offsetWidth,
          th = target.offsetHeight;
        const newL = Math.max(0, Math.min(startL + dx, W - tw));
        const newT = Math.max(0, Math.min(startT + dy, H - th));
        target.style.left = newL + "px";
        target.style.top = newT + "px";
        target.style.right = "";
        target.style.bottom = "";
      }

      function onUp(ev) {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        if (dragged) {
          const rect = target.getBoundingClientRect();
          onDragEnd && onDragEnd(rect.left, rect.top);
        } else {
          onClick && onClick();
        }
      }

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  // ── RENDERIZAR MENSAJES ───────────────────────────────────────────
  function formatMessage(text) {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const withBold = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const lines = withBold.split("\n").map((line) => {
      if (/^\d+\.\s/.test(line.trim()))
        return `<div class="lmsg-li">${line.trim()}</div>`;
      if (/^[-•]\s/.test(line.trim()))
        return `<div class="lmsg-li">${line.trim()}</div>`;
      return line;
    });
    return lines.join("<br>").replace(/(<br>\s*){2,}/g, "<br>");
  }

  function addMessage(text, role) {
    const msg = document.createElement("div");
    msg.className = "lmsg " + role;
    msg.innerHTML = formatMessage(text);
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msg;
  }

  function addTyping() {
    const msg = document.createElement("div");
    msg.className = "lmsg typing";
    msg.innerHTML =
      '<div class="typing-dots"><span></span><span></span><span></span></div>';
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msg;
  }

  // ── SEND ──────────────────────────────────────────────────────────
  async function sendMessage(overrideQuestion) {
    const text = (textArea.value || "").trim();
    const question = (
      overrideQuestion !== undefined
        ? overrideQuestion
        : questionInput.value || ""
    ).trim();
    if (!question && !text) return;

    const displayQuestion = question || "Analiza este texto";
    addMessage(displayQuestion, "user");
    questionInput.value = "";

    // Registrar en historial
    conversationHistory.push({ role: "user", content: displayQuestion });

    const typingEl = addTyping();
    sendBtn.disabled = true;

    try {
      const resp = await fetch("/api/librin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          question,
          context: currentContext,
          history: conversationHistory.slice(-10),
        }),
      });

      let data;
      try {
        data = await resp.json();
      } catch (e) {
        const raw = await resp.text().catch(() => "");
        throw new Error(raw || "Error de red");
      }

      typingEl.remove();
      if (!resp.ok)
        throw new Error(data?.detail || data?.error || "Error de red");

      const answer = data.answer || "Sin respuesta";
      addMessage(answer, "bot");

      // Guardar respuesta en historial
      conversationHistory.push({ role: "assistant", content: answer });
      if (conversationHistory.length > 20)
        conversationHistory = conversationHistory.slice(-20);
    } catch (err) {
      typingEl.remove();
      addMessage("Algo falló: " + err.message, "bot");
    } finally {
      sendBtn.disabled = false;
      questionInput.focus();
    }
  }

  sendBtn.addEventListener("click", () => sendMessage());
  questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ── CHIPS ─────────────────────────────────────────────────────────
  document.querySelectorAll(".librin-chip").forEach((chip) => {
    chip.addEventListener("click", () =>
      sendMessage(chip.dataset.prompt || ""),
    );
  });

  // ── EPUB HOOKS ────────────────────────────────────────────────────
  function attachSelectionListeners(contents) {
    const doc = contents?.document;
    const win = doc?.defaultView;
    if (!doc || !win) return;
    doc.addEventListener("selectionchange", () => {
      const txt = win.getSelection()?.toString()?.trim();
      if (txt) selectionText = txt;
    });
  }

  window.initLibrinHooks = (rendition) => {
    if (!rendition) return;
    selectionText = "";
    if (fab) {
      fab.style.display = "flex";
      applyFabPos();
    }

    rendition.on("rendered", (_section, contents) => {
      try {
        currentContext.visibleText = (
          contents?.document?.body?.innerText || ""
        ).slice(0, 4000);
      } catch (e) {}
      attachSelectionListeners(contents);
    });

    rendition.on("relocated", (loc) => {
      currentContext.pageLabel = loc?.start?.displayed?.page
        ? "Página " +
          loc.start.displayed.page +
          "/" +
          (loc.start.displayed.total || "?")
        : "";
    });

    rendition.on("selected", (cfi, contents) => {
      const txt = contents.range(cfi)?.toString()?.trim();
      if (txt) {
        selectionText = txt;
        if (panel.classList.contains("open")) textArea.value = txt;
      }
    });
  };

  // Limpiar historial al cambiar de libro
  window.hideLibrinFab = () => {
    selectionText = "";
    conversationHistory = [];
    if (fab) fab.style.display = "none";
    closeModal();
  };
})();
