/** أخطاء المجال — كلها تحمل رمز حالة HTTP لتُترجَم مباشرة في طبقة الـ API */

export class DomainError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DomainError";
    this.status = status;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} غير موجود: ${id}`, 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends DomainError {
  readonly fields: Record<string, string>;
  constructor(fields: Record<string, string>, message?: string) {
    const detail = Object.values(fields).join("، ");
    super(message ?? `بيانات غير صالحة: ${detail}`, 422);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409);
    this.name = "ConflictError";
  }
}

export function statusOf(err: unknown): number {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === "number") return s;
  }
  return 500;
}
