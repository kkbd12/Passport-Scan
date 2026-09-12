import React, { useState } from 'react';
import { PassportRecord } from '../types';
import { X, Save, Check } from 'lucide-react';

interface EditRecordModalProps {
  record: PassportRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: PassportRecord) => void;
}

export const EditRecordModal: React.FC<EditRecordModalProps> = ({
  record,
  isOpen,
  onClose,
  onSave
}) => {
  if (!isOpen || !record) return null;

  const sanitize = (val?: string) => {
    if (!val) return '';
    if (val === 'REVIEW' || val === 'REQUIRED' || val === 'MANUAL' || val === 'ENTRY' || val === 'N/A' || val.startsWith('PASS-')) {
      return '';
    }
    return val;
  };

  const [formData, setFormData] = useState<PassportRecord>({
    ...record,
    passportNo: sanitize(record.passportNo),
    fullName: sanitize(record.fullName),
    nationality: sanitize(record.nationality),
    dob: sanitize(record.dob),
    issueDate: sanitize(record.issueDate),
    expiry: sanitize(record.expiry),
  });

  React.useEffect(() => {
    if (record) {
      setFormData({
        ...record,
        passportNo: sanitize(record.passportNo),
        fullName: sanitize(record.fullName),
        nationality: sanitize(record.nationality),
        dob: sanitize(record.dob),
        issueDate: sanitize(record.issueDate),
        expiry: sanitize(record.expiry),
      });
    }
  }, [record]);

  const handleChange = (field: keyof PassportRecord, val: any) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Edit Passport Record</h3>
            <p className="text-xs text-slate-500 mt-0.5">Verify and update passport details</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Passport Number</label>
              <input
                type="text"
                value={formData.passportNo}
                placeholder="e.g. EA0123456"
                onChange={e => handleChange('passportNo', e.target.value.toUpperCase())}
                className="w-full text-sm font-mono font-medium px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nationality (ISO / Country)</label>
              <input
                type="text"
                value={formData.nationality}
                placeholder="e.g. BGD / USA"
                onChange={e => handleChange('nationality', e.target.value.toUpperCase())}
                className="w-full text-sm font-medium px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Direct Name (Full Name / নাম)</label>
            <input
              type="text"
              value={formData.fullName}
              placeholder="e.g. MOHAMMAD TARIQ RAHMAN"
              onChange={e => handleChange('fullName', e.target.value.toUpperCase())}
              className="w-full text-sm font-medium px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
              <input
                type="text"
                value={formData.dob}
                placeholder="YYYY-MM-DD"
                onChange={e => handleChange('dob', e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sex</label>
              <select
                value={formData.sex}
                onChange={e => handleChange('sex', e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Unspecified">Unspecified</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Issue (Issue Date / প্রদানের তারিখ)</label>
              <input
                type="text"
                value={formData.issueDate}
                placeholder="YYYY-MM-DD"
                onChange={e => handleChange('issueDate', e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Expiry (Expiry Date / মেয়াদ)</label>
              <input
                type="text"
                value={formData.expiry}
                placeholder="YYYY-MM-DD"
                onChange={e => handleChange('expiry', e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {formData.mrzLines && formData.mrzLines.length > 0 && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs font-semibold text-slate-600 block mb-1">Detected MRZ Lines:</span>
              <div className="font-mono text-xs text-slate-800 bg-slate-100 p-2 rounded tracking-wider select-all overflow-x-auto">
                {formData.mrzLines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
