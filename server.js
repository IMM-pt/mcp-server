const express = require("express");
const pdf = require("html-pdf-node");

const app = express();

// Permite receber HTML grande
app.use(express.json({ limit: "2mb" }));

// Endpoint MCP para gerar PDF
app.post("/mcp/generate_pdf", async (req, res) => {
  try {
    const { html } = req.body || {};
    if (!html) {
      return res.status(400).json({ error: "html is required" });
    }

    // Cria o PDF a partir do HTML recebido
    const file = { content: html };

    const pdfBuffer = await pdf.generatePdf(file, {
      format: "A4",
      printBackground: true
    });

    // Envia o PDF como binário
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdfBuffer);

  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// Endpoint raiz
app.get("/", (req, res) => {
  res.send("mcp-server alive");
});

// Arranque do servidor
app.listen(process.env.PORT || 3000, () => {
  console.log("MCP server running");
});

