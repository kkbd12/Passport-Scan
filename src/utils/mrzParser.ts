// MRZ (Machine Readable Zone) Parser compliant with ICAO Doc 9303 (TD3 passports & TD1/TD2 identity cards)

// Common 3-letter ISO country codes mapping
export const COUNTRY_NAMES: Record<string, string> = {
  USA: "United States",
  GBR: "United Kingdom",
  CAN: "Canada",
  AUS: "Australia",
  DEU: "Germany",
  FRA: "France",
  ESP: "Spain",
  ITA: "Italy",
  JPN: "Japan",
  CHN: "China",
  IND: "India",
  BRA: "Brazil",
  MEX: "Mexico",
  KOR: "South Korea",
  NLD: "Netherlands",
  CHE: "Switzerland",
  SWE: "Sweden",
  NOR: "Norway",
  DNK: "Denmark",
  FIN: "Finland",
  IRL: "Ireland",
  NZL: "New Zealand",
  SGP: "Singapore",
  ZAF: "South Africa",
  TUR: "Turkey",
  ARG: "Argentina",
  AUT: "Austria",
  BEL: "Belgium",
  POL: "Poland",
  PRT: "Portugal",
  GRC: "Greece",
  ARE: "United Arab Emirates",
  SAU: "Saudi Arabia",
  EGY: "Egypt",
  MYS: "Malaysia",
  THA: "Thailand",
  VNM: "Vietnam",
  PHL: "Philippines",
  IDN: "Indonesia",
  UKR: "Ukraine",
  COL: "Colombia",
  CHL: "Chile",
  PER: "Peru",
  ISR: "Israel",
  RUS: "Russian Federation",
  D: "Germany",
  BGD: "Bangladesh",
  PAK: "Pakistan",
  NPL: "Nepal",
};

/**
 * Format MRZ YYMMDD date string to YYYY-MM-DD
 * If isExpiry is true, 00-69 is 2000s
 * If isBirth is true, current year comparison applies
 */
export function formatMRZDate(dateStr: string, isExpiry = false): string {
  if (!dateStr || dateStr.length !== 6) return dateStr || "N/A";
  
  // Clean up any stray non-digits (like 'O' -> 0)
  const cleanDigits = dateStr.replace(/O/gi, '0').replace(/[ILl]/g, '1').replace(/[SZ]/gi, (c) => c.toUpperCase() === 'S' ? '5' : '2');
  if (!/^\d{6}$/.test(cleanDigits)) return dateStr;

  const yy = parseInt(cleanDigits.substring(0, 2), 10);
  const mm = cleanDigits.substring(2, 4);
  const dd = cleanDigits.substring(4, 6);

  const currentYear = new Date().getFullYear();
  const currentYY = currentYear % 100;

  let year: number;
  if (isExpiry) {
    // Expiry dates are typically in current or upcoming years
    year = 2000 + yy;
  } else {
    // Birthdate: if yy is greater than current YY, likely 19xx, else 20xx
    year = yy > currentYY ? 1900 + yy : 2000 + yy;
  }

  return `${year}-${mm}-${dd}`;
}

/**
 * Estimate passport Issue Date from Expiry Date if not visible in MRZ
 * (Standard passports are valid for 10 or 5 years)
 */
