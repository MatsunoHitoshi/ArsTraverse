/**
 * Ensure Supabase Storage buckets required by the app exist (idempotent).
 *
 * Usage:
 *   npm run supabase:ensure-buckets
 *
 * Requires local Supabase (`supabase start`) or remote credentials in `.env`.
 * Set SUPABASE_SERVICE_ROLE_KEY for remote projects; locally the key is read via `supabase status`.
 */
import { execSync } from "node:child_process";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { BUCKETS } from "../src/app/_utils/supabase/const";

config();

function isLocalSupabaseUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

function readLocalServiceRoleKeyFromCli(): string | null {
  try {
    const raw = execSync("supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const status = JSON.parse(raw) as { SERVICE_ROLE_KEY?: string };
    return status.SERVICE_ROLE_KEY ?? null;
  } catch {
    return null;
  }
}

function tryResolveServiceRoleKey(supabaseUrl: string): string | null {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  if (isLocalSupabaseUrl(supabaseUrl)) {
    return readLocalServiceRoleKeyFromCli();
  }

  return null;
}

type BucketSpec = {
  id: string;
  public: boolean;
  fileSizeLimitBytes: number;
  allowedMimeTypes: string[];
};

const SCAN_BUCKET: BucketSpec = {
  id: BUCKETS.PATH_TO_INPUT_SCAN,
  public: true,
  fileSizeLimitBytes: 50 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

async function ensureBucketViaSql(db: PrismaClient, spec: BucketSpec) {
  await db.$executeRaw`
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      ${spec.id},
      ${spec.id},
      ${spec.public},
      ${spec.fileSizeLimitBytes},
      ${spec.allowedMimeTypes}::text[]
    )
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types
  `;
}

async function ensureBucketViaApi(
  supabaseUrl: string,
  serviceRoleKey: string,
  spec: BucketSpec,
): Promise<"created" | "exists"> {
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) {
    throw new Error(`Failed to list buckets: ${listError.message}`);
  }

  if (buckets?.some((bucket) => bucket.id === spec.id)) {
    return "exists";
  }

  const { error: createError } = await admin.storage.createBucket(spec.id, {
    public: spec.public,
    fileSizeLimit: spec.fileSizeLimitBytes,
    allowedMimeTypes: spec.allowedMimeTypes,
  });

  if (createError) {
    if (/already exists/i.test(createError.message)) {
      return "exists";
    }
    throw new Error(`Failed to create bucket "${spec.id}": ${createError.message}`);
  }

  return "created";
}

async function ensureStoragePolicies(db: PrismaClient, bucketId: string) {
  const referenceBucket = BUCKETS.PATH_TO_INPUT_TXT;
  const policies = await db.$queryRaw<
    Array<{
      policyname: string;
      cmd: string;
      qual: string | null;
      with_check: string | null;
    }>
  >`
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        COALESCE(qual, '') LIKE ${`%${referenceBucket}%`}
        OR COALESCE(with_check, '') LIKE ${`%${referenceBucket}%`}
      )
  `;

  if (policies.length > 0) {
    for (const policy of policies) {
      const newPolicyName = policy.policyname.replaceAll(referenceBucket, bucketId);
      const qual = policy.qual?.replaceAll(referenceBucket, bucketId) ?? null;
      const withCheck =
        policy.with_check?.replaceAll(referenceBucket, bucketId) ?? null;

      await db.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'storage'
              AND tablename = 'objects'
              AND policyname = '${newPolicyName.replace(/'/g, "''")}'
          ) THEN
            CREATE POLICY "${newPolicyName.replace(/"/g, '""')}"
            ON storage.objects
            FOR ${policy.cmd}
            ${qual ? `USING (${qual})` : ""}
            ${withCheck ? `WITH CHECK (${withCheck})` : ""};
          END IF;
        END $$;
      `);
    }
    return "copied-from-input-txt";
  }

  // Fallback when reference policies are not found (e.g. fresh local stack).
  await db.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'input-scan public read'
      ) THEN
        CREATE POLICY "input-scan public read"
        ON storage.objects FOR SELECT
        USING (bucket_id = '${bucketId}');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'input-scan public insert'
      ) THEN
        CREATE POLICY "input-scan public insert"
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = '${bucketId}');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'input-scan public update'
      ) THEN
        CREATE POLICY "input-scan public update"
        ON storage.objects FOR UPDATE
        USING (bucket_id = '${bucketId}')
        WITH CHECK (bucket_id = '${bucketId}');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'input-scan public delete'
      ) THEN
        CREATE POLICY "input-scan public delete"
        ON storage.objects FOR DELETE
        USING (bucket_id = '${bucketId}');
      END IF;
    END $$;
  `);

  return "default-public-policies";
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set in .env");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in .env");
  }

  const serviceRoleKey = tryResolveServiceRoleKey(supabaseUrl);
  const db = new PrismaClient();

  try {
    let bucketResult: "created" | "exists" | "sql-upserted" = "sql-upserted";

    if (serviceRoleKey) {
      try {
        bucketResult = await ensureBucketViaApi(
          supabaseUrl,
          serviceRoleKey,
          SCAN_BUCKET,
        );
      } catch (apiError) {
        console.warn(
          `[ensure-supabase-storage-buckets] Storage API failed, falling back to SQL: ${
            apiError instanceof Error ? apiError.message : String(apiError)
          }`,
        );
        await ensureBucketViaSql(db, SCAN_BUCKET);
        bucketResult = "sql-upserted";
      }
    } else {
      console.warn(
        "[ensure-supabase-storage-buckets] Service role key unavailable; using SQL upsert. Run `supabase start` or set SUPABASE_SERVICE_ROLE_KEY to use the Storage API.",
      );
      await ensureBucketViaSql(db, SCAN_BUCKET);
    }

    const policyResult = await ensureStoragePolicies(db, SCAN_BUCKET.id);

    console.log(
      `[ensure-supabase-storage-buckets] bucket "${SCAN_BUCKET.id}": ${bucketResult}`,
    );
    console.log(
      `[ensure-supabase-storage-buckets] storage policies: ${policyResult}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ensure-supabase-storage-buckets] ${message}`);
  process.exit(1);
});
