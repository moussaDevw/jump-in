import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { UsersModule } from './users/users.module';
import { AdminGuard } from './common/guards/admin.guard';
import { SportsModule } from './sports/sports.module';
import { ClubsModule } from './clubs/clubs.module';
import { SearchModule } from './search/search.module';
import { EventsModule } from './events/events.module';
import { UploadModule } from './upload/upload.module';
import { LocationModule } from './location/location.module';
import { FeedModule } from './feed/feed.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ActivitiesModule } from './activities/activities.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,   // 1 second
        limit: 5,    // max 5 requests per second (anti-burst)
      },
      {
        name: 'long',
        ttl: 60000,  // 1 minute
        limit: 100,  // max 100 requests per minute (sustained protection)
      },
    ]),
    CommonModule,
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    SportsModule,
    ClubsModule,
    SearchModule,
    EventsModule,
    UploadModule,
    LocationModule,
    FeedModule,
    NotificationsModule,
    ActivitiesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AdminGuard,
    },
  ],
})
export class AppModule { }
