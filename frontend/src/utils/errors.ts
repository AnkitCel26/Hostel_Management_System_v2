import { ApolloError } from '@apollo/client';

interface ServerErrorBody {
  errors?: { message?: string }[];
}

/** Extracts a human-readable message from any thrown GraphQL/network error. */
export function getGraphQLErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (error instanceof ApolloError) {
    const first = error.graphQLErrors?.[0];
    if (first?.message) return first.message;

    const body = (error.networkError as (Error & { result?: ServerErrorBody }) | null)?.result;
    const bodyMessage = body?.errors?.[0]?.message;
    if (typeof bodyMessage === 'string' && bodyMessage.length > 0) {
      return bodyMessage;
    }

    // Genuine connectivity failure (server unreachable, request aborted, …).
    if (error.networkError) {
      return 'Could not reach the server. Check your connection and try again.';
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
