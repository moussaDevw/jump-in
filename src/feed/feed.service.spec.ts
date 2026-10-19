import { Test, TestingModule } from '@nestjs/testing';
import { FeedService } from './feed.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeoSpatialService } from '../common/services/geospatial.service';

describe('FeedService', () => {
  let service: FeedService;
  let prismaService: any;
  let geoSpatialService: GeoSpatialService;

  beforeEach(async () => {
    prismaService = {
      $queryRaw: jest.fn(),
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        GeoSpatialService,
      ],
    }).compile();

    service = module.get<FeedService>(FeedService);
    geoSpatialService = module.get<GeoSpatialService>(GeoSpatialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPublicFeed', () => {
    it('should query and return mapped public feed events with pagination metadata', async () => {
      // First raw query: count
      // Second raw query: events
      prismaService.$queryRaw
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([
          {
            id: 'event-1',
            title: 'Running Session',
            description: 'Morning run in Dakar',
            coverUrl: 'https://cdn.example.com/cover.jpg',
            startsAt: new Date(Date.now() + 86400000),
            endsAt: null,
            venueName: 'Corniche Ouest',
            capacity: 30,
            price: 0,
            currency: 'XOF',
            status: 'published',
            visibility: 'public',
            shareSlug: 'run-dakar-1',
            sportId: 'sport-1',
            clubId: 'club-1',
            organizerId: 'user-1',
            city: 'Dakar',
            country: 'Senegal',
            createdAt: new Date(),
            lat: 14.7167,
            lng: -17.4677,
            sport: { id: 'sport-1', slug: 'running', labelFr: 'Course à pied', color: '#FF5722' },
            club: { id: 'club-1', name: 'Dakar Runners', handle: 'dakarrun', logoUrl: null },
            organizer: { id: 'user-1', username: 'coach_ali', firstName: 'Ali', lastName: 'Diop', avatarUrl: null },
            registrationsCount: 15,
            likesCount: 8,
            favoritesCount: 3,
          },
        ]);

      const result = await service.getPublicFeed({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('event-1');
      expect(result.data[0].coords).toEqual({ lat: 14.7167, lng: -17.4677 });
      expect(result.data[0]._count.registrations).toBe(15);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getNearbyFeed', () => {
    it('should query nearby events and return distances', async () => {
      prismaService.$queryRaw
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([
          {
            id: 'event-nearby',
            title: 'Beach Volleyball',
            lat: 14.7,
            lng: -17.4,
            distance: 1250,
            sport: { id: 'sport-vball', slug: 'volleyball', labelFr: 'Volley-ball' },
            organizer: { id: 'user-2' },
          },
        ]);

      const result = await service.getNearbyFeed({
        lat: 14.7167,
        lng: -17.4677,
        radius: 5000,
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('event-nearby');
      expect(result.data[0].distance).toBe(1250);
      expect(result.meta.radius).toBe(5000);
    });
  });

  describe('getForYouFeed', () => {
    it('should fetch preferences and return personalized feed', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce({
        ecoData: false,
        sports: [{ sportId: 'sport-running' }],
        followedClubs: [{ clubId: 'club-trail' }],
      });

      prismaService.$queryRaw
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([
          {
            id: 'event-foryou',
            title: 'Trail des Almadies',
            lat: 14.72,
            lng: -17.48,
            relevance_score: 2,
            sport: { id: 'sport-running', slug: 'running' },
            organizer: { id: 'user-3' },
          },
        ]);

      const result = await service.getForYouFeed('user-1', { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].relevanceScore).toBe(2);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: {
          ecoData: true,
          sports: { select: { sportId: true } },
          followedClubs: { select: { clubId: true } },
        },
      });
    });
  });
});
