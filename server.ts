import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

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

CRITICAL ORIENTATION & MULTI-PAGE BOOKLETS:
- The image frequently shows an open passport booklet with 2 pages side-by-side (e.g. Bangladesh passport bio-data page with photo and MRZ on one side, and emergency contacts/notes on the other page).
- The image may be ROTATED 90 DEGREES (sideways/vertical), 180 DEGREES (upside down), or 270 DEGREES.
- You MUST mentally rotate your reading angle to read the bio-data page correctly.
- Always focus on the bio-data page that contains:
  1. The holder portrait photo
  2. The 2-line Machine Readable Zone (MRZ) starting with P< or PC (e.g. "P<BGDKHAN<<MD<MAHAFIZUR..." and "A123023319BGD8610127...")
  3. Visual text fields: Passport No / পাসপোর্ট নং, Full Name / নাম, Nationality / জাতীয়তা, Date of Birth / জন্ম তারিখ, Sex / লিঙ্গ, Date of Expiry / মেয়াদোত্তীর্ণের তারিখ, Date of Issue / প্রদানের তারিখ.

RULES FOR FIELDS:
- passportNo: Extract the passport number (e.g., A12302331, EA0123456, C12345678, etc.). You can read it from the MRZ line 2 (first 9 characters) or printed/perforated at the top.
- fullName: Extract the full legal name (e.g., "MD MAHAFIZUR RAHMAN", "KHAN MD MAHAFIZUR"). Do NOT include MRZ arrows '<' or repeat filler noise.
- nationality: 3-letter ICAO country code (e.g., BGD, USA, GBR, CAN, IND, PAK, etc.).
- dob: Date of birth formatted as YYYY-MM-DD.
- sex: "Male" or "Female" or "Unspecified".
- issueDate: Date of issue formatted as YYYY-MM-DD. If not printed, calculate from expiry (10-year or 5-year validity).
- expiry: Date of expiration formatted as YYYY-MM-DD.
- mrzDetected: true if the 2-line MRZ is visible and decoded.
- mrzLines: Array of the 2 exact MRZ strings.
- confidence: Integer confidence between 85 and 99.
- isValidDocument: true if any passport or ID information is readable in the image.

Even if the photo is rotated sideways, do NOT return empty fields if passport details are visible!

Return STRICTLY valid JSON matching:
{
  "isValidDocument": true,
  "passportNo": "A12302331",
  "fullName": "MD MAHAFIZUR RAHMAN",
  "nationality": "BGD",
  "dob": "1986-10-12",
  "sex": "Male",
  "issueDate": "2023-10-22",
  "expiry": "2033-10-21",
  "mrzDetected": true,
  "mrzLines": [
    "P<BGDKHAN<<MD<MAHAFIZUR<<<<<<<<<<<<<<<<<<<<<",
    "A123023319BGD8610127M331021855446410204<<<470"
  ],
  "confidence": 98
}`;

      const candidateModels = [
        "gemini-3.1-flash-lite",
        "gemini-3.8-flash",
        "gemini-flash-latest"
      ];
      let lastErr: any = null;
      let responseText = "";
      let usedModel = "gemini-3.1-flash-lite";

      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
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

          responseText = response.text?.trim() || "{}";
          if (responseText && responseText !== "{}") {
            usedModel = modelName;
            lastErr = null;
            break;
          }
        } catch (modelErr: any) {
          const errCode = modelErr?.status || modelErr?.statusCode || modelErr?.error?.code;
          const errMsg = modelErr?.message || String(modelErr);
          console.info(`Model ${modelName} returned status ${errCode || 'error'}: trying next fallback model.`);
          lastErr = modelErr;
          // Short delay before trying next model if 503 or 429
          if (errCode === 503 || errCode === 429) {
            await new Promise(r => setTimeout(r, 400));
          }
        }
      }

      if (lastErr && !responseText) {
        throw lastErr;
      }

      let parsedData: any;
      try {
        parsedData = JSON.parse(responseText);
      } catch (parseErr) {
        const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        parsedData = JSON.parse(cleaned);
      }

      // Post-process to ensure pristine clean data
      if (parsedData) {
        if (parsedData.fullName) {
          parsedData.fullName = parsedData.fullName
            .replace(/<[<KLC\s]*$/g, "")
            .replace(/\s+[KLC]{3,}$/i, "")
            .replace(/[KLC]{5,}$/i, "")
            .replace(/<+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
        if (parsedData.passportNo) {
          parsedData.passportNo = parsedData.passportNo.replace(/[^A-Z0-9]/g, "").trim();
        }
        // If issueDate is missing but expiry is known
        if ((!parsedData.issueDate || parsedData.issueDate === "—" || parsedData.issueDate === "N/A") && parsedData.expiry && /^\d{4}-\d{2}-\d{2}$/.test(parsedData.expiry)) {
          const parts = parsedData.expiry.split("-");
          const expYear = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const day = parseInt(parts[2], 10);
          const validityYears = (expYear - new Date().getFullYear() > 4) ? 10 : 5;
          const expDateObj = new Date(expYear, month - 1, day);
          expDateObj.setFullYear(expDateObj.getFullYear() - validityYears);
          expDateObj.setDate(expDateObj.getDate() + 1);
          const y = expDateObj.getFullYear();
          const m = String(expDateObj.getMonth() + 1).padStart(2, "0");
          const d = String(expDateObj.getDate()).padStart(2, "0");
          parsedData.issueDate = `${y}-${m}-${d}`;
        }
      }

      return res.json({
        success: true,
        data: parsedData,
        engine: usedModel
      });

    } catch (err: any) {
      console.warn("Passport AI scanning unavailable, using OCR fallback:", err?.message || err);
      return res.status(200).json({ 
        success: false,
        error: err.message || "Failed to process passport image with AI",
        fallbackToOcr: true,
        engine: "local-ocr-fallback"
      });
    }
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
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
