import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface Coordinates {
  lat: number;
  lng: number;
}

@Injectable()
export class GeoSpatialService {
  /**
   * Constructs SQL snippet to set PostGIS SRID 4326 Point geometry.
   */
  formatPointSql(lng: number, lat: number): Prisma.Sql {
    return Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
  }

  /**
   * Safely extracts `{ lat, lng }` coordinates from raw PostGIS query row.
   */
  extractCoordsFromRaw(geoRow: any): Coordinates | null {
    if (
      geoRow &&
      geoRow.lng !== null &&
      geoRow.lng !== undefined &&
      geoRow.lat !== null &&
      geoRow.lat !== undefined
    ) {
      return {
        lat: Number(geoRow.lat),
        lng: Number(geoRow.lng),
      };
    }
    return null;
  }

  /**
   * Builds an ID-to-Coordinates map from a list of raw geo query results.
   * Helps avoid N+1 queries when fetching lists of spatial entities.
   */
  buildCoordsMap(
    geoRows: Array<{ id: string; lat: number | null; lng: number | null }>,
  ): Map<string, Coordinates> {
    const coordsMap = new Map<string, Coordinates>();
    if (!geoRows || !Array.isArray(geoRows)) return coordsMap;

    for (const row of geoRows) {
      if (
        row &&
        row.id &&
        row.lat !== null &&
        row.lat !== undefined &&
        row.lng !== null &&
        row.lng !== undefined
      ) {
        coordsMap.set(row.id, {
          lat: Number(row.lat),
          lng: Number(row.lng),
        });
      }
    }

    return coordsMap;
  }
}
