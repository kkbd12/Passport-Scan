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

CRITICAL ORIENTATION & FORMAT HANDLING:
- The passport in the image might be ROTATED 90 degrees (sideways/vertical), 180 degrees (upside down), or 270 degrees.
- The image might contain a two-page passport booklet spread (e.g., bio page on the left or right, and emergency/endorsement page on the other side).
- You MUST automatically detect the correct reading angle of the bio-data page and read all text and Machine Readable Zone (MRZ) correctly, regardless of image rotation or tilt.

Analyze both:
1. The Visual Inspection Zone (VIZ) with printed labels:
   - Full Name / নাম / Nom et Prénoms / Given Names & Surname
   - Passport No. / পাসপোর্ট নং / Document No.
   - Nationality / জাতীয়তা
   - Date of Birth / জন্ম তারিখ
   - Sex / লিঙ্গ
   - Date of Issue / প্রদানের তারিখ / Date of Issue (Issue Date)
   - Date of Expiry / মেয়াদোত্তীর্ণের তারিখ / Expiry Date
2. The Machine Readable Zone (MRZ) (2 lines of 44 characters starting with P< or P, or 3 lines of 30 characters).

Rules:
- passportNo: Extract the document number exactly as printed or encoded in MRZ (e.g., EA0123456, A12302331, C12345678, 550982341, A1234567, etc.). Do not include spaces.
- fullName: Direct complete Full Name of the holder in uppercase as printed in the Visual Inspection Zone (e.g. "MD MAHAFIZUR RAHMAN", "MOHAMMAD TARIQ RAHMAN", "JOHN PAUL STEVENS"). NEVER include MRZ filler characters like '<', 'K', 'L' or repeat noise. For Bangladesh passports, the name is typically printed as 'Given Name: MD MAHAFIZUR', 'Surname: RAHMAN', and the Full Name should be 'MD MAHAFIZUR RAHMAN'.
- nationality: 3-letter ICAO country code (e.g., BGD, USA, GBR, CAN, IND, PAK, AUS, SAU, ARE, DEU).
- dob: Date of Birth formatted as YYYY-MM-DD.
- sex: "Male" or "Female" or "Unspecified".
- issueDate: Date of Issue / প্রদানের তারিখ formatted as YYYY-MM-DD (e.g. "2023-10-22"). Look closely at the bio-data page for "Date of Issue" or "প্রদানের তারিখ". If not explicitly printed or visible, calculate it from expiry date (e.g. Bangladesh passports are 10-year or 5-year validity; if expiry is 2033-10-21, issueDate is 2023-10-22).
- expiry: Date of Expiration / মেয়াদোত্তীর্ণের তারিখ formatted as YYYY-MM-DD (e.g. "2033-10-21").
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
