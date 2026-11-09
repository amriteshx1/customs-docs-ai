import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function logError(message: string, error: unknown) {
  const detail = error instanceof Error ? error.message : "Unknown error";
  console.error(JSON.stringify({ level: "error", message, detail }));
}

export function toErrorResponse(error: unknown) {
  if (error instanceof HttpError) {
    const reasons =
      error.details && typeof error.details === "object" && "reasons" in error.details
        ? (error.details as { reasons?: string[] }).reasons
        : undefined;
    return Response.json(
      { error: error.message, ...(reasons ? { reasons } : {}) },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return Response.json(
      { error: issue?.message ?? "Check the entered values.", issues: error.issues },
      { status: 400 },
    );
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    return Response.json({ error: "A shipment with that ID already exists." }, { status: 409 });
  }
  logError("Request failed", error);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

type RouteContext = { params: Promise<Record<string, string>> };

export function api(
  handler: (request: Request, context: RouteContext) => Promise<Response>,
) {
  return async (request: Request, context: RouteContext) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
