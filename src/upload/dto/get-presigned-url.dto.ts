import { IsNotEmpty, IsString, IsIn, Matches } from 'class-validator';

export class GetPresignedUrlDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['avatar', 'club-logo', 'club-cover', 'event-cover', 'event-gallery'], {
    message: 'Invalid upload type',
  })
  type: 'avatar' | 'club-logo' | 'club-cover' | 'event-cover' | 'event-gallery';

  @IsNotEmpty()
  @IsString()
  @Matches(/^image\/(webp|jpeg|png)$/, {
    message: 'Only image/webp, image/jpeg, and image/png MIME types are allowed',
  })
  contentType: string;
}
