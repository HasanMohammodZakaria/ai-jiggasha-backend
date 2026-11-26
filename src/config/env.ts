import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

// An optional key left empty in .env counts as "not set".
const optionalKey = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(10).optional(),
);

// Providers that can answer questions. Add a new name here when a new provider is supported.
const answerProviders = ["groq", "openrouter", "mistral"] as const;

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    FRONTEND_ORIGIN: z.url(),
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(120)
      .default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    AVATAR_MAX_MB: z.coerce.number().min(0.1).max(10).default(2),
    DOCUMENT_MAX_MB: z.coerce.number().min(1).max(25).default(10),
    GOOGLE_CLIENT_ID: z
      .string()
      .regex(
        /\.apps\.googleusercontent\.com$/,
        "must end with .apps.googleusercontent.com",
      ),
    BREVO_API_KEY: z.string().min(10),
    EMAIL_FROM_ADDRESS: z.email(),
    EMAIL_FROM_NAME: z.string().min(1).default("Jiggasha"),
    PASSWORD_RESET_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(120)
      .default(15),

    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),

    // Embeddings: Gemini only, no fallback (vectors from different models cannot be mixed).
    GEMINI_API_KEY: z.string().min(10),
    EMBEDDING_MODEL: z.string().min(1).default("gemini-embedding-001"),
    EMBEDDING_MAX_RPM: z.coerce.number().int().min(1).default(60),
    EMBEDDING_MAX_TPM: z.coerce.number().int().min(1000).default(25000),
    EMBEDDING_DAILY_BUDGET: z.coerce.number().int().min(1).default(850),
    MAX_PAGES_PER_DOCUMENT: z.coerce.number().int().min(1).default(150),
    MAX_CHUNKS_PER_DOCUMENT: z.coerce.number().int().min(1).default(400),

    // Answers: free-tier providers tried in the order of ANSWER_FALLBACK_ORDER.
    // Model names change often: check each provider's site for current names.
    GROQ_API_KEY: optionalKey,
    GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
    OPENROUTER_API_KEY: optionalKey,
    OPENROUTER_MODEL: z.string().min(1).default("google/gemma-3-27b-it:free"),
    MISTRAL_API_KEY: optionalKey,
    MISTRAL_MODEL: z.string().min(1).default("mistral-small-latest"),
    ANSWER_FALLBACK_ORDER: z
      .string()
      .default("groq,openrouter,mistral")
      .transform((value) =>
        value
          .split(",")
          .map((name) => name.trim().toLowerCase())
          .filter((name) => name.length > 0),
      )
      .pipe(z.array(z.enum(answerProviders)).min(1)),

    RAG_TOP_K: z.coerce.number().int().min(1).max(12).default(6),
    RAG_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.55),
  })
  .refine((v) => v.JWT_ACCESS_SECRET !== v.JWT_REFRESH_SECRET, {
    path: ["JWT_REFRESH_SECRET"],
    message: "must be different from JWT_ACCESS_SECRET",
  })
  .refine(
    (v) =>
      v.ANSWER_FALLBACK_ORDER.some(
        (name) =>
          (name === "groq" && v.GROQ_API_KEY) ||
          (name === "openrouter" && v.OPENROUTER_API_KEY) ||
          (name === "mistral" && v.MISTRAL_API_KEY),
      ),
    {
      path: ["ANSWER_FALLBACK_ORDER"],
      message: "no API key is set for any provider in this list",
    },
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print only variable names and messages, never the values.
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.map(String).join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
