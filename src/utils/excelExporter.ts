import * as XLSX from 'xlsx';
import { PassportRecord } from '../types';

export function exportRecordsToExcel(records: PassportRecord[], filename?: string) {
  if (!records || records.length === 0) {
    throw new Error("No records available to export");
  }

  const formattedData = records.map((r, index) => ({
    "Index": index + 1,
    "Passport Number": r.passportNo,
    "Name": r.fullName,
    "Nationality": r.nationality,
    "Date of Birth": r.dob,
    "Sex": r.sex,
    "Issue Date": r.issueDate || "",
    "Expiry Date": r.expiry,
    "Confidence": `${r.confidence || 90}%`,
    "MRZ Verified": r.mrzDetected ? "Yes" : "No",
    "Scan Date": r.scannedAt
  }));

  const worksheet = XLSX.utils.json_to_sheet(formattedData);

  // Set column widths for polished presentation
  worksheet['!cols'] = [
    { wch: 6 },  // Index
    { wch: 18 }, // Passport Number
    { wch: 28 }, // Name
    { wch: 15 }, // Nationality
    { wch: 15 }, // Date of Birth
    { wch: 10 }, // Sex
    { wch: 15 }, // Issue Date
    { wch: 15 }, // Expiry Date
    { wch: 12 }, // Confidence
    { wch: 14 }, // MRZ Verified
    { wch: 20 }, // Scan Date
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Passports");

  const actualFilename = filename || `Passport_Scans_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, actualFilename);
}

export function exportRecordsToCSV(records: PassportRecord[], filename?: string) {
  if (!records || records.length === 0) {
    throw new Error("No records available to export");
  }

  const formattedData = records.map((r, index) => ({
    "Index": index + 1,
    "Passport Number": r.passportNo,
    "Name": r.fullName,
    "Nationality": r.nationality,
    "Date of Birth": r.dob,
    "Sex": r.sex,
    "Issue Date": r.issueDate || "",
    "Expiry Date": r.expiry,
    "Confidence": `${r.confidence || 90}%`,
    "MRZ Verified": r.mrzDetected ? "Yes" : "No",
    "Scan Date": r.scannedAt
  }));

  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  const csvOutput = XLSX.utils.sheet_to_csv(worksheet);

  const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename || `Passport_Scans_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
