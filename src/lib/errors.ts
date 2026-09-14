/**
 * An error whose message is meant for the person using the app (validation,
 * "finish the round first", ...). Server actions turn these into a toast on
 * the page instead of crashing to the error boundary. Anything else is a bug.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
