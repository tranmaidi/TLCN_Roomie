import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { Packer, Document, Paragraph, TextRun } from "docx";

const DEFAULT_FONT = path.join(__dirname, "../assets/fonts/NotoSans-Regular.ttf");

function ensureFontPath(): string | null {
  const envPath = process.env.REPORT_FONT_PATH;
  if (envPath && fs.existsSync(envPath)) return path.resolve(envPath);
  if (fs.existsSync(DEFAULT_FONT)) return path.resolve(DEFAULT_FONT);
  return null;
}

export async function generatePdfReport(stats: any): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const fontPath = ensureFontPath();

  if (fontPath) {
    try {
      // đăng ký font với pdfkit bằng đường dẫn tuyệt đối
      doc.registerFont("VN", fontPath);
      doc.font("VN");
      console.log(`[reportUtil] Using font for PDF: ${fontPath}`);
    } catch (e) {
      console.warn("[reportUtil] Failed to register font, falling back to Helvetica", e);
      doc.font("Helvetica");
    }
  } else {
    console.warn("[reportUtil] No VN font found. Place a TTF at src/assets/fonts/NotoSans-Regular.ttf or set REPORT_FONT_PATH");
    doc.font("Helvetica");
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    doc.fontSize(18).text("Báo cáo hệ thống", { align: "center" });
    doc.moveDown();

    doc.fontSize(12).text(`Thời gian: ${stats.period?.start ? stats.period.start.toISOString().slice(0, 10) : "Tất cả"} - ${stats.period?.end ? stats.period.end.toISOString().slice(0, 10) : "Tất cả"}`);
    doc.moveDown();

    const addSection = (title: string, obj: any) => {
      doc.fontSize(14).text(title);
      doc.moveDown(0.3);
      Object.keys(obj || {}).forEach((k) => {
        doc.fontSize(11).text(`${k}: ${JSON.stringify(obj[k])}`);
      });
      doc.moveDown();
    };

    addSection("Users", stats.users);
    addSection("Posts", stats.posts);
    addSection("Messages", stats.messages);
    addSection("Notes", stats.notes);
    addSection("Favorites", stats.favorites);
    addSection("Categories", stats.categories);

    doc.end();
  });
}

export async function generateDocxReport(stats: any): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(new Paragraph({ children: [new TextRun({ text: "Báo cáo hệ thống", bold: true, size: 28 })] }));
  children.push(new Paragraph({ children: [new TextRun(`Thời gian: ${stats.period?.start ? stats.period.start.toISOString().slice(0, 10) : "Tất cả"} - ${stats.period?.end ? stats.period.end.toISOString().slice(0, 10) : "Tất cả"}`)] }));

  const addSection = (title: string, obj: any) => {
    children.push(new Paragraph({ children: [new TextRun({ text: title, bold: true })] }));
    Object.keys(obj || {}).forEach((k) => {
      children.push(new Paragraph({ children: [new TextRun(`${k}: ${JSON.stringify(obj[k])}`)] }));
    });
  };

  addSection("Users", stats.users);
  addSection("Posts", stats.posts);
  addSection("Messages", stats.messages);
  addSection("Notes", stats.notes);
  addSection("Reviews", stats.reviews);
  addSection("Favorites", stats.favorites);
  addSection("Categories", stats.categories);

  const doc = new Document({ sections: [{ children }] } as any);

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}