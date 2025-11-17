import { PDFDocument } from 'pdf-lib';

interface AttachmentFile {
  fileName: string;
  fileData: string;
  fileType: string;
}

export async function mergeAttachmentsToPDF(attachments: AttachmentFile[]): Promise<string> {
  const mergedPdf = await PDFDocument.create();

  for (const attachment of attachments) {
    try {
      const base64Data = attachment.fileData.split(',')[1] || attachment.fileData;
      const fileBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

      if (attachment.fileType === 'application/pdf') {
        const pdf = await PDFDocument.load(fileBytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } else if (attachment.fileType.startsWith('image/')) {
        let image;
        if (attachment.fileType === 'image/png') {
          image = await mergedPdf.embedPng(fileBytes);
        } else if (attachment.fileType === 'image/jpeg' || attachment.fileType === 'image/jpg') {
          image = await mergedPdf.embedJpg(fileBytes);
        } else {
          continue;
        }

        const page = mergedPdf.addPage();
        const { width, height } = page.getSize();

        const imageAspectRatio = image.width / image.height;
        const pageAspectRatio = width / height;

        let imageWidth, imageHeight;
        if (imageAspectRatio > pageAspectRatio) {
          imageWidth = width - 40;
          imageHeight = imageWidth / imageAspectRatio;
        } else {
          imageHeight = height - 40;
          imageWidth = imageHeight * imageAspectRatio;
        }

        const x = (width - imageWidth) / 2;
        const y = (height - imageHeight) / 2;

        page.drawImage(image, {
          x,
          y,
          width: imageWidth,
          height: imageHeight,
        });
      }
    } catch (error) {
      console.error(`Error processing attachment ${attachment.fileName}:`, error);
    }
  }

  const pdfBytes = await mergedPdf.save();

  // Convert to base64 in chunks to avoid call stack size exceeded error
  const chunkSize = 8192;
  let binaryString = '';

  for (let i = 0; i < pdfBytes.length; i += chunkSize) {
    const chunk = pdfBytes.slice(i, i + chunkSize);
    binaryString += String.fromCharCode(...chunk);
  }

  const base64Pdf = btoa(binaryString);
  return `data:application/pdf;base64,${base64Pdf}`;
}
