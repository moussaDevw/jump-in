import { IsNotEmpty, IsString } from 'class-validator';

export class ScanTicketDto {
  @IsNotEmpty()
  @IsString()
  ticketCode: string;
}
