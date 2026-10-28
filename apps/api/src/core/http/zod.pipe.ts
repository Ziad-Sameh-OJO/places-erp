import { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/** Validates and normalises a request body/query with the shared schema from @places/contracts. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
