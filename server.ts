import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser with 30mb limit for high-res passport photos
  app.use(express.json({ limit: "30mb" }));
  app.use(express.urlencoded({ extended: true, limit: "30mb" }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      hasGemini: !!process.env.GEMINI_API_KEY 
    });
  });

  // Smart Passport OCR & Extraction via Gemini AI
  app.post("/api/scan-passport", async (req, res) => {
    try {
      const { imageBase64, mimeType = "image/jpeg" } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "Missing imageBase64 data" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ 
          error: "GEMINI_API_KEY is not configured",
          code: "NO_API_KEY"
        });
      }

      // Clean base64 string and detect mimeType if prefixed
      let cleanBase64 = imageBase64;
      let effectiveMime = mimeType || "image/jpeg";

      if (typeof imageBase64 === "string") {
        if (imageBase64.includes(",")) {
          const parts = imageBase64.split(",");
          const header = parts[0];
          cleanBase64 = parts.slice(1).join(",");
          const match = header.match(/data:([^;]+);base64/);
          if (match && match[1]) {
            effectiveMime = match[1];
          }
        }
        // Strip any carriage returns or newlines or spaces
        cleanBase64 = cleanBase64.replace(/[\r\n\s]/g, "");
      }

      // Ensure valid standard image MIME type for Gemini Vision
      const validMimes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
      if (!validMimes.includes(effectiveMime.toLowerCase())) {
        effectiveMime = "image/jpeg";
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const prompt = `You are an expert official Passport and Travel Document OCR reader.
Carefully examine the passport/ID document in the provided image and extract all details accurately.
The passport could be from Bangladesh (MRP or E-Passport), United States, United Kingdom, Canada, India, Pakistan, UAE, Saudi Arabia, European Union, or any other nation.

Analyze both:
1. The Visual Inspection Zone (VIZ) with printed labels:
   - Full Name / নাম / Nom et Prénoms / Given Names & Surname
   - Passport No. / পাসপোর্ট নং / Document No.
   - Nationality / জাতীয়তা
   - Date of Birth / জন্ম তারিখ
   - Sex / লিঙ্গ
   - Date of Issue / প্রদানের তারিখ / Date of Issue (Issue Date)
   - Date of Expiry / মেয়াদোত্তীর্ণের তারিখ / Expiry Date
2. The Machine Readable Zone (MRZ) at the bottom (2 lines of 44 characters starting with P< or P, or 3 lines of 30 characters).

Rules:
- passportNo: Extract the document number exactly as printed or encoded in MRZ (e.g., EA0123456, C12345678, 550982341, A1234567, etc.). Do not include spaces.
- fullName: Direct complete Full Name of the holder in uppercase (e.g. "MOHAMMAD TARIQ RAHMAN", "JOHN PAUL STEVENS", "EMMA CLAIRE HARRISON"). Do not split into surname and given names, provide the unified direct full name.
- nationality: 3-letter ICAO country code (e.g., BGD, USA, GBR, CAN, IND, PAK, AUS, SAU, ARE, DEU).
- dob: Date of Birth formatted as YYYY-MM-DD.
- sex: "Male" or "Female" or "Unspecified".
- issueDate: Date of Issue / প্রদানের তারিখ formatted as YYYY-MM-DD (e.g. "2022-05-15"). If not visible on document, return empty string "".
- expiry: Date of Expiration / মেয়াদোত্তীর্ণের তারিখ formatted as YYYY-MM-DD (e.g. "2032-05-14").
- mrzDetected: boolean, true if the 2-line or 3-line MRZ was visible and decoded.
- mrzLines: Array of the exact MRZ strings (e.g. ["P<BGD...", "EA01234..."]).
- confidence: Integer confidence between 70 and 100.
- isValidDocument: boolean, true if this is a passport or national travel ID.

If the image does not contain a readable passport or ID, set isValidDocument: false and provide empty strings for fields.

Return STRICTLY valid JSON matching:
{
  "isValidDocument": true,
  "passportNo": "EA0123456",
  "fullName": "MOHAMMAD TARIQ RAHMAN",
  "nationality": "BGD",
  "dob": "1992-05-15",
  "sex": "Male",
  "issueDate": "2022-05-15",
  "expiry": "2032-05-14",
  "mrzDetected": true,
  "mrzLines": ["...", "..."],
  "confidence": 98
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: effectiveMime,
                data: cleanBase64,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const responseText = response.text?.trim() || "{}";
      let parsedData;
      try {
        parsedData = JSON.parse(responseText);
      } catch (parseErr) {
        const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        parsedData = JSON.parse(cleaned);
      }

      return res.json({
        success: true,
        data: parsedData,
        engine: "gemini-3.8-flash"
      });

    } catch (err: any) {
      console.error("Passport AI scanning error:", err);
      return res.status(500).json({ 
        error: err.message || "Failed to process passport image with AI",
        engine: "gemini-3.8-flash"
      });
    }
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Passport Scanner server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
