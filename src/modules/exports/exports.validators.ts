import { z } from "zod";

export const exportIdParamSchema = z.strictObject({ id: z.uuid("Invalid id") });

export const flashcardExportQuerySchema = z.strictObject({
  format: z.enum(["csv", "json"]).default("csv"),
});
