import { CodeGeneratorService } from './code-generator.service';

describe('CodeGeneratorService', () => {
  let service: CodeGeneratorService;

  beforeEach(() => {
    service = new CodeGeneratorService();
  });

  describe('generateSlug', () => {
    it('should generate a slug with default length 10', () => {
      const slug = service.generateSlug();
      expect(slug).toBeDefined();
      expect(slug.length).toBe(10);
      expect(/^[a-zA-Z0-9]+$/.test(slug)).toBe(true);
    });

    it('should generate a slug with custom length', () => {
      const slug = service.generateSlug(16);
      expect(slug.length).toBe(16);
    });
  });

  describe('generateTicketCode', () => {
    it('should generate a ticket code of length 8 without ambiguous characters', () => {
      const code = service.generateTicketCode();
      expect(code).toBeDefined();
      expect(code.length).toBe(8);
      // Verify no ambiguous characters (0, O, 1, I)
      expect(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/.test(code)).toBe(true);
      expect(code).not.toMatch(/[0O1I]/);
    });
  });
});
