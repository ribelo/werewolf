import { z } from 'zod';

const sortOrderSchema = z.number().int().min(0).max(999).default(0);
const optionalJsonSchema = z.record(z.any()).nullable().optional();

const ageCategoryCoreFields = {
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
  minAge: z.number().int().min(0).nullable(),
  maxAge: z.number().int().min(0).nullable(),
  metadata: optionalJsonSchema,
} as const;

const weightClassCoreFields = {
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
  minWeight: z.number().min(0).nullable(),
  maxWeight: z.number().min(0).nullable(),
  metadata: optionalJsonSchema,
} as const;

const weightGenderSchema = z.enum(['Male', 'Female']);

const ageCategoryValidation = (value: { minAge: number | null; maxAge: number | null }, ctx: z.RefinementCtx) => {
  if (value.minAge !== null && value.maxAge !== null && value.minAge > value.maxAge) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'minAge cannot be greater than maxAge',
      path: ['minAge'],
    });
  }
};

const weightClassValidation = (value: { minWeight: number | null; maxWeight: number | null }, ctx: z.RefinementCtx) => {
  if (value.minWeight !== null && value.maxWeight !== null && value.minWeight > value.maxWeight) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'minWeight cannot be greater than maxWeight',
      path: ['minWeight'],
    });
  }
};

export const contestAgeCategorySchema = z
  .object({
    id: z.string().uuid(),
    contestId: z.string().uuid(),
    ...ageCategoryCoreFields,
    sortOrder: sortOrderSchema,
  })
  .superRefine(ageCategoryValidation);
export type ContestAgeCategory = z.infer<typeof contestAgeCategorySchema>;

export const contestAgeCategoryInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    contestId: z.string().uuid().optional(),
    ...ageCategoryCoreFields,
    sortOrder: sortOrderSchema.optional(),
  })
  .superRefine(ageCategoryValidation);
export type ContestAgeCategoryInput = z.infer<typeof contestAgeCategoryInputSchema>;

export const contestWeightClassSchema = z
  .object({
    id: z.string().uuid(),
    contestId: z.string().uuid(),
    gender: weightGenderSchema,
    ...weightClassCoreFields,
    sortOrder: sortOrderSchema,
  })
  .superRefine(weightClassValidation);
export type ContestWeightClass = z.infer<typeof contestWeightClassSchema>;

export const contestWeightClassInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    contestId: z.string().uuid().optional(),
    gender: weightGenderSchema,
    ...weightClassCoreFields,
    sortOrder: sortOrderSchema.optional(),
  })
  .superRefine(weightClassValidation);
export type ContestWeightClassInput = z.infer<typeof contestWeightClassInputSchema>;

export const contestCategoryUpsertSchema = z.object({
  ageCategories: z.array(contestAgeCategoryInputSchema).min(1),
  weightClasses: z.array(contestWeightClassInputSchema).min(1),
});
export type ContestCategoryUpsertInput = z.infer<typeof contestCategoryUpsertSchema>;

export const contestCategoryResponseSchema = z.object({
  ageCategories: z.array(contestAgeCategorySchema),
  weightClasses: z.array(contestWeightClassSchema),
});
export type ContestCategoryResponse = z.infer<typeof contestCategoryResponseSchema>;
