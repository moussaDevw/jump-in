import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const enableSwagger = !isProduction || process.env.ENABLE_SWAGGER === 'true';

  // 1. Protection des en-têtes HTTP de sécurité
  // En dev (ou si Swagger est actif), on désactive la CSP pour permettre le chargement des assets Swagger UI.
  // En production sans Swagger, la CSP stricte par défaut de Helmet est appliquée.
  app.use(
    helmet({
      contentSecurityPolicy: enableSwagger ? false : undefined,
      crossOriginEmbedderPolicy: isProduction,
    }),
  );

  // 2. Configuration CORS sécurisée
  // En dev : autorise les origines locales (Expo, web, simulateurs).
  // En prod : filtre strictement selon la variable ALLOWED_ORIGINS.
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
    : !isProduction;

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // 3. Préfixe global des routes
  app.setGlobalPrefix('api');

  // 4. Filtre d'exceptions global uniforme
  app.useGlobalFilters(new AllExceptionsFilter());

  // 5. Validation globale stricte des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      disableErrorMessages: isProduction, // En prod : ne fuite pas de détails internes de validation
    }),
  );

  // 6. Documentation Swagger (OpenAPI)
  // Active par défaut en développement. En production, nécessite ENABLE_SWAGGER=true.
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('RunHub / Jump-In API')
      .setDescription(
        'Documentation officielle de toute la plateforme RunHub : authentification, utilisateurs, sports, événements, inscriptions & check-in, galerie, likes/favoris, clubs, feed, recherche, localisation, upload, notifications et activités (Live Tracker).',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Format : Bearer <votre_token_jwt>',
          in: 'header',
        },
        'JWT-auth',
      )
      .addSecurityRequirements('JWT-auth')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      customSiteTitle: 'RunHub API Docs',
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 Application démarrée en mode [${nodeEnv.toUpperCase()}] sur le port ${port}`);
  if (enableSwagger) {
    logger.log(`📖 Documentation Swagger accessible sur : http://localhost:${port}/docs`);
  } else {
    logger.log(`🔒 Documentation Swagger désactivée en production (activez via ENABLE_SWAGGER=true)`);
  }
}
bootstrap();
