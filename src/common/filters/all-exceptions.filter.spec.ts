import { AllExceptionsFilter } from './all-exceptions.filter';
import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('should format HttpException properly', () => {
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    const hostMock = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({ url: '/api/events', method: 'GET' }),
      }),
    } as unknown as ArgumentsHost;

    const exception = new BadRequestException('Invalid date format');

    filter.catch(exception, hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid date format',
        path: '/api/events',
      }),
    );
  });

  it('should handle Prisma P2002 conflict error without leaking SQL', () => {
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    const hostMock = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({ url: '/api/users/profile', method: 'POST' }),
      }),
    } as unknown as ArgumentsHost;

    const prismaError = { code: 'P2002', meta: { target: ['email'] } };

    filter.catch(prismaError, hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.CONFLICT,
        path: '/api/users/profile',
      }),
    );
  });

  it('should handle unknown errors with 500 status', () => {
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    const hostMock = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({ url: '/api/test', method: 'GET' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new Error('Unexpected database failure'), hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Une erreur interne est survenue sur le serveur',
      }),
    );
  });
});
