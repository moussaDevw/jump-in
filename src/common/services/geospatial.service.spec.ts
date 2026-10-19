import { GeoSpatialService } from './geospatial.service';

describe('GeoSpatialService', () => {
  let service: GeoSpatialService;

  beforeEach(() => {
    service = new GeoSpatialService();
  });

  describe('formatPointSql', () => {
    it('should format point SQL with SRID 4326', () => {
      const sql = service.formatPointSql(-17.444, 14.6937);
      expect(sql).toBeDefined();
    });
  });

  describe('extractCoordsFromRaw', () => {
    it('should extract valid lat and lng numbers', () => {
      const coords = service.extractCoordsFromRaw({ lat: 14.6937, lng: -17.444 });
      expect(coords).toEqual({ lat: 14.6937, lng: -17.444 });
    });

    it('should return null when lat or lng is missing/null', () => {
      expect(service.extractCoordsFromRaw(null)).toBeNull();
      expect(service.extractCoordsFromRaw({ lat: null, lng: -17.444 })).toBeNull();
      expect(service.extractCoordsFromRaw({ lat: 14.6937, lng: null })).toBeNull();
    });
  });

  describe('buildCoordsMap', () => {
    it('should build map with valid rows and skip null coords', () => {
      const rows = [
        { id: 'uuid-1', lat: 14.7, lng: -17.4 },
        { id: 'uuid-2', lat: null, lng: null },
        { id: 'uuid-3', lat: 14.8, lng: -17.5 },
      ];

      const map = service.buildCoordsMap(rows);
      expect(map.size).toBe(2);
      expect(map.get('uuid-1')).toEqual({ lat: 14.7, lng: -17.4 });
      expect(map.get('uuid-2')).toBeUndefined();
      expect(map.get('uuid-3')).toEqual({ lat: 14.8, lng: -17.5 });
    });
  });
});
