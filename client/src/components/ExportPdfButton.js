import React from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * ExportPdfButton
 * Reusable button that captures the referenced DOM node as an image
 * and embeds it into a landscape-oriented PDF (A4 size by default).
 *
 * Props:
 *  - targetRef: React ref to the DOM element that should be included in the PDF.
 *  - filename: Desired filename (defaults to "report.pdf").
 *  - orientation: 'landscape' | 'portrait' (defaults to 'landscape').
 *  - label: Button text (defaults to 'Download PDF').
 *  - preProcess: Optional function to process the cloned document before adding to PDF.
 */
const ExportPdfButton = ({ targetRef, filename = 'report.pdf', orientation = 'landscape', label = 'Download PDF', preProcess }) => {
  const handleExport = async () => {
    if (!targetRef?.current) return;

    try {
      // First, capture the element as a canvas
      const canvas = await html2canvas(targetRef.current, {
        scale: 2,
        useCORS: true,
        onclone: (clonedDoc) => {
          // Vertically center any header cells with rowspan so text isn't cropped
          clonedDoc.querySelectorAll('th[rowspan]')?.forEach((th) => {
            th.style.verticalAlign = 'middle';
          });
          if (typeof preProcess === 'function') {
            try {
              preProcess(clonedDoc);
            } catch (e) {
              console.error('preProcess error', e);
            }
          }
        }
      });

      const imgData = canvas.toDataURL('image/png');

      // Page dimensions for US Letter in jsPDF default units (mm)
      const pdf = new jsPDF({ orientation, unit: 'mm', format: 'letter' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Calculate image dimensions preserving aspect ratio, fitting to page width
      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;

      // px to mm conversion based on 96 DPI (1 inch = 25.4 mm, 96 px = 1 inch)
      const pxToMm = (px) => (px * 25.4) / 96;
      const imgWidthMm = pxToMm(imgWidthPx);
      const imgHeightMm = pxToMm(imgHeightPx);

      // Scale factor to fit width
      const scale = pageWidth / imgWidthMm;
      const renderWidth = pageWidth;
      const renderHeight = imgHeightMm * scale;

      pdf.addImage(imgData, 'PNG', 0, 0, renderWidth, renderHeight);
      pdf.save(filename);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    }
  };

  return (
    <button className="export-pdf-btn" onClick={handleExport}>
      {label}
    </button>
  );
};

export default ExportPdfButton; 