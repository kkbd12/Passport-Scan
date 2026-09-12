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

      const nameSection = l1.substring(5);
      const nameParts = nameSection.split('<<');
      if (nameParts.length >= 1) {
        surname = nameParts[0].replace(/</g, ' ').trim();
      }
      if (nameParts.length >= 2) {
        givenNames = nameParts[1].replace(/</g, ' ').trim();
      }
    } else {
      // Fallback: look for <<
      const parts = l1.split('<<');
      if (parts.length >= 2) {
        surname = parts[0].replace(/[^A-Z]/g, ' ').trim();
        givenNames = parts[1].replace(/[^A-Z]/g, ' ').trim();
      }
    }

    // Line 2: Passport Number (9 chars) + Check Digit (1) + Nationality (3) + DOB (6) + Check (1) + Sex (1) + Expiry (6) + Check (1)
    if (l2.length >= 27) {
      // Document Number (pos 0 to 9)
      const docNoRaw = l2.substring(0, 9).replace(/</g, '').trim();
      passportNo = docNoRaw.replace(/[^A-Z0-9]/g, '');

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
  }

  if (!nationality || nationality === "N/A") {
    const natMatch = rawText.match(/(?:Nationality|Nationalité)\s*[:.]?\s*([A-Z]{3}|[A-Za-z\s]+)/i);
    if (natMatch && natMatch[1].trim().length > 1) {
      nationality = natMatch[1].split('\n')[0].trim();
    }
  }

  // Unified direct Full Name
  let fullName = "";
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
    mrzDetected,
    mrzLines: extractedMrzLines,
  };
}
