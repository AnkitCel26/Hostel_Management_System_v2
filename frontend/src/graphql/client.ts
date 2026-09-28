import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  from,
  fromPromise
} from '@apollo/client';
import { onError } from '@apollo/client/link/error';

const GRAPHQL_URL =
  (import.meta.env.VITE_GRAPHQL_URL as string | undefined) ??
  'http://localhost:4001/graphql';

// Operations that must never trigger a silent refresh + retry.
const NO_REFRESH_OPERATIONS = new Set(['Login', 'Register', 'RefreshToken', 'Logout']);

let refreshInFlight: Promise<boolean> | null = null;

/** Raw refresh call — avoids a circular client reference inside the error link. */
async function requestRefresh(): Promise<boolean> {
  try {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query: 'mutation RefreshToken { refreshToken { id } }' })
    });
    const body = (await response.json()) as {
      data?: { refreshToken?: { id: string } | null };
    } | null;
    return Boolean(body?.data?.refreshToken);
  } catch {
    return false;
  }
}

/**
 * On UNAUTHENTICATED (e.g. expired access token): silently refreshes the
 * session via the refresh cookie and retries the original operation once.
 * A second failure surfaces the error to the UI. Single-flight: concurrent
 * failures share one refresh request.
 */
const errorLink = onError(({ graphQLErrors, operation, forward }) => {
  const isUnauthenticated = (graphQLErrors ?? []).some(
    (error) => error.extensions?.code === 'UNAUTHENTICATED'
  );
  if (!isUnauthenticated || !forward) {
    return;
  }

  const { retriedAuthRefresh } = operation.getContext() as { retriedAuthRefresh?: boolean };
  if (retriedAuthRefresh || NO_REFRESH_OPERATIONS.has(operation.operationName)) {
    return;
  }
  operation.setContext({ retriedAuthRefresh: true });

  refreshInFlight ??= requestRefresh().finally(() => {
    refreshInFlight = null;
  });

  return fromPromise(refreshInFlight).flatMap(() => forward(operation));
});

const httpLink = new HttpLink({
  uri: GRAPHQL_URL,
  credentials: 'include'
});

export const apolloClient = new ApolloClient({
  link: from([errorLink, httpLink]),
  cache: new InMemoryCache()
});
