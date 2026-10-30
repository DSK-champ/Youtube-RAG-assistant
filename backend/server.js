require("dotenv").config({ path: "../chrome-extension/.env" });

const cors = require("cors");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;
const aiServiceUrl = "http://127.0.0.1:8000";
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  process.env.CHROME_EXTENSION_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header are local tools or server-to-server calls.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS."));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);


app.use(express.json());


app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});


app.get("/api/ai-health", async (req, res) => {
  try {
    const aiResponse = await fetch(`${aiServiceUrl}/health`);
    const result = await aiResponse.json();

    res.status(aiResponse.status).json(result);
  } catch (error) {
    res.status(502).json({
      status: "error",
      message: "Could not reach the AI service.",
    });
  }
});

app.post("/api/videos", async (req, res) => {
  try {
    const aiResponse = await fetch(`${aiServiceUrl}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const result = await aiResponse.json();
    res.status(aiResponse.status).json(result);
  } catch (error) {
    res.status(502).json({
      status: "error",
      message: "Could not reach the AI service.",
    });
  }
});

app.get("/api/videos/:videoId/status", async (req, res) => {
  try {
    const videoId = encodeURIComponent(req.params.videoId);
    const aiResponse = await fetch(
      `${aiServiceUrl}/videos/${videoId}/status`
    );

    const result = await aiResponse.json();
    res.status(aiResponse.status).json(result);
  } catch (error) {
    res.status(502).json({
      status: "error",
      message: "Could not reach the AI service.",
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const aiResponse = await fetch(`${aiServiceUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const result = await aiResponse.json();
    res.status(aiResponse.status).json(result);
  } catch (error) {
    res.status(502).json({
      status: "error",
      message: "Could not reach the AI service.",
    });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      detail: "Request body must be valid JSON.",
    });
  }

  console.error(err);

  return res.status(500).json({
    detail: "An unexpected server error occurred.",
  });
});

app.listen(port, () => {
  console.log(`Express server listening on http://localhost:${port}`);
});