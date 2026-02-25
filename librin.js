(() => {
  const fab = document.getElementById("librin-fab");
  const panel = document.getElementById("librin-modal");
  const textArea = document.getElementById("librin-text");
  const qInput = document.getElementById("librin-question");
  const chatBox = document.getElementById("librin-chat");
  const sendBtn = document.getElementById("librin-send");

  if (!fab || !panel || !textArea || !qInput || !chatBox || !sendBtn) return;

  let selectionText = "";
  let currentContext = { bookTitle: "", pageLabel: "", visibleText: "" };
  let conversationHistory = [];

  // Firebase — inyectados desde initLibrinHooks
  let _db = null,
    _getUser = null,
    _bookId = null,
    _historyLoaded = false;

  // ── POSICIÓN ──────────────────────────────────────────────────────
  function positionFab() {
    // El FAB siempre se posiciona mediante CSS (right/bottom fijos).
    // Esta función solo asegura que no haya left/top residuales.
    fab.style.right = "";
    fab.style.bottom = "";
    fab.style.left = "";
    fab.style.top = "";
  }

  function positionPanel() {
    // El FAB siempre está en right:24, bottom:28 (CSS fijo)
    // El panel se posiciona justo encima del FAB, alineado a la derecha
    const FAB_RIGHT = 24;
    const FAB_BOTTOM = 28;
    const FAB_H = fab.offsetHeight || 52;
    const pw = panel.offsetWidth || 360;
    const ph = panel.offsetHeight || 540;

    const right = FAB_RIGHT;
    const bottom = FAB_BOTTOM + FAB_H + 12;

    panel.style.right = right + "px";
    panel.style.bottom = bottom + "px";
    panel.style.left = "";
    panel.style.top = "";
  }

  // ── DRAG ENGINE (solo para el panel, no para el FAB) ─────────────
  function makeDraggable(target, handle, onClickCb) {
    let dragging = false;
    let startPointerX, startPointerY, startElemX, startElemY;

    handle.addEventListener("pointerdown", (e) => {
      if (e.target !== handle && e.target.closest("button")) return;
      if (e.button !== 0) return;

      e.preventDefault();
      dragging = false;

      const rect = target.getBoundingClientRect();
      startPointerX = e.clientX;
      startPointerY = e.clientY;
      startElemX = rect.left;
      startElemY = rect.top;

      target.style.left = rect.left + "px";
      target.style.top = rect.top + "px";
      target.style.right = "";
      target.style.bottom = "";

      function onMove(ev) {
        const dx = ev.clientX - startPointerX;
        const dy = ev.clientY - startPointerY;

        if (!dragging && Math.hypot(dx, dy) > 5) {
          dragging = true;
          target.style.transition = "none";
        }
        if (!dragging) return;

        const W = window.innerWidth,
          H = window.innerHeight;
        const tw = target.offsetWidth,
          th = target.offsetHeight;

        target.style.left =
          Math.max(0, Math.min(startElemX + dx, W - tw)) + "px";
        target.style.top =
          Math.max(0, Math.min(startElemY + dy, H - th)) + "px";
      }

      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        target.style.transition = "";

        if (!dragging) {
          onClickCb && onClickCb();
        }
        dragging = false;
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  }

  // FAB: solo click, SIN drag — siempre fijo abajo a la derecha
  fab.addEventListener("click", () => {
    if (panel.classList.contains("open")) closePanel();
    else openPanel();
  });

  // Aplicar drag solo al panel (desde el header)
  const panelHead = panel.querySelector(".modal-head");
  if (panelHead) {
    makeDraggable(panel, panelHead, null);
  }

  // ── OPEN / CLOSE ──────────────────────────────────────────────────
  function openPanel() {
    textArea.value = selectionText;
    qInput.value = "";
    panel.style.display = "flex";

    // Calcular posición si no fue movido manualmente
    const hasManualPos = panel.style.left && panel.style.left !== "";
    if (!hasManualPos) positionPanel();

    panel.offsetHeight; // reflow
    panel.classList.add("open");

    if (!_historyLoaded) loadHistory();
    setTimeout(() => qInput.focus(), 60);
  }

  function closePanel() {
    panel.classList.remove("open");
    setTimeout(() => {
      if (!panel.classList.contains("open")) panel.style.display = "";
    }, 220);
  }

  window.openLibrinModalFromSelection = () => {
    if (!selectionText) {
      const sel = window.getSelection()?.toString()?.trim();
      if (sel) selectionText = sel;
    }
    if (!selectionText && currentContext.visibleText) {
      selectionText = currentContext.visibleText.slice(0, 1000);
    }
    openPanel();
  };

  window.closeLibrinModal = closePanel;

  // Cerrar al hacer clic fuera
  document.addEventListener("click", (e) => {
    if (
      panel.classList.contains("open") &&
      !panel.contains(e.target) &&
      !fab.contains(e.target)
    )
      closePanel();
  });

  // ── FIRESTORE ─────────────────────────────────────────────────────
  async function loadHistory() {
    if (!_db || !_getUser || !_bookId) return;
    const user = _getUser();
    if (!user) return;
    try {
      const ref = window._fbDoc(
        _db,
        "users",
        user.uid,
        "books",
        String(_bookId),
        "librin",
        "chat",
      );
      const snap = await window._fbGetDoc(ref);
      if (snap.exists()) {
        conversationHistory = snap.data().history || [];
        renderHistoryInChat();
      }
    } catch (e) {
      console.warn("Librin load:", e);
    }
    _historyLoaded = true;
  }

  async function saveHistory() {
    if (!_db || !_getUser || !_bookId) return;
    const user = _getUser();
    if (!user) return;
    try {
      const ref = window._fbDoc(
        _db,
        "users",
        user.uid,
        "books",
        String(_bookId),
        "librin",
        "chat",
      );
      await window._fbSetDoc(ref, {
        history: conversationHistory.slice(-30),
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Librin save:", e);
    }
  }

  function renderHistoryInChat() {
    chatBox.innerHTML = "";
    if (!conversationHistory.length) return;
    const sep = document.createElement("div");
    sep.className = "lmsg-sep";
    sep.textContent = "— conversación anterior —";
    chatBox.appendChild(sep);
    conversationHistory.forEach((m) => {
      const el = document.createElement("div");
      el.className = "lmsg " + (m.role === "user" ? "user" : "bot");
      el.innerHTML = formatMessage(m.content);
      chatBox.appendChild(el);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // ── MENSAJES ──────────────────────────────────────────────────────
  function formatMessage(text) {
    const esc = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const bold = esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return bold
      .split("\n")
      .map((l) =>
        /^\d+\.\s|^[-•]\s/.test(l.trim())
          ? `<div class="lmsg-li">${l.trim()}</div>`
          : l,
      )
      .join("<br>")
      .replace(/(<br>\s*){2,}/g, "<br>");
  }

  function addMsg(text, role) {
    const el = document.createElement("div");
    el.className = "lmsg " + role;
    el.innerHTML = formatMessage(text);
    chatBox.appendChild(el);
    chatBox.scrollTop = chatBox.scrollHeight;
    return el;
  }

  function addTyping() {
    const el = document.createElement("div");
    el.className = "lmsg typing";
    el.innerHTML =
      '<div class="typing-dots"><span></span><span></span><span></span></div>';
    chatBox.appendChild(el);
    chatBox.scrollTop = chatBox.scrollHeight;
    return el;
  }

  // ── SEND ──────────────────────────────────────────────────────────
  async function sendMessage(override) {
    const text = (textArea.value || "").trim();
    const question = (
      override !== undefined ? override : qInput.value || ""
    ).trim();
    if (!question && !text) return;

    addMsg(question || "Analiza este texto", "user");
    qInput.value = "";
    conversationHistory.push({
      role: "user",
      content: question || "Analiza este texto",
    });

    const typing = addTyping();
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
      } catch {
        throw new Error(await resp.text().catch(() => "Error de red"));
      }

      typing.remove();
      if (!resp.ok) throw new Error(data?.detail || data?.error || "Error");

      const answer = data.answer || "Sin respuesta";
      addMsg(answer, "bot");
      conversationHistory.push({ role: "assistant", content: answer });
      if (conversationHistory.length > 30)
        conversationHistory = conversationHistory.slice(-30);
      saveHistory();
    } catch (err) {
      typing.remove();
      addMsg("Error: " + err.message, "bot");
    } finally {
      sendBtn.disabled = false;
      qInput.focus();
    }
  }

  sendBtn.addEventListener("click", () => sendMessage());
  qInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  document
    .querySelectorAll(".librin-chip")
    .forEach((c) =>
      c.addEventListener("click", () => sendMessage(c.dataset.prompt || "")),
    );

  // ── EPUB HOOKS ────────────────────────────────────────────────────
  function attachSelection(contents) {
    const d = contents?.document,
      w = d?.defaultView;
    if (!d || !w) return;
    d.addEventListener("selectionchange", () => {
      const t = w.getSelection()?.toString()?.trim();
      if (t) selectionText = t;
    });
  }

  window.initLibrinHooks = (rendition, ctx = {}) => {
    if (!rendition) return;
    _db = ctx.db || null;
    _getUser = ctx.getUser || null;
    _bookId = ctx.bookId || null;
    _historyLoaded = false;

    chatBox.innerHTML = "";
    conversationHistory = [];
    selectionText = "";

    // Mostrar FAB en su posición por defecto (abajo derecha, via CSS)
    if (fab) {
      fab.style.display = "flex";
      fab.style.left = "";
      fab.style.top = "";
      positionFab();
    }

    // Resetear posición del panel para que se recalcule al abrir
    panel.style.left = "";
    panel.style.top = "";
    panel.style.right = "";
    panel.style.bottom = "";

    rendition.on("rendered", (_, contents) => {
      try {
        currentContext.visibleText = (
          contents?.document?.body?.innerText || ""
        ).slice(0, 4000);
      } catch {}
      attachSelection(contents);
    });

    rendition.on("relocated", (loc) => {
      currentContext.pageLabel = loc?.start?.displayed?.page
        ? `Página ${loc.start.displayed.page}/${loc.start.displayed.total || "?"}`
        : "";
    });

    rendition.on("selected", (cfi, contents) => {
      const t = contents.range(cfi)?.toString()?.trim();
      if (t) {
        selectionText = t;
        if (panel.classList.contains("open")) textArea.value = t;
      }
    });
  };

  window.hideLibrinFab = () => {
    selectionText = "";
    conversationHistory = [];
    _historyLoaded = false;
    chatBox.innerHTML = "";
    if (fab) fab.style.display = "none";
    closePanel();
  };
})();
