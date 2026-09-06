import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LocationService {
  private readonly apiKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY') || process.env.GOOGLE_MAPS_API_KEY;
  }

  /**
   * Search place suggestions using Google Places Autocomplete API
   */
  async autocomplete(input: string) {
    if (!input || input.trim().length === 0) {
      return [];
    }

    if (!this.apiKey) {
      throw new HttpException(
        'Google Maps API Key is not configured on the server',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      // Restrict autocomplete to Senegal (country:sn) to keep search focused on Dakar/Senegal
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        input,
      )}&key=${this.apiKey}&components=country:sn&language=fr`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new HttpException(
          `Google API Error: ${data.error_message || data.status}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const predictions = data.predictions || [];
      return predictions.map((p: any) => ({
        placeId: p.place_id,
        description: p.description,
        mainText: p.structured_formatting?.main_text || p.description,
        secondaryText: p.structured_formatting?.secondary_text || '',
      }));
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        `Failed to query Google Places: ${err.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Fetch place coordinates and location details using Google Places Details API
   */
  async getDetails(placeId: string) {
    if (!placeId) {
      throw new HttpException('placeId is required', HttpStatus.BAD_REQUEST);
    }

    if (!this.apiKey) {
      throw new HttpException(
        'Google Maps API Key is not configured on the server',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${this.apiKey}&fields=place_id,name,formatted_address,geometry,address_components&language=fr`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK') {
        throw new HttpException(
          `Google API Error: ${data.error_message || data.status}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = data.result;
      const coords = result.geometry?.location;
      const components = result.address_components || [];

      let formattedAddress = result.formatted_address || '';
      if (result.name && !formattedAddress.includes(result.name)) {
        formattedAddress = `${result.name}, ${formattedAddress}`;
      }

      const getComponent = (types: string[]) => {
        const comp = components.find((c: any) =>
          c.types.some((t: string) => types.includes(t)),
        );
        return comp ? comp.long_name : null;
      };

      const city =
        getComponent(['locality', 'sublocality']) ||
        getComponent(['administrative_area_level_1', 'administrative_area_level_2']) ||
        'Dakar';

      const country = getComponent(['country']) || 'Sénégal';

      return {
        placeId: result.place_id,
        formattedAddress,
        latitude: coords ? coords.lat : 14.7167,
        longitude: coords ? coords.lng : -17.4677,
        city,
        country,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        `Failed to fetch Google Place details: ${err.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
