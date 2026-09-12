/**
 * Utilities for image preprocessing to maximize OCR and MRZ recognition accuracy.
 */

export function preprocessForOCR(imgElement: HTMLImageElement): {
  fullCanvas: HTMLCanvasElement;
  mrzCanvas: HTMLCanvasElement;
} {
  // 1. Draw full image with contrast boost
  const fullCanvas = document.createElement('canvas');
  const w = imgElement.naturalWidth || imgElement.width;
  const h = imgElement.naturalHeight || imgElement.height;
  fullCanvas.width = w;
  fullCanvas.height = h;

  const ctx = fullCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { fullCanvas, mrzCanvas: fullCanvas };

  ctx.drawImage(imgElement, 0, 0, w, h);

  // 2. Crop candidate MRZ zone: bottom 30% of standard passport page
  const mrzCanvas = document.createElement('canvas');
  const mrzStartY = Math.floor(h * 0.65);
  const mrzHeight = h - mrzStartY;
  mrzCanvas.width = w;
  mrzCanvas.height = mrzHeight;

  const mrzCtx = mrzCanvas.getContext('2d', { willReadFrequently: true });
  if (mrzCtx) {
    mrzCtx.drawImage(imgElement, 0, mrzStartY, w, mrzHeight, 0, 0, w, mrzHeight);
    
    // Apply grayscale and contrast enhancement to MRZ zone
    try {
      const imgData = mrzCtx.getImageData(0, 0, w, mrzHeight);
      const data = imgData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        // Luminance
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // High contrast curve
        const contrasted = gray > 140 ? 255 : (gray < 85 ? 0 : gray);
        data[i] = contrasted;
        data[i + 1] = contrasted;
        data[i + 2] = contrasted;
      }
      mrzCtx.putImageData(imgData, 0, 0);
    } catch {
      // If tainted canvas or security restriction, continue with unaltered
    }
  }

  return { fullCanvas, mrzCanvas };
}

/**
 * Creates high-fidelity realistic SVG/DataURL sample passports
 * so users can test immediately without searching for personal ID documents!
 */
export interface SamplePassport {
  id: string;
  name: string;
  country: string;
  docNumber: string;
  dataUrl: string;
  expected: {
    passportNo: string;
    fullName: string;
    nationality: string;
    dob: string;
    sex: string;
    issueDate: string;
    expiry: string;
  };
}

