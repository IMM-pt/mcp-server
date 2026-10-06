// ------------------------------------------------------
// FETCH
// ------------------------------------------------------
const fetch = require("node-fetch");

// ------------------------------------------------------
// PDF-LIB (para PDF local e para o futuro PDF-Compiler)
// ------------------------------------------------------
const { PDFDocument, StandardFonts } = require("pdf-lib");

// ------------------------------------------------------
// EXPRESS
// ------------------------------------------------------
const express = require("express");

// ------------------------------------------------------
// MCP SDK (API moderna)
// ------------------------------------------------------
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

const { z } = require("zod");

// ------------------------------------------------------
// MCP SERVER (API moderna)
// ------------------------------------------------------
function createMcpServer() {
  const mcpServer = new McpServer({
    name: "mcp-server",
    version: "1.0.0"
  });

  // TOOL: render
  mcpServer.registerTool(
    "render",
    {
      description: "Render HTML to PDF",
      inputSchema: {
        html: z.string(),
        filename: z.string().optional()
      }
    },
    async ({ html, filename }) => {
      console.log("MCP tool 'render' called");

      // Chama o endpoint /render do Railway (o teu PDF renderer)
      const response = await fetch("https://mcp-server-production-8269.up.railway.app/mcp/generate_pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, filename })
      });

      // RECEBE O PDF BINÁRIO
      const pdfBuffer = await response.arrayBuffer();

      // CONVERTE PARA BASE64
      const base64 = Buffer.from(pdfBuffer).toString("base64");

      // DEVOLVE AO FOUNDRY Conteúdo MCP
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              filename,
              base64
            })
          }
        ]
      };
    }
  );

  return mcpServer;
}

// ------------------------------------------------------
// EXPRESS SERVER
// ------------------------------------------------------
const app = express();
app.use(express.json({ limit: "2mb" }));

// ------------------------------------------------------
// Função PDF local (para /mcp/generate_pdf)
// ------------------------------------------------------
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

// ------------------------------------------------------
// Endpoint antigo (mantido para compatibilidade)
// ------------------------------------------------------
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

// ------------------------------------------------------
// Endpoint raiz
// ------------------------------------------------------
app.get("/", (req, res) => {
  res.send("mcp-server alive");
});

// ------------------------------------------------------
// ENDPOINT MCP OFICIAL PARA FOUNDRY
// ------------------------------------------------------
app.post("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null
      });
    }
  }
});

// ------------------------------------------------------
// ARRANQUE DO SERVIDOR
// ------------------------------------------------------
app.listen(process.env.PORT || 3000, () => {
  console.log("MCP server running");
});
