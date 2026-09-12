export interface PassportRecord {
  id: string;
  passportNo: string;
  fullName: string;
  nationality: string;
  dob: string; // YYYY-MM-DD or raw
  sex: string; // Male | Female | Other | N/A
  issueDate: string; // Date of Issue: YYYY-MM-DD or raw
  expiry: string; // Date of Expiry: YYYY-MM-DD or raw
  rawText?: string;
  mrzDetected?: boolean;
  mrzLines?: string[];
  confidence?: number;
  scannedAt: string;
  thumbnailUrl?: string;
}

export interface ScanStatus {
  state: 'idle' | 'loading' | 'scanning' | 'complete' | 'error';
  message: string;
  progress: number;
}
