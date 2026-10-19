import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Une erreur interne est survenue sur le serveur';
    let errors: string[] | undefined = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const respObj = exceptionResponse as Record<string, any>;
        if (Array.isArray(respObj.message)) {
          message = respObj.message[0] || 'Erreur de validation';
          errors = respObj.message;
        } else if (typeof respObj.message === 'string') {
          message = respObj.message;
        } else if (typeof respObj.error === 'string') {
          message = respObj.error;
        }
      }
    } else if (
      exception &&
      typeof exception === 'object' &&
      'code' in exception
    ) {
      // Gestion des erreurs Prisma courantes sans fuiter de schéma interne
      const prismaError = exception as { code: string; meta?: any };
      if (prismaError.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Cette ressource existe déjà (conflit d\'unicité).';
      } else if (prismaError.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'La ressource demandée est introuvable.';
      } else {
        this.logger.error(
          `Erreur Prisma non gérée [${prismaError.code}]: ${JSON.stringify(exception)}`,
        );
      }
    } else {
      const err = exception as Error;
      this.logger.error(
        `Exception inattendue sur ${request.method} ${request.url}: ${err?.message || exception}`,
        err?.stack,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
