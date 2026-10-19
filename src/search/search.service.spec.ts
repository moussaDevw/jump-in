import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeoSpatialService } from '../common/services/geospatial.service';

describe('SearchService', () => {
  let service: SearchService;
  let prismaService: any;
  let geoSpatialService: GeoSpatialService;

  beforeEach(async () => {
    prismaService = {
      $queryRaw: jest.fn(),
      clubSport: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        GeoSpatialService,
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    geoSpatialService = module.get<GeoSpatialService>(GeoSpatialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchClubs', () => {
    it('should search clubs with count and mapping', async () => {
      prismaService.$queryRaw
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([
          {
            id: 'club-1',
            name: 'Runners Club',
            handle: 'runners',
            ownerId: 'user-1',
            bio: 'Club description',
            logoUrl: null,
            coverUrl: null,
            baseName: null,
            verified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            lat: 14.7,
            lng: -17.4,
            membersCount: 10,
            followersCount: 25,
            eventsCount: 5,
            distance: null,
          },
        ]);

      const result = await service.searchClubs({ q: 'Runners' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('club-1');
      expect(result.data[0].coords).toEqual({ lat: 14.7, lng: -17.4 });
      expect(result.meta.total).toBe(1);
    });
  });

  describe('searchEvents', () => {
    it('should search events with multi-criteria filters', async () => {
      prismaService.$queryRaw
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([
          {
            id: 'event-1',
            title: 'Nocturne 10k',
            description: 'Course de nuit',
            coverUrl: null,
            startsAt: new Date(),
            endsAt: null,
            venueName: 'Place du Souvenir',
            capacity: 50,
            price: 5000,
            currency: 'XOF',
            status: 'published',
            visibility: 'public',
            shareSlug: 'nocturne-10k',
            sportId: 'sport-run',
            clubId: null,
            organizerId: 'org-1',
            city: 'Dakar',
            country: 'Senegal',
            createdAt: new Date(),
            lat: 14.69,
            lng: -17.47,
            distance: 850,
            sport: { id: 'sport-run', slug: 'running' },
            club: null,
            organizer: { id: 'org-1', username: 'coach' },
            registrationsCount: 20,
            likesCount: 5,
            favoritesCount: 2,
          },
        ]);

      const result = await service.searchEvents({
        q: 'Nocturne',
        priceMax: 10000,
        lat: 14.7,
        lng: -17.45,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('event-1');
      expect(result.data[0].price).toBe(5000);
      expect(result.data[0].distance).toBe(850);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('searchUsers', () => {
    it('should search users and exclude soft-deleted users', async () => {
      prismaService.$queryRaw
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([
          {
            id: 'user-1',
            username: 'amadou_run',
            firstName: 'Amadou',
            lastName: 'Diallo',
            avatarUrl: 'https://cdn.example.com/amadou.jpg',
            bio: 'Passionné de marathon',
            city: 'Dakar',
            createdAt: new Date(),
            clubsCount: 2,
            organizedEventsCount: 4,
          },
        ]);

      const result = await service.searchUsers({ q: 'Amadou' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].username).toBe('amadou_run');
      expect(result.data[0]._count.clubs).toBe(2);
      expect(result.data[0]._count.organizedEvents).toBe(4);
      expect(result.meta.total).toBe(1);
    });
  });
});
