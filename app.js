import express from "express";
import ffmpeg from "fluent-ffmpeg";
import multer from "multer";
import fs from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { AssemblyAI } from 'assemblyai'
import { config } from 'dotenv';
import bodyParser from "body-parser";
import pg from "pg";
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const upload = multer({ dest: "uploads/" });

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "Summary",
  password: "007a1883",
  port: 5432,
});
db.connect();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

const ffmpegPath = "C:/FFMPEG/ffmpeg";
ffmpeg.setFfmpegPath(ffmpegPath);

const client = new AssemblyAI({
  apiKey: process.env.MODEL_KEY
})

let selectedOption = ""; // Changed 'var' to 'let' for better scoping

async function audioToHeadline(audioPath) {
  const params = {
    audio: audioPath,
    summarization: true,
    summary_model: 'catchy',
    summary_type: 'headline'
  }
  const headline = await client.transcripts.transcribe(params)
  return headline;
}

async function audioToDescription(audioPath) {
  const params = {
    audio: audioPath,
    summarization: true,
    summary_model: 'informative',
    summary_type: selectedOption // Use selectedOption here
  }
  const description = await client.transcripts.transcribe(params)
  return description;
}

async function extractAudio(videoPath) {
  const outputDir = "audio/";

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions("-vn") // Disable video stream (extract only audio)
      .output(`${outputDir}audio.mp3`) // Output audio in mp3 format
      .on("end", async () => {
        console.log("Audio extracted successfully");
        const audioFilePath = `${outputDir}audio.mp3`;
        const [headline, description] = await Promise.all([
          audioToHeadline(audioFilePath),
          audioToDescription(audioFilePath)
        ]);
        const summary = headline.summary + " : " + description.summary;
        // db functions
        try {
          await db.query("INSERT INTO abstract (heading, summary) VALUES ($1,$2)", [headline.summary, description.summary]);
        } catch (err) {
          console.log(err);
        }

        resolve(summary);
      })
      .on("error", (err) => {
        console.error("Error extracting audio:", err);
        reject("Error extracting audio");
      })
      .run();
  });
}

app.post("/extract", upload.single("video"), async (req, res) => {
  const videoPath = req.file.path;
  selectedOption = req.body.summaryType;
  try {
    const summary = await extractAudio(videoPath);
    res.send(summary);
  } catch (err) {
    console.error("Error extracting audio:", err);
    res.status(500).json({ error: "Error extracting audio" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