export function generateSamplePassports(): SamplePassport[] {
  const samples = [
    {
      id: "bgd-sample",
      name: "Bangladesh Passport",
      country: "Bangladesh",
      flag: "🇧🇩",
      docNumber: "EA0123456",
      fullName: "MOHAMMAD TARIQ RAHMAN",
      surname: "RAHMAN",
      givenNames: "MOHAMMAD TARIQ",
      nationality: "BGD",
      dob: "1992-05-15",
      dobMRZ: "920515",
      sex: "Male",
      sexChar: "M",
      issueDate: "2022-05-15",
      expiry: "2032-05-14",
      expMRZ: "320514",
      authority: "Government of Bangladesh",
      bgColor: "#064e3b",
      cardColor: "#f0fdf4",
      headerBg: "#065f46"
    },
    {
      id: "usa-sample",
      name: "United States Passport",
      country: "USA",
      flag: "🇺🇸",
      docNumber: "C12345678",
      fullName: "JOHN PAUL STEVENS",
      surname: "STEVENS",
      givenNames: "JOHN PAUL",
      nationality: "USA",
      dob: "1988-04-12",
      dobMRZ: "880412",
      sex: "Male",
      sexChar: "M",
      issueDate: "2022-09-26",
      expiry: "2032-09-25",
      expMRZ: "320925",
      authority: "United States Department of State",
      bgColor: "#0f2b48",
      cardColor: "#f7fafc",
      headerBg: "#1a365d"
    },
    {
      id: "gbr-sample",
      name: "United Kingdom Passport",
      country: "GBR",
      flag: "🇬🇧",
      docNumber: "550982341",
      fullName: "EMMA CLAIRE HARRISON",
      surname: "HARRISON",
      givenNames: "EMMA CLAIRE",
      nationality: "GBR",
      dob: "1994-11-03",
      dobMRZ: "941103",
      sex: "Female",
      sexChar: "F",
      issueDate: "2021-06-19",
      expiry: "2031-06-18",
      expMRZ: "310618",
      authority: "HM Passport Office",
      bgColor: "#3b1122",
      cardColor: "#fffbf5",
      headerBg: "#4a1226"
    },
    {
      id: "can-sample",
      name: "Canada Passport",
      country: "CAN",
      flag: "🇨🇦",
      docNumber: "JD9842103",
      fullName: "ALEXANDRE TREMBLAY",
      surname: "TREMBLAY",
      givenNames: "ALEXANDRE",
      nationality: "CAN",
      dob: "1991-08-20",
      dobMRZ: "910820",
      sex: "Male",
      sexChar: "M",
      issueDate: "2020-12-15",
      expiry: "2030-12-14",
      expMRZ: "301214",
      authority: "Passport Canada",
      bgColor: "#1f2937",
      cardColor: "#ffffff",
      headerBg: "#991b1b"
    }
  ];

  return samples.map(s => {
    // Generate ICAO 9303 TD3 standard MRZ lines
    // Line 1: P<[COUNTRY][SURNAME]<<[GIVENNAMES]... filled to 44 chars with <
    const rawLine1 = `P<${s.nationality}${s.surname.replace(/\s+/g, '<')}<<${s.givenNames.replace(/\s+/g, '<')}`;
    const line1 = (rawLine1 + '<'.repeat(44)).substring(0, 44);

    // Line 2: [PASSPORT_NO (9)] + [CHECK (1)] + [NAT (3)] + [DOB (6)] + [CHECK (1)] + [SEX (1)] + [EXP (6)] + [CHECK (1)] + [OPT (14)] + [COMPOSITE (1)]
    const docPadded = (s.docNumber.replace(/[^A-Z0-9]/g, '') + '<'.repeat(9)).substring(0, 9);
    const line2 = `${docPadded}7${s.nationality}${s.dobMRZ}4${s.sexChar}${s.expMRZ}8<<<<<<<<<<<<<<0`.substring(0, 44);

    // Render an SVG representing a passport bio page
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
      <defs>
        <linearGradient id="bgGrad_${s.id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#f1f5f9"/>
        </linearGradient>
        <pattern id="guilloche_${s.id}" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M0 20 Q 10 0, 20 20 T 40 20" fill="none" stroke="#e2e8f0" stroke-width="1.5" opacity="0.6"/>
          <path d="M0 20 Q 10 40, 20 20 T 40 20" fill="none" stroke="#e2e8f0" stroke-width="1.5" opacity="0.6"/>
        </pattern>
      </defs>

      <!-- Background Passport Page -->
      <rect x="10" y="10" width="880" height="580" rx="16" fill="url(#bgGrad_${s.id})" stroke="#cbd5e1" stroke-width="3"/>
      <rect x="10" y="10" width="880" height="580" rx="16" fill="url(#guilloche_${s.id})"/>

      <!-- Header Banner -->
      <rect x="10" y="10" width="880" height="85" rx="16" fill="${s.headerBg}"/>
      <rect x="10" y="70" width="880" height="25" fill="${s.headerBg}"/>

      <text x="40" y="48" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="800" font-size="24" letter-spacing="1">PASSPORT / PASSEPORT</text>
      <text x="40" y="74" fill="#cbd5e1" font-family="system-ui, sans-serif" font-weight="600" font-size="14">${s.authority.toUpperCase()}</text>
      <text x="830" y="55" fill="#f8fafc" font-family="monospace" font-weight="700" font-size="28" text-anchor="end">${s.nationality}</text>

      <!-- Document Fields -->
      <!-- Photo Area -->
      <rect x="40" y="120" width="180" height="230" rx="8" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>
      <circle cx="130" cy="190" r="45" fill="#94a3b8"/>
      <path d="M 70 300 C 70 240, 190 240, 190 300 Z" fill="#94a3b8"/>
      <text x="130" y="335" fill="#64748b" font-family="system-ui, sans-serif" font-weight="700" font-size="13" text-anchor="middle">PHOTO ID</text>

      <!-- Details Grid -->
      <!-- Type & Code & Passport No -->
      <g transform="translate(260, 130)">
        <text x="0" y="0" fill="#64748b" font-family="system-ui, sans-serif" font-size="11" font-weight="700">TYPE</text>
        <text x="0" y="18" fill="#0f172a" font-family="monospace" font-size="16" font-weight="700">P</text>

        <text x="90" y="0" fill="#64748b" font-family="system-ui, sans-serif" font-size="11" font-weight="700">CODE</text>
        <text x="90" y="18" fill="#0f172a" font-family="monospace" font-size="16" font-weight="700">${s.nationality}</text>

        <text x="210" y="0" fill="#64748b" font-family="system-ui, sans-serif" font-size="11" font-weight="700">PASSPORT NO. / পাসপোর্ট নং</text>
        <text x="210" y="18" fill="#1e293b" font-family="monospace" font-size="18" font-weight="800" letter-spacing="2">${s.docNumber}</text>
      </g>

      <!-- Full Name -->
      <g transform="translate(260, 190)">
        <text x="0" y="0" fill="#64748b" font-family="system-ui, sans-serif" font-size="11" font-weight="700">NAME / নাম / FULL NAME</text>
        <text x="0" y="22" fill="#0f172a" font-family="system-ui, sans-serif" font-size="20" font-weight="800" letter-spacing="1">${s.fullName}</text>
      </g>

      <!-- Nationality & Date of Birth -->
      <g transform="translate(260, 250)">
        <text x="0" y="0" fill="#64748b" font-family="system-ui, sans-serif" font-size="11" font-weight="700">NATIONALITY / জাতীয়তা</text>
        <text x="0" y="20" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="700">${s.country}</text>

        <text x="230" y="0" fill="#64748b" font-family="system-ui, sans-serif" font-size="11" font-weight="700">DATE OF BIRTH / জন্ম তারিখ</text>
        <text x="230" y="20" fill="#0f172a" font-family="monospace" font-size="16" font-weight="700">${s.dob}</text>
      </g>

      <!-- Sex, Issue Date, Expiry Date -->
      <g transform="translate(260, 310)">
        <text x="0" y="0" fill="#64748b" font-family="system-ui, sans-serif" font-size="11" font-weight="700">SEX / লিঙ্গ</text>
        <text x="0" y="20" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="700">${s.sexChar} / ${s.sex}</text>

        <text x="130" y="0" fill="#64748b" font-family="system-ui, sans-serif" font-size="11" font-weight="700">DATE OF ISSUE / প্রদানের তারিখ</text>
        <text x="130" y="20" fill="#0f172a" font-family="monospace" font-size="16" font-weight="700">${s.issueDate}</text>

        <text x="350" y="0" fill="#64748b" font-family="system-ui, sans-serif" font-size="11" font-weight="700">DATE OF EXPIRY / মেয়াদ</text>
        <text x="350" y="20" fill="#0f172a" font-family="monospace" font-size="16" font-weight="700">${s.expiry}</text>
      </g>

      <!-- Machine Readable Zone (MRZ) Area at bottom -->
      <rect x="25" y="450" width="850" height="120" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
      <g transform="translate(45, 495)">
        <text x="0" y="0" fill="#0f172a" font-family="'Courier New', Courier, 'Lucida Console', monospace" font-size="23" font-weight="800" letter-spacing="4">${line1}</text>
        <text x="0" y="45" fill="#0f172a" font-family="'Courier New', Courier, 'Lucida Console', monospace" font-size="23" font-weight="800" letter-spacing="4">${line2}</text>
      </g>
    </svg>
    `.trim();

    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

    return {
      id: s.id,
      name: `${s.flag} ${s.name}`,
      country: s.country,
      docNumber: s.docNumber,
      dataUrl,
      expected: {
        passportNo: s.docNumber,
        fullName: s.fullName,
        nationality: s.nationality,
        dob: s.dob,
        sex: s.sex,
        issueDate: s.issueDate,
        expiry: s.expiry
      }
    };
  });
}
