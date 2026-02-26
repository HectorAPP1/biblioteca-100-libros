export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { text, question, context = {}, history = [] } = req.body || {};
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing GROQ_API_KEY" });

  const modelCandidates = [
    process.env.GROQ_MODEL,
    "llama-3.3-70b-versatile",
    "llama-3.3-8b-instruct",
    "llama-3.2-90b-text",
    "llama-3.2-11b-text",
  ].filter(Boolean);

  // ── DETECTAR INTENCIÓN ──────────────────────────────────────────
  const q = (question || "").toLowerCase().trim();

  const intent = q.includes("simplif") || q.includes("fácil") || q.includes("facil")
    ? "simplify"
    : q.includes("idea") || q.includes("central") || q.includes("clave") || q.includes("punto")
    ? "key_idea"
    : q.includes("3 punto") || q.includes("bullet") || q.includes("resum")
    ? "summary"
    : q.includes("ejemplo")
    ? "example"
    : q.includes("aplic") || q.includes("vida real") || q.includes("practic")
    ? "apply"
    : q.includes("crit") || q.includes("opini") || q.includes("qué piensas") || q.includes("que piensas")
    ? "opinion"
    : "chat";

  // ── INSTRUCCIÓN SEGÚN INTENCIÓN ──────────────────────────────────
  const intentInstructions = {
    simplify: `Explica la idea en 2 oraciones máximo. Texto corrido, sin listas, sin preguntas al final.`,

    key_idea: `Una sola oración con la idea central. Nada más. Sin pregunta.`,

    summary: `Exactamente 3 puntos numerados, una oración cada uno. Sin introducción, sin cierre, sin pregunta.`,

    example: `Un ejemplo concreto y cotidiano, 2 oraciones. Sin pregunta.`,

    apply: `Una acción concreta que pueda hacer hoy. Específico, no genérico. Sin pregunta.`,

    opinion: `Tu opinión honesta en 2-3 oraciones. Habla en primera persona. Sin pregunta al final.`,

    chat: `Responde directo en 1-3 oraciones. Solo haz una pregunta si el lector claramente quiere seguir el tema — y solo 1 de cada 3 respuestas máximo. Si dudas, no preguntes.`,
  };

  // ── CONSTRUIR HISTORIAL ──────────────────────────────────────────
  // Extraer perfil del lector del historial (intereses, patrones)
  const recentHistory = history.slice(-10);
  const historyMessages = recentHistory.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  // Resumen ligero del lector si hay suficiente historial
  const readerProfile =
    recentHistory.length >= 4
      ? `Nota: llevan una conversación activa. El lector ya ha mostrado interés en ciertos temas — adapta el tono y no repitas lo que ya discutieron.`
      : "";

  // ── SYSTEM PROMPT ────────────────────────────────────────────────
  const systemPrompt = `Eres Librin, compañero de lectura. Como ese amigo que ha leído mucho — directo, con criterio, sin darte ínfulas.

Reglas irrompibles:
- Respuestas CORTAS. 1-3 oraciones es lo ideal. Nunca más de 4.
- NUNCA hagas preguntas en respuestas de simplificar, idea clave, resumen o ejemplo. Nunca.
- En chat u opinión: solo pregunta si el lector claramente quiere profundizar. Máximo 1 pregunta de cada 3 respuestas. Si dudas, no preguntes.
- Sin "¡Claro!", "¡Por supuesto!", "¡Excelente pregunta!" ni relleno de chatbot.
- Sin secciones, subtítulos ni "En resumen:". Habla, no redactes.
- No empieces con "Este fragmento..." ni con el título del libro.
- Español, tuteo, natural.

${readerProfile}`;

  // ── USER PROMPT ──────────────────────────────────────────────────
  const contextLines = [
    context.bookTitle ? `📖 Libro: "${context.bookTitle}"` : null,
    context.pageLabel ? `Ubicación: ${context.pageLabel}` : null,
  ].filter(Boolean).join(" · ");

  const userPrompt = `${contextLines ? contextLines + "\n\n" : ""}${
    text ? `Fragmento que está leyendo:\n"${text.slice(0, 800)}"\n\n` : ""
  }${intentInstructions[intent]}\n\nPregunta: ${question || "¿Qué te parece este fragmento?"}`;

  // ── LLAMADA A GROQ ───────────────────────────────────────────────
  const maxTokensByIntent = {
    key_idea: 50,
    simplify: 70,
    summary: 90,
    example:  80,
    apply:    90,
    opinion: 110,
    chat:    120,
  };

  const maxTokens = maxTokensByIntent[intent] || 200;

  let lastError = null;
  for (const model of modelCandidates) {
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...historyMessages,
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: intent === "chat" || intent === "opinion" ? 0.85 : 0.65,
        }),
      });

      if (!resp.ok) {
        lastError = await resp.text();
        continue;
      }

      const data = await resp.json();
      const answer = data.choices?.[0]?.message?.content?.trim() || "";

      return res.status(200).json({ answer, model, intent });
    } catch (e) {
      lastError = e.message;
      continue;
    }
  }

  return res.status(500).json({ error: "Groq error", detail: lastError || "model_not_found" });
}