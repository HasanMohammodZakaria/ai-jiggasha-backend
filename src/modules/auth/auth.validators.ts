import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address").max(255));

export const registerSchema = z
  .strictObject({
    fullName: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(80, "Name is too long"),
    email,
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password is too long"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const loginSchema = z.strictObject({
  email,
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password is too long"),
});

export const googleSchema = z.strictObject({
  credential: z
    .string()
    .min(20, "Missing Google credential")
    .max(4096, "Invalid Google credential"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleInput = z.infer<typeof googleSchema>;
