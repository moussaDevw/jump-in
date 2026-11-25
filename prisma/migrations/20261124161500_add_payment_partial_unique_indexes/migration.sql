-- 1. Supprimer la table inutilisée payment_methods et la colonne payment_method_id
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_payment_method_id_fkey";
DROP INDEX IF EXISTS "payments_payment_method_id_idx";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "payment_method_id";
DROP TABLE IF EXISTS "payment_methods";

-- 2. Aligner l'enum PaymentProvider sur les identifiants Bictorys : ('wave_money', 'orange_money', 'card')
ALTER TYPE "PaymentProvider" RENAME TO "PaymentProvider_old";
CREATE TYPE "PaymentProvider" AS ENUM ('wave_money', 'orange_money', 'card');
ALTER TABLE "payments"
  ALTER COLUMN "provider" TYPE "PaymentProvider"
  USING (
    CASE "provider"::text
      WHEN 'wave' THEN 'wave_money'::"PaymentProvider"
      WHEN 'wave_money' THEN 'wave_money'::"PaymentProvider"
      WHEN 'orange_money' THEN 'orange_money'::"PaymentProvider"
      WHEN 'card' THEN 'card'::"PaymentProvider"
      ELSE 'wave_money'::"PaymentProvider"
    END
  );
DROP TYPE "PaymentProvider_old";

-- 3. Garantir au niveau PostgreSQL un seul paiement en statut 'success' par inscription (Registration)
CREATE UNIQUE INDEX IF NOT EXISTS "payments_one_success_per_registration_idx"
ON "payments" ("registration_id")
WHERE "status" = 'success';
