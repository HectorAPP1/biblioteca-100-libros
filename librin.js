(() => {
  const fab = document.getElementById("librin-fab");
  const modalBg = document.getElementById("librin-modal");
  const textArea = document.getElementById("librin-text");
  const questionInput = document.getElementById("librin-question");
  const answerBox = document.getElementById("librin-answer");
  const sendBtn = document.getElementById("librin-send");

  if (!fab || !modalBg || !textArea || !questionInput || !answerBox || !sendBtn)
    return;

  let selectionText = "";
  let allowFab = true;
  let currentContext = {
    bookTitle: "",
    pageLabel: "",
    visibleText: "",
  };

  function closeModal() {
    modalBg.classList.remove("open");
    document.body.style.overflow = "";
  }

  function openModal() {
    textArea.value = selectionText;
    questionInput.value = "";
    answerBox.textContent = "";
    modalBg.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  window.openLibrinModalFromSelection = () => {
    if (!selectionText) {
      const sel = window.getSelection()?.toString()?.trim();
      if (sel) selectionText = sel;
    }
    if (!selectionText) return;
    openModal();
  };

  window.closeLibrinModal = closeModal;

  modalBg.addEventListener("click", (e) => {
    if (e.target === modalBg) closeModal();
  });

  sendBtn.onclick = async () => {
    const text = (textArea.value || "").trim();
    const question = (questionInput.value || "").trim();
    if (!text) return;
    answerBox.textContent = "Consultando a Librin...";
    try {
      const payload = {
        text,
        question,
        context: currentContext,
      };
      const resp = await fetch("/api/librin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let data;
      try {
        data = await resp.json();
      } catch (e) {
        const raw = await resp.text().catch(() => "");
        throw new Error(raw || "Error de red");
      }
      if (!resp.ok)
        throw new Error(data?.detail || data?.error || "Error de red");
      answerBox.textContent = data.answer || "Sin respuesta";
    } catch (err) {
      answerBox.textContent = "Error: " + err.message;
    }
  };

  function attachSelectionListeners(contents) {
    const doc = contents?.document;
    const win = doc?.defaultView;
    if (!doc || !win) return;

    doc.addEventListener("selectionchange", () => {
      if (!allowFab) return;
      const txt = win.getSelection()?.toString()?.trim();
      if (txt) {
        selectionText = txt;
      }
    });
  }

  function clearSelectionUI() {
    selectionText = "";
    fab.style.display = "none";
  }

  window.initLibrinHooks = (rendition) => {
    if (!rendition) return;
    allowFab = true;
    clearSelectionUI();
    if (fab) fab.style.display = "block";

    rendition.on("rendered", (_section, contents) => {
      try {
        const visible = contents?.document?.body?.innerText || "";
        currentContext.visibleText = visible.slice(0, 4000);
      } catch (e) {}
      attachSelectionListeners(contents);
    });

    rendition.on("relocated", (loc) => {
      currentContext.pageLabel = loc?.start?.displayed?.page
        ? `Página ${loc.start.displayed.page}/${loc.start.displayed.total || "?"}`
        : "";
    });

    rendition.on("selected", (cfi, contents) => {
      const range = contents.range(cfi);
      const txt = range?.toString()?.trim();
      if (txt) {
        selectionText = txt;
      }
    });
  };

  // Hide FAB when leaving reader
  window.hideLibrinFab = () => clearSelectionUI();

  // Mantener el FAB visible para abrir chat manualmente
  if (fab) {
    fab.style.display = "block";
  }
})();
