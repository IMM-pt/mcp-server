const fetch = require("node-fetch");
const express = require("express");
const { PDFDocument, StandardFonts } = require("pdf-lib");

// MCP SERVER (API nova)
const { Server } = require("@modelcontextprotocol/sdk/server");
const mcpServer = new Server();

// TOOL (API nova)
mcpServer.addTool({
  name: "render",
  description: "Render HTML to PDF",
  inputSchema: {
    type: "object",
    properties: {
      html: { type: "string" },
      filename: { type: "string" }
    },
    required: ["html"]
  },
  outputSchema: {
    type: "object",
    properties: {
      downloadUrl: { type: "string" }
    }
  },
  handler: async ({ html, filename }) => {
    console.log("MCP tool 'render' called");

    const response = await fetch("https://web-production-32241.up.railway.app/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, filename })
    });

    return await response.json();
  }
});

// EXPRESS
const app = express();
app.use(express.json({ limit: "2mb" }));

async function htmlToPdf(html) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const plainText = html.replace(/<[^>]+>/g, "");

  page.drawText(plainText, {
    x: 20,
    y: page.getHeight() - 40,
    size: 12,
    font,
    maxWidth: page.getWidth() - 40,
    lineHeight: 14
  });

  return await pdfDoc.save();
}

app.post("/mcp/generate_pdf", async (req, res) => {
  try {
    const { html } = req.body || {};
    if (!html) return res.status(400).json({ error: "html is required" });

    const pdfBuffer = await htmlToPdf(html);

    res.setHeader("Content-Type", "application/pdf");
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

app.get("/", (req, res) => {
  res.send("mcp-server alive");
});

// Start MCP + Express
mcpServer.start();
app.listen(process.env.PORT || 3000, () => {
  console.log("MCP server running");
});
