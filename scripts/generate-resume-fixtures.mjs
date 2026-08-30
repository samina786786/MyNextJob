import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const outDir = join(process.cwd(), 'tests', 'fixtures');
mkdirSync(outDir, { recursive: true });

const resumeText = [
  'Alex Candidate',
  'Senior Software Engineer',
  '8 years of experience',
  'Skills',
  'React, Next.js, TypeScript, Node.js, C++, C#, .NET, AWS',
];

function pdfEscape(value) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(lines) {
  const content = ['BT /F1 12 Tf 14 TL 72 720 Td'];
  for (const [index, line] of lines.entries()) {
    content.push(`(${pdfEscape(line)}) Tj`);
    if (index < lines.length - 1) content.push('T*');
  }
  content.push('ET');
  const stream = content.join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];

  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += `${object}\n`;
  }
  const xrefStart = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer);
}

writeFileSync(join(outDir, 'resume-sample.pdf'), buildPdf(resumeText));

const src = join(outDir, 'docx-src');
if (existsSync(src)) rmSync(src, { recursive: true, force: true });
mkdirSync(join(src, '_rels'), { recursive: true });
mkdirSync(join(src, 'word', '_rels'), { recursive: true });

writeFileSync(
  join(src, '[Content_Types].xml'),
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
`,
);

writeFileSync(
  join(src, '_rels', '.rels'),
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
`,
);

writeFileSync(
  join(src, 'word', '_rels', 'document.xml.rels'),
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>
`,
);

const paragraphs = resumeText
  .map((line) => `<w:p><w:r><w:t xml:space="preserve">${line}</w:t></w:r></w:p>`)
  .join('');

writeFileSync(
  join(src, 'word', 'document.xml'),
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs}</w:body>
</w:document>
`,
);

const zipPath = join(outDir, 'resume-sample.zip');
const docxPath = join(outDir, 'resume-sample.docx');
if (existsSync(zipPath)) rmSync(zipPath);
if (existsSync(docxPath)) rmSync(docxPath);
const tar = spawnSync('tar', ['-a', '-cf', zipPath, '*'], { cwd: src, shell: true });
if (tar.status !== 0) {
  console.error(tar.stderr.toString() || tar.stdout.toString());
  process.exit(tar.status ?? 1);
}
writeFileSync(docxPath, readFileSync(zipPath));
rmSync(zipPath);
rmSync(src, { recursive: true, force: true });
console.log('Wrote tests/fixtures/resume-sample.pdf and resume-sample.docx');
