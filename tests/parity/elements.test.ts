// P2-02 — Layout-aware parsed elements: heading/table/image/page coordinates
// and blob refs. Covers the pure extractor and the element service (images,
// tables, OCR) with the repository mocked.
import { describe, it, expect, vi } from 'vitest';

const { extractElements } = await import('../../backend/parser/elements.js');

// ---- Mock repositories + parser (hoisted so the service import sees them) ----
const mocks = vi.hoisted(() => ({
  saveElements: vi.fn(),
  listByDocument: vi.fn(),
  findDocumentById: vi.fn(),
  isAvailable: vi.fn(),
  parseFile: vi.fn(),
}));

vi.mock('../../backend/repositories/document-element.repository.js', () => ({
  documentElementRepository: {
    saveElements: mocks.saveElements,
    listByDocument: mocks.listByDocument,
  },
}));
vi.mock('../../backend/repositories/knowledge.repository.js', () => ({
  knowledgeRepository: { findDocumentById: mocks.findDocumentById },
}));
vi.mock('../../backend/parser/factory.js', () => ({
  getParser: () => ({ isAvailable: mocks.isAvailable, parseFile: mocks.parseFile }),
}));

const { elementService } = await import('../../backend/services/element.service.js');

// ---- Extractor (pure) ----
describe('P2-02 element extractor', () => {
  it('extracts headings with level and line coordinates', () => {
    const md = '# Title\n\n## Section\nbody\n';
    const els = extractElements(md);
    const headings = els.filter((e) => e.type === 'heading');
    expect(headings).toHaveLength(2);
    expect(headings[0].content).toMatchObject({ level: 1, text: 'Title' });
    expect(headings[0].startLine).toBe(1);
    expect(headings[1].content).toMatchObject({ level: 2, text: 'Section' });
    expect(headings[1].startLine).toBe(3);
  });

  it('extracts a markdown table with headers and rows', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n';
    const tables = extractElements(md).filter((e) => e.type === 'table');
    expect(tables).toHaveLength(1);
    expect(tables[0].content).toMatchObject({
      headers: ['A', 'B'],
      rows: [['1', '2'], ['3', '4']],
    });
    expect(tables[0].startLine).toBe(1);
    expect(tables[0].endLine).toBe(4);
  });

  it('extracts images with blob refs (markdown + bare /api/images/)', () => {
    const md = '![logo](/api/images/img_1.png)\n\n/api/images/img_2.png\n';
    const images = extractElements(md).filter((e) => e.type === 'image');
    expect(images).toHaveLength(2);
    expect(images[0].content).toMatchObject({ src: '/api/images/img_1.png', alt: 'logo' });
    expect(images[1].content).toMatchObject({ src: '/api/images/img_2.png', alt: '' });
  });

  it('skips data: URIs (not blob refs)', () => {
    const md = '![x](data:image/png;base64,AAAA)\n';
    const images = extractElements(md).filter((e) => e.type === 'image');
    expect(images).toHaveLength(0);
  });

  it('extracts page markers', () => {
    const md = 'text\n\n[Page 2]\n\n<!-- page: 3 -->\n';
    const pages = extractElements(md).filter((e) => e.type === 'page');
    expect(pages).toHaveLength(2);
    expect(pages[0].content).toEqual({ pageNumber: 2 });
    expect(pages[1].content).toEqual({ pageNumber: 3 });
  });

  it('assigns monotonic positions in document order', () => {
    const md = '# H\n\n| A |\n| --- |\n| 1 |\n\n![i](/api/images/x.png)\n';
    const els = extractElements(md);
    expect(els.map((e) => e.type)).toEqual(['heading', 'table', 'image']);
    expect(els.map((e) => e.position)).toEqual([0, 1, 2]);
  });
});

// ---- Element service (mocked repo) ----
describe('P2-02 element service', () => {
  it('extractAndSave persists extracted elements', async () => {
    mocks.saveElements.mockResolvedValue(undefined);
    const count = await elementService.extractAndSave(1, '# H\n\n| A |\n| --- |\n| 1 |\n');
    expect(count).toBe(2); // heading + table
    expect(mocks.saveElements).toHaveBeenCalledWith(1, expect.any(Array));
  });

  it('listImages maps image elements to items', async () => {
    mocks.listByDocument.mockResolvedValue([
      { id: 1, document_id: 1, element_type: 'image', position: 0, content: { src: '/api/images/a.png', alt: 'A' }, start_char: 0, end_char: 10, start_line: 1, end_line: 1, created_at: 'x' },
    ]);
    const result = await elementService.listImages(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ src: '/api/images/a.png', alt: 'A' });
    expect(mocks.listByDocument).toHaveBeenCalledWith(1, 'image');
  });

  it('listTables maps table elements to structured rows', async () => {
    mocks.listByDocument.mockResolvedValue([
      { id: 1, document_id: 1, element_type: 'table', position: 0, content: { headers: ['A'], rows: [['1']], raw: '| A |' }, start_char: 0, end_char: 5, start_line: 1, end_line: 1, created_at: 'x' },
    ]);
    const result = await elementService.listTables(1);
    expect(result.items[0]).toMatchObject({ headers: ['A'], rows: [['1']] });
  });

  it('ocr returns no_images when the document has none', async () => {
    mocks.findDocumentById.mockResolvedValue({ id: 1 });
    mocks.listByDocument.mockResolvedValue([]);
    const result = await elementService.ocr(1);
    expect(result.ocr_status).toBe('no_images');
  });

  it('ocr returns missing for unresolvable image files', async () => {
    mocks.findDocumentById.mockResolvedValue({ id: 1 });
    mocks.listByDocument.mockResolvedValue([
      { id: 1, document_id: 1, element_type: 'image', position: 0, content: { src: '/api/images/nope.png' }, start_char: 0, end_char: 0, start_line: 1, end_line: 1, created_at: 'x' },
    ]);
    const result = await elementService.ocr(1);
    expect(result.ocr_status).toBe('partial');
    expect(result.images[0].status).toBe('missing');
  });

  it('ocr throws resource_not_found for an unknown document', async () => {
    mocks.findDocumentById.mockResolvedValue(undefined);
    await expect(elementService.ocr(999)).rejects.toMatchObject({ kind: 'resource_not_found' });
  });
});
