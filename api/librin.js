import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { text, question } = req.body || {};
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing GROQ_API_KEY" });

  const prompt = `Fragmento:\n${text}\n\nPregunta del lector: ${question || "Explica en detalle"}\n\nExplica claro, breve y ademas entrega una mirada crítica al fragmento.`;
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mixtral-8x7b-32768", // o tu modelo preferido
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
  });
  if (!resp.ok) {
    const err = await resp.text();
    return res.status(500).json({ error: "Groq error", detail: err });
  }
  const data = await resp.json();
  res.status(200).json({ answer: data.choices?.[0]?.message?.content || "" });
}
