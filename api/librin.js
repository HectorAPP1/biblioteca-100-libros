export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { text, question, context = {}, history = [] } = req.body || {};
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing GROQ_API_KEY" });

  // Modelo principal y fallback por deprecaciones
  const modelCandidates = [
    process.env.GROQ_MODEL,
    "llama-3.3-70b-versatile", // recomendación actual
    "llama-3.3-8b-instruct", // opción liviana actual
    "llama-3.2-90b-text", // fallback v4 grande
    "llama-3.2-11b-text", // fallback v4 liviano
  ].filter(Boolean);

  const historyText = history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Lector" : "Librin"}: ${m.content}`)
    .join("\n");

  const ctx = [
    context.bookTitle ? `Libro: ${context.bookTitle}` : null,
    context.pageLabel ? `Página: ${context.pageLabel}` : null,
    context.visibleText ? `Texto visible: ${context.visibleText}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Contexto de lectura:\n${ctx || "(sin contexto)"}\n\nHistorial reciente:\n${historyText || "(sin historial)"}\n\nFragmento actual:\n${text}\n\nPregunta del lector: ${
    question || "Explica en detalle"
  }\n\nExplica claro, breve y ofrece mirada crítica/útil para el lector.`;
  let lastError = null;
  for (const model of modelCandidates) {
    const resp = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "Eres Librin, ayudas a entender textos de libros de forma clara y concisa, ademas debes ser un experto en la materia.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 400,
        }),
      },
    );
    if (!resp.ok) {
      lastError = await resp.text();
      continue;
    }
    const data = await resp.json();
    return res
      .status(200)
      .json({ answer: data.choices?.[0]?.message?.content || "", model });
  }

  return res
    .status(500)
    .json({ error: "Groq error", detail: lastError || "model_not_found" });
}
