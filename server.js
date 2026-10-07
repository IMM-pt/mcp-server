// ------------------------------------------------------
// FETCH
// ------------------------------------------------------
const fetch = require("node-fetch");

// ------------------------------------------------------
// PDF-LIB (para PDF local e para o PDF-Compiler)
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

  // ------------------------------------------------------
  // TOOL: render (HTML → PDF)
  // ------------------------------------------------------
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

      const response = await fetch(
        "https://mcp-server-production-8269.up.railway.app/mcp/generate_pdf",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html, filename })
        }
      );

      const pdfBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(pdfBuffer).toString("base64");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ filename, base64 })
          }
        ]
      };
    }
  );

  // ------------------------------------------------------
  // TOOL: compile (junta vários PDFs num só)
  // ------------------------------------------------------
  mcpServer.registerTool(
    "compile",
    {
      description: "Compila vários PDFs (base64) num único PDF final",
      inputSchema: {
        files: z.array(
          z.object({
            filename: z.string().optional(),
            base64: z.string()
          })
        )
      }
    },
    async ({ files }) => {
      console.log("MCP tool 'compile' called");

      const response = await fetch(
        "https://mcp-server-production-8269.up.railway.app/mcp/compile_pdf",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files })
        }
      );

      const result = await response.json();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
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
app.use(express.json({ limit: "10mb" }));

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
// Função que junta vários PDFs (base64) num só PDF final
// (VERSÃO CORRIGIDA — sem catalog.Pages, sem computePages)
// ------------------------------------------------------
async function compilePdfBase64List(files) {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const pdfBytes = Buffer.from(file.base64, "base64");
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // API correta do pdf-lib para copiar páginas
    const pageIndices = pdfDoc.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);

    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedBytes = await mergedPdf.save();
  const mergedBase64 = Buffer.from(mergedBytes).toString("base64");

  return {
    filename: "relatorio-final.pdf",
    base64: mergedBase64
  };
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
// Endpoint que compila vários PDFs (base64) num só PDF final
// ------------------------------------------------------
app.post("/mcp/compile_pdf", async (req, res) => {
  try {
    const { files } = req.body || {};

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "files array is required" });
    }

    const result = await compilePdfBase64List(files);

    res.json(result);
  } catch (error) {
    console.error("PDF compilation error:", error);
    res.status(500).json({ error: "Failed to compile PDFs" });
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
