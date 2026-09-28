import { ApolloError } from '@apollo/client';

/**
 * Shape of the response body Apollo Client attaches to a network error for
 * non-2xx HTTP responses (ServerError.result). The backend sets an HTTP
 * status on domain errors (400/401/403/404), and Apollo Client surfaces those
 * responses as a networkError — but the server's friendly GraphQL message is
 * still in the parsed body.
 */
interface ServerErrorBody {
  errors?: { message?: string }[];
}

/** Extracts a human-readable message from any thrown GraphQL/network error. */
export function getGraphQLErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (error instanceof ApolloError) {
    // GraphQL errors delivered in a 2xx response.
    const first = error.graphQLErrors?.[0];
    if (first?.message) return first.message;

    // Non-2xx response (e.g. 401 for wrong credentials, 400 for invalid
    // input): read the server's message from the parsed body instead of
    // reporting a misleading "network error".
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
