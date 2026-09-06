import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SPORTS_DATA = [
  // Course & Athlétisme
  { slug: 'running', labelFr: 'Course à pied', color: '#FF5722' },
  { slug: 'trail', labelFr: 'Trail Running', color: '#8D6E63' },
  { slug: 'marathon', labelFr: 'Marathon', color: '#E64A19' },
  { slug: 'sprint', labelFr: 'Sprint & Athlétisme', color: '#FF7043' },
  { slug: 'triathlon', labelFr: 'Triathlon', color: '#00ACC1' },
  { slug: 'marche-rapide', labelFr: 'Marche sportive', color: '#66BB6A' },

  // Sports collectifs de ballon
  { slug: 'football', labelFr: 'Football', color: '#2E7D32' },
  { slug: 'futsal', labelFr: 'Futsal / Five', color: '#43A047' },
  { slug: 'basketball', labelFr: 'Basketball', color: '#F57C00' },
  { slug: 'streetball', labelFr: 'Streetball 3x3', color: '#EF6C00' },
  { slug: 'volleyball', labelFr: 'Volleyball', color: '#1E88E5' },
  { slug: 'beach-volley', labelFr: 'Beach Volley', color: '#FBC02D' },
  { slug: 'handball', labelFr: 'Handball', color: '#039BE5' },
  { slug: 'rugby', labelFr: 'Rugby', color: '#5D4037' },
  { slug: 'touch-rugby', labelFr: 'Touch Rugby', color: '#795548' },

  // Sports de raquette
  { slug: 'tennis', labelFr: 'Tennis', color: '#CDDC39' },
  { slug: 'padel', labelFr: 'Padel', color: '#00E676' },
  { slug: 'badminton', labelFr: 'Badminton', color: '#26A69A' },
  { slug: 'squash', labelFr: 'Squash', color: '#FFCA28' },
  { slug: 'tennis-de-table', labelFr: 'Tennis de table', color: '#EC407A' },

  // Fitness, Musculation & Bien-être
  { slug: 'musculation', labelFr: 'Musculation / Gym', color: '#37474F' },
  { slug: 'crossfit', labelFr: 'CrossFit', color: '#212121' },
  { slug: 'fitness', labelFr: 'Fitness & Cardio', color: '#E91E63' },
  { slug: 'calisthenics', labelFr: 'Street Workout', color: '#455A64' },
  { slug: 'yoga', labelFr: 'Yoga', color: '#9C27B0' },
  { slug: 'pilates', labelFr: 'Pilates', color: '#AB47BC' },
  { slug: 'stretching', labelFr: 'Stretching & Mobilité', color: '#BA68C8' },

  // Sports de combat & Arts martiaux
  { slug: 'boxe-anglaise', labelFr: 'Boxe Anglaise', color: '#D32F2F' },
  { slug: 'boxe-thai', labelFr: 'Muay Thaï / Boxe Thaï', color: '#C62828' },
  { slug: 'mma', labelFr: 'MMA', color: '#B71C1C' },
  { slug: 'judo', labelFr: 'Judo', color: '#1565C0' },
  { slug: 'jiu-jitsu', labelFr: 'Jiu-Jitsu Brésilien (JJB)', color: '#0D47A1' },
  { slug: 'karate', labelFr: 'Karaté', color: '#424242' },
  { slug: 'taekwondo', labelFr: 'Taekwondo', color: '#1976D2' },

  // Cyclisme & Glisse urbaine
  { slug: 'cyclisme-route', labelFr: 'Vélo de route', color: '#0288D1' },
  { slug: 'vtt', labelFr: 'VTT', color: '#388E3C' },
  { slug: 'gravel', labelFr: 'Gravel', color: '#689F38' },
  { slug: 'roller', labelFr: 'Roller & Roller Derby', color: '#F06292' },
  { slug: 'skate', labelFr: 'Skate / Longboard', color: '#78909C' },

  // Natation & Sports nautiques
  { slug: 'natation', labelFr: 'Natation', color: '#0277BD' },
  { slug: 'surf', labelFr: 'Surf', color: '#0097A7' },
  { slug: 'kitesurf', labelFr: 'Kitesurf', color: '#00838F' },
  { slug: 'paddle', labelFr: 'Stand Up Paddle (SUP)', color: '#26C6DA' },
  { slug: 'aviron', labelFr: 'Aviron & Canoë', color: '#006064' },

  // Outdoor & Aventure
  { slug: 'randonnee', labelFr: 'Randonnée & Trek', color: '#558B2F' },
  { slug: 'escalade', labelFr: 'Escalade / Bloc', color: '#AFB42B' },
  { slug: 'alpinisme', labelFr: 'Alpinisme', color: '#78909C' },

  // Danse & Autre
  { slug: 'danse', labelFr: 'Danse / Zumba', color: '#EC407A' },
  { slug: 'golf', labelFr: 'Golf', color: '#2E7D32' },
  { slug: 'equitation', labelFr: 'Équitation', color: '#6D4C41' },
  { slug: 'petanque', labelFr: 'Pétanque / Mölkky', color: '#A1887F' },
];

async function main() {
  console.log('🌱 Démarrage du seed des sports...');

  for (const sport of SPORTS_DATA) {
    const created = await prisma.sport.upsert({
      where: { slug: sport.slug },
      update: {
        labelFr: sport.labelFr,
        color: sport.color,
      },
      create: {
        slug: sport.slug,
        labelFr: sport.labelFr,
        color: sport.color,
      },
    });
    console.log(`✅ Sport synchronisé : ${created.labelFr} (${created.slug})`);
  }

  console.log(`\n🎉 Seed terminé avec succès ! ${SPORTS_DATA.length} sports sont disponibles.`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors du seed :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