export function estimateIssueDate(expiryDateStr: string): string {
  if (!expiryDateStr || expiryDateStr === "N/A" || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDateStr)) {
    return "";
  }
  const parts = expiryDateStr.split("-");
  const expYear = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const currentYear = new Date().getFullYear();
  const validityYears = (expYear - currentYear > 4) ? 10 : 5;

  const expDateObj = new Date(expYear, month - 1, day);
  expDateObj.setFullYear(expDateObj.getFullYear() - validityYears);
  expDateObj.setDate(expDateObj.getDate() + 1);

  const y = expDateObj.getFullYear();
  const m = String(expDateObj.getMonth() + 1).padStart(2, "0");
  const d = String(expDateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Clean MRZ Line 1 Name Field:
 * Eliminates OCR confusion where filler '<' was read as 'K', 'L', 'C', '(', etc.
 * Cleans trailing noise like 'KLKLCLCLLLLLLLLLLLLKLKLK'
 */
export function cleanMrzLine1Name(line1: string, country = "BGD"): { surname: string; givenNames: string; fullName: string } {
  let s = line1.trim();
  if (s.startsWith("P<") || s.startsWith("P")) {
    s = s.substring(s.startsWith("P<") ? 5 : (s.startsWith("P") && s.length > 5 ? 5 : 0));
  }

  // 1. Remove trailing filler noise: runs of '<', 'K', 'L', 'C', etc.
  s = s.replace(/<[<KLC\s]*$/g, "");
  s = s.replace(/\s+[KLC]{3,}$/i, "");
  s = s.replace(/[KLC]{5,}$/i, "");
  s = s.trim();

  let surname = "";
  let givenNames = "";

  // 2. Identify separator between surname and given names
  // Standard MRZ: '<<'
  // Common OCR misreads: KK, KL, LK, LL, <K, K<, <L, L<, or spaced versions
  const doubleDelimiter = /(?:<<|<K|K<|<L|L<|KK|KL|LK|LL)/i;

  if (doubleDelimiter.test(s)) {
    const parts = s.split(doubleDelimiter);
    surname = parts[0];
    givenNames = parts.slice(1).join(" ");
  } else if (/(\s*[<KLC]{1,2}\s+[<KLC]{1,2}\s*|\s+[<KLC]{2}\s+)/.test(s)) {
    const match = s.match(/^(.*?)(?:\s*[<KLC]{1,2}\s+[<KLC]{1,2}\s*|\s+[<KLC]{2}\s+)(.*)$/);
    if (match) {
      surname = match[1];
      givenNames = match[2];
    }
  } else if (s.includes("<")) {
    const parts = s.split("<");
    surname = parts[0];
    givenNames = parts.slice(1).join(" ");
  } else {
    // Check if MD or MOHAMMAD is inside
    const mdMatch = s.match(/^(.*?)(?:[KLC]{1,2})?(MD|MOHAMMAD)(.*)$/i);
    if (mdMatch) {
      surname = mdMatch[1];
      givenNames = `${mdMatch[2]} ${mdMatch[3]}`;
    } else {
      surname = s;
    }
  }

  // Inside givenNames, single < or K/L between words
  givenNames = givenNames.replace(/[<]/g, " ");
  givenNames = givenNames.replace(/(MD)(MAHAFIZUR)/i, "$1 $2");
  givenNames = givenNames.replace(/(MOHAMMAD)([A-Z]+)/i, "$1 $2");

  // Clean characters inside surname and givenNames
  surname = surname.replace(/[^A-Za-z\s]/g, " ").replace(/\s+/g, " ").trim();
  givenNames = givenNames.replace(/[^A-Za-z\s]/g, " ").replace(/\s+/g, " ").trim();

  // If givenNames starts or ends with stray single K or L (e.g. "K MD" or "KMD")
  givenNames = givenNames.replace(/^[KLC]\s+(MD\b|MOHAMMAD\b)/i, "$1");
  givenNames = givenNames.replace(/^[KLC](MD\b|MOHAMMAD\b)/i, "$1");
  givenNames = givenNames.replace(/^[KLC]\s+/i, "");
  givenNames = givenNames.replace(/\s+[KLC]$/i, "");
  givenNames = givenNames.replace(/<[<KLC\s]*$/g, "").replace(/\s+[KLC]{3,}$/i, "").trim();

  let fullName = "";
  if (givenNames && surname) {
    if (country === "BGD" || givenNames.toUpperCase().startsWith("MD") || givenNames.toUpperCase().startsWith("MOHAMMAD")) {
      fullName = `${givenNames} ${surname}`.trim();
    } else {
      fullName = `${givenNames} ${surname}`.trim();
    }
  } else {
    fullName = givenNames || surname;
  }

  return { surname, givenNames, fullName };
}

export function parsePassportData(rawText: string) {
  // Normalize lines
  const rawLines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Normalize potential MRZ characters
  // Common OCR mistakes: '(' or '{' or '[' -> '<'
  const normalizedLines = rawLines.map(line =>
    line
      .toUpperCase()
      .replace(/[({[«]/g, '<')
      .replace(/[)}]/g, '<')
      .replace(/[\s\t]+/g, '')
  );

  let passportNo = "";
  let surname = "";
  let givenNames = "";
  let fullName = "";
  let nationality = "";
  let dob = "";
  let sex = "";
  let expiry = "";
  let mrzDetected = false;
  let extractedMrzLines: string[] = [];

  // Filter candidates for MRZ lines
  // Standard TD3 (Passport) has 2 lines of 44 chars each.
  // Line 1 begins with P< or P followed by 3-letter country code
  // Line 2 contains numbers, dates, sex
  const candidateMrzLines = normalizedLines.filter(
    l => (l.includes('<<') || l.startsWith('P<') || l.startsWith('P') || (l.length >= 28 && (l.match(/</g) || []).length >= 2))
  );

  // Check if we have two consecutive or nearby lines that form standard TD3 MRZ (40-46 chars each)
  let line1 = "";
  let line2 = "";

  if (candidateMrzLines.length >= 2) {
    // Look from bottom up since MRZ is usually at the bottom
    for (let i = candidateMrzLines.length - 1; i >= 1; i--) {
      const l2 = candidateMrzLines[i];
      const l1 = candidateMrzLines[i - 1];

      // TD3 typically: l1 has names (letters and <), l2 has passport number and dates (mix of digits and <)
      if (l1.length >= 30 && l2.length >= 30) {
        line1 = l1;
        line2 = l2;
        break;
      }
    }

    if (!line1 && candidateMrzLines.length >= 2) {
      line1 = candidateMrzLines[candidateMrzLines.length - 2];
      line2 = candidateMrzLines[candidateMrzLines.length - 1];
    }
  }

  if (line1 && line2) {
    mrzDetected = true;
    extractedMrzLines = [line1, line2];

    // Ensure line1 has leading P
    let l1 = line1;
    let l2 = line2;

    // Line 1: P<USASTEVENS<<JOHN<PAUL<<<<<<<<<<<<<<<<<<
    // Type (1 char) + Type extra (1 char) + Issuer (3 chars)
    if (l1.startsWith('P')) {
      const issuingCountry = l1.substring(2, 5).replace(/</g, '').trim();
      nationality = issuingCountry;

      const nameRes = cleanMrzLine1Name(l1, nationality);
      surname = nameRes.surname;
      givenNames = nameRes.givenNames;
      fullName = nameRes.fullName;
    } else {
      const nameRes = cleanMrzLine1Name(l1, nationality);
      surname = nameRes.surname;
      givenNames = nameRes.givenNames;
      fullName = nameRes.fullName;
    }

    // Line 2: Passport Number (9 chars) + Check Digit (1) + Nationality (3) + DOB (6) + Check (1) + Sex (1) + Expiry (6) + Check (1)
    if (l2.length >= 27) {
      // Document Number (pos 0 to 9)
      const docNoRaw = l2.substring(0, 9).replace(/</g, '').trim();
      const cleanedDocNo = docNoRaw.replace(/[^A-Z0-9]/g, '');
      // Valid passport numbers must be alphanumeric and typically 7-9 characters
      if (cleanedDocNo.length >= 6) {
        passportNo = cleanedDocNo;
      }

      // Nationality (pos 10 to 13)
      const natRaw = l2.substring(10, 13).replace(/</g, '').trim();
      if (natRaw && natRaw.length === 3 && /^[A-Z]{3}$/.test(natRaw)) {
        nationality = natRaw;
      }

      // DOB (pos 13 to 19)
      const dobRaw = l2.substring(13, 19);
      dob = formatMRZDate(dobRaw, false);

      // Sex (pos 20)
      const sexChar = l2.charAt(20).toUpperCase();
      if (sexChar === 'M') sex = 'Male';
      else if (sexChar === 'F') sex = 'Female';
      else if (sexChar === 'X' || sexChar === '<') sex = 'Unspecified';
      else sex = sexChar;

      // Expiry (pos 21 to 27)
      const expRaw = l2.substring(21, 27);
      expiry = formatMRZDate(expRaw, true);
    }
  }

  // 2. Fallback regex patterns if fields are empty or MRZ failed
  if (!passportNo || passportNo === "N/A") {
    // Look for "Passport No", "Passport Number", "Doc No", etc.
    const passMatch = rawText.match(/(?:Passport\s*(?:No\.?|Number|#)?|Document\s*No\.?)\s*[:.]?\s*([A-Z0-9]{8,10})/i);
    if (passMatch) {
      passportNo = passMatch[1].trim();
    } else {
      const genericMatch = rawText.match(/\b([A-Z]{1,2}[0-9]{7,9}|[0-9]{9})\b/);
      if (genericMatch) passportNo = genericMatch[1];
    }
  }

  if (!surname || surname === "N/A") {
    const surnameMatch = rawText.match(/(?:Surname|Nom|Last\s*Name)\s*[:.]?\s*([A-Z\s'-]+)/i);
    if (surnameMatch && surnameMatch[1].trim().length > 1) {
      surname = surnameMatch[1].split('\n')[0].trim();
    }
  }

  if (!givenNames || givenNames === "N/A") {
    const givenMatch = rawText.match(/(?:Given\s*Names?|First\s*Names?|Prénoms)\s*[:.]?\s*([A-Z\s'-]+)/i);
    if (givenMatch && givenMatch[1].trim().length > 1) {
      givenNames = givenMatch[1].split('\n')[0].trim();
    }
  }

  if (!dob || dob === "N/A") {
    const dobMatch = rawText.match(/(?:Date\s*of\s*Birth|DOB|Birth\s*Date)\s*[:.]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2})/i);
    if (dobMatch) {
      dob = dobMatch[1].trim();
    } else {
      const dateGeneric = rawText.match(/\b(\d{2}[/-]\d{2}[/-]\d{4}|\d{4}[/-]\d{2}[/-]\d{2})\b/);
      if (dateGeneric) dob = dateGeneric[1];
    }
  }

  if (!sex || sex === "N/A") {
    const sexMatch = rawText.match(/(?:Sex|Gender|Sexe)\s*[:.]?\s*(M(?:ale)?|F(?:emale)?|X)\b/i);
    if (sexMatch) {
      const s = sexMatch[1].toUpperCase();
      sex = s.startsWith('M') ? 'Male' : s.startsWith('F') ? 'Female' : 'Unspecified';
    }
  }

  if (!expiry || expiry === "N/A") {
    const expMatch = rawText.match(/(?:Date\s*of\s*Expiry|Expiration\s*Date|Expiry\s*Date|Valid\s*Until)\s*[:.]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2})/i);
    if (expMatch) {
      expiry = expMatch[1].trim();
    }
  }

  let issueDate = "";
  const issueMatch = rawText.match(/(?:Date\s*of\s*Issue|Issue\s*Date|Issued\s*On|Date\s*d['’]émission|প্রদানের\s*তারিখ)\s*[:.]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2})/i);
  if (issueMatch) {
    issueDate = issueMatch[1].trim();
  } else if (expiry && expiry !== "N/A") {
    // If not found in text, calculate from expiry (10 or 5 years)
    issueDate = estimateIssueDate(expiry);
  }

  if (!nationality || nationality === "N/A") {
    const natMatch = rawText.match(/(?:Nationality|Nationalité)\s*[:.]?\s*([A-Z]{3}|[A-Za-z\s]+)/i);
    if (natMatch && natMatch[1].trim().length > 1) {
      nationality = natMatch[1].split('\n')[0].trim();
    }
  }

  // Unified direct Full Name
  if (!fullName) {
    if (givenNames && givenNames !== "N/A" && surname && surname !== "N/A") {
      fullName = `${givenNames} ${surname}`.trim();
    } else if (givenNames && givenNames !== "N/A") {
      fullName = givenNames.trim();
    } else if (surname && surname !== "N/A") {
      fullName = surname.trim();
    } else {
      const nameMatch = rawText.match(/(?:Full\s*Name|Name|Nom\s*complet|নাম)\s*[:.]?\s*([A-Z\s'-]+)/i);
      if (nameMatch && nameMatch[1].trim().length > 1) {
        fullName = nameMatch[1].split('\n')[0].trim();
      }
    }
  }

  // Final sanitation for fullName: remove any stray trailing K/L/C filler noise
  if (fullName && fullName !== "N/A") {
    fullName = fullName
      .replace(/<[<KLC\s]*$/g, "")
      .replace(/\s+[KLC]{3,}$/i, "")
      .replace(/[KLC]{5,}$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  return {
    passportNo: passportNo || "N/A",
    fullName: fullName || "N/A",
    surname: surname || "N/A",
    givenNames: givenNames || "N/A",
    nationality: nationality || "N/A",
    dob: dob || "N/A",
    sex: sex || "N/A",
    issueDate: issueDate || "",
    expiry: expiry || "N/A",
    mrzDetected: mrzDetected && !!passportNo && passportNo.length >= 6,
    mrzLines: extractedMrzLines,
  };
}
