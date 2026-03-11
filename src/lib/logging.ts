export function logServerError(context: string, error: unknown) {
  if (error instanceof Error) {
    console.error(`${context}: ${error.name}: ${error.message}`);
    return;
  }

  console.error(`${context}: ${String(error)}`);
}
