const express = require("express");
const app = express();

app.use(express.json({ limit: "2mb" }));

app.post("/mcp/generate_pdf", async (req, res) => {
  const { html } = req.body || {};
  if (!html) return res.status(400).json({ error: "html is required" });

  return res.json({
    ok: true,
    message: "PDF stub",
    length: html.length
  });
});

app.get("/", (req, res) => res.send("mcp-server alive"));

app.listen(process.env.PORT || 3000);
