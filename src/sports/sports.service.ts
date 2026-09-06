import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSportDto } from './dto/create-sport.dto';
import { UpdateSportDto } from './dto/update-sport.dto';

@Injectable()
export class SportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Slugify helper function.
   */
  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
  }

  /**
   * Retrieves all sports in alphabetical order.
   */
  async findAll() {
    return this.prisma.sport.findMany({
      orderBy: {
        labelFr: 'asc',
      },
    });
  }

  /**
   * Creates a new sport.
   */
  async create(dto: CreateSportDto) {
    const slug = this.slugify(dto.labelFr);

    // Check slug uniqueness
    const existing = await this.prisma.sport.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new ConflictException(`Sport with label "${dto.labelFr}" already exists`);
    }

    return this.prisma.sport.create({
      data: {
        labelFr: dto.labelFr,
        slug,
        color: dto.color,
      },
    });
  }

  /**
   * Updates an existing sport.
   */
  async update(id: string, dto: UpdateSportDto) {
    const sport = await this.prisma.sport.findUnique({
      where: { id },
    });
    if (!sport) {
      throw new NotFoundException('Sport not found');
    }

    const dataToUpdate: any = { ...dto };

    if (dto.labelFr && dto.labelFr !== sport.labelFr) {
      const slug = this.slugify(dto.labelFr);
      // Check slug uniqueness for new label
      const existing = await this.prisma.sport.findUnique({
        where: { slug },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Sport with label "${dto.labelFr}" already exists`);
      }
      dataToUpdate.slug = slug;
    }

    return this.prisma.sport.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  /**
   * Deletes a sport if it is not linked to any users, clubs, or events.
   */
  async delete(id: string) {
    const sport = await this.prisma.sport.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            clubs: true,
            events: true,
          },
        },
      },
    });

    if (!sport) {
      throw new NotFoundException('Sport not found');
    }

    // Check references
    if (
      sport._count.users > 0 ||
      sport._count.clubs > 0 ||
      sport._count.events > 0
    ) {
      throw new BadRequestException(
        'Cannot delete sport because it is currently linked to users, clubs, or events.',
      );
    }

    await this.prisma.sport.delete({
      where: { id },
    });

    return { success: true };
  }
}
